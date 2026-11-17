import { and, eq, gte, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { proposalCgpaGate, type CgpaGate } from "@/lib/cgpa-verification";
import { payableCheckout } from "@/lib/employer-payable";
import { parseOffer, type Offer } from "@/lib/offer";
import { orderProposalIds } from "@/lib/order-ids";
import { OPEN_ORDER_MINUTES } from "@/lib/payments";
import { counterRow, offerState, type OfferState } from "@/components/employer/proposal-state";
import { hireFlowFrom, type HireFlowCounts } from "@/components/employer/proposal-bucket";

type Db = ReturnType<typeof getDb>;

/** Proposal ids with an unpaid payment order open right now: an open order freezes expiry (an order that settles hires). One query, not one per proposal. */
export async function openOrderProposalIds(db: Db, employerId: string): Promise<Set<string>> {
  const rows = await db
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.employerId, employerId),
        eq(schema.employerPayments.status, "created"),
        gte(schema.employerPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
      ),
    )
    .catch(() => []);
  return new Set(rows.flatMap((r) => orderProposalIds(r.raw)));
}

/** The intern's `extra_data` per intern id, server-side only: the CGPA gate is derived from it and only the derived gate leaves the server. */
export async function internExtraData(db: Db, internIds: string[]): Promise<Map<string, unknown>> {
  if (internIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(inArray(schema.internOnboarding.userId, [...new Set(internIds)]));
  return new Map(rows.map((r) => [r.userId, r.extraData]));
}

type StateRow = { id: string; internId: string; status: string; hiredAt: Date | string | null; updatedAt?: Date | string | null; offerDetails: unknown; currency?: string | null };

/** What `offerState` needs besides the row: whether an order is open for it and where the intern's CGPA check stands. */
export type StateContext = { openOrders: Set<string>; extraByIntern: Map<string, unknown> };

/** One proposal's state, with the CGPA gate and the open-order freeze applied. The single entry point for every counting screen. */
export function stateForRow(row: StateRow, ctx: StateContext, now: Date = new Date()): { offer: Offer; state: OfferState; gate: CgpaGate } {
  const offer = parseOffer(row.offerDetails, row.currency);
  const gate = proposalCgpaGate({ status: row.status, extraData: ctx.extraByIntern.get(row.internId), offerDetails: row.offerDetails, updatedAt: row.updatedAt }, now);
  const state = offerState({ status: row.status, hiredAt: row.hiredAt, offerDetails: row.offerDetails, hasOpenOrder: ctx.openOrders.has(row.id), gate }, offer, now);
  return { offer, state, gate };
}

export type FlowProposal = {
  id: string;
  internId: string;
  projectId: string;
  projectName: string | null;
  status: string;
  offer: Offer;
  state: OfferState;
  /** Server-side only (initials for display): never passed to a client component. */
  firstName: string | null;
  lastName: string | null;
  viewOnly: boolean;
};

/** Every proposal of this employer, classified. */
export async function loadFlowProposals(employerId: string, now: Date = new Date()): Promise<FlowProposal[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.proposals.id,
      internId: schema.proposals.internId,
      projectId: schema.proposals.projectId,
      status: schema.proposals.status,
      hiredAt: schema.proposals.hiredAt,
      updatedAt: schema.proposals.updatedAt,
      offerDetails: schema.proposals.offerDetails,
      currency: schema.proposals.currency,
      projectName: schema.projects.projectName,
      downAt: schema.projects.takenDownAt,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.proposals)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .where(eq(schema.proposals.employerId, employerId));
  const ctx: StateContext = { openOrders: await openOrderProposalIds(db, employerId), extraByIntern: await internExtraData(db, rows.map((r) => r.internId)) };
  return rows.map((r) => {
    const { offer, state } = stateForRow(r, ctx, now);
    return { id: r.id, internId: r.internId, projectId: r.projectId, projectName: r.projectName ?? null, status: r.status, offer, state, firstName: r.firstName, lastName: r.lastName, viewOnly: Boolean(r.downAt) };
  });
}

/** Accepted offers that cannot be paid now: CGPA being confirmed, or expired. Checkout drops their lines (WP3's payableCheckout does the same server-side). */
export function heldIds(rows: { id: string; state: OfferState }[]): Set<string> {
  return new Set(rows.filter((r) => r.state.verifying || r.state.expiredReason === "unpaid_past_start").map((r) => r.id));
}

/**
 * Where this company's candidates stand, for the cart → checkout strip.
 * `toPay` comes from the caller (the checkout's own payable lines), so the
 * strip and the page below it can never disagree.
 */
export async function hireFlowCounts(employerId: string, toPay: number, loaded?: FlowProposal[]): Promise<HireFlowCounts> {
  const db = getDb();
  const [cart, proposals] = await Promise.all([
    db
      .select({ internId: schema.employerCartItems.internId })
      .from(schema.employerCartItems)
      .where(
        and(
          eq(schema.employerCartItems.employerId, employerId),
          // Legacy staged some rows as "checkout"; they are still shortlisted (EMB-17).
          inArray(schema.employerCartItems.listType, ["cart", "checkout"]),
        ),
      ),
    loaded ? Promise.resolve(loaded) : loadFlowProposals(employerId),
  ]);
  // Same rule as the Proposals tabs and the dashboard: one counter (proposal-bucket.ts), fed by the same offerState.
  return hireFlowFrom({
    cartInternIds: cart.map((c) => c.internId),
    proposals: proposals.map((p) => ({ internId: p.internId, ...counterRow(p.status, p.state, p.viewOnly) })),
    toPay,
  });
}

/**
 * The strip for a page that does not compute the payable lines itself:
 * `toPay` is the dashboard's and the cart's figure (accepted offers plus
 * months now due), so every page says the same number. Null when either read
 * fails: the strip is guidance, never a reason to fail the page.
 */
export async function hireFlowCountsFor(employerId: string): Promise<HireFlowCounts | null> {
  try {
    const [payable, proposals] = await Promise.all([payableCheckout(employerId), loadFlowProposals(employerId)]);
    const held = heldIds(proposals);
    return await hireFlowCounts(employerId, payable.lines.filter((l) => !held.has(l.id)).length, proposals);
  } catch (err) {
    console.error("[employer/flow] counts failed", err);
    return null;
  }
}
