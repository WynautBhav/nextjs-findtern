/**
 * Payable checkout computation, shared by the checkout page (to render) and
 * the Razorpay order route (to price). The route never trusts a posted
 * amount: if the client could name the total, an employer could pay less by
 * editing the request. Both sides call this one function so the number on
 * screen and the number charged cannot drift apart.
 *
 * The payable set is *accepted* proposals - a cart row is an intention, an
 * accepted proposal is a commitment, and only the second is worth billing.
 */

import { cache } from "react";
import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { acceptedLineCharge } from "@/lib/accepted-charge";
import { hireFeeMinor, lineCharge, type LineCharge, type PayMode } from "@/lib/checkout";
import { feeDisplay, type FeeDisplay } from "@/lib/fee-display";
import { getDb, schema } from "@/lib/db";
import { istDay, postpaidAnchor, postpaidDueOn } from "@/lib/billing-plan";
import { monthlyDues } from "@/lib/dues";
import { hireIsRunning } from "@/lib/candidate-hold";
import { parseOffer } from "@/lib/offer";
import { initialsOf, scoreOf } from "@/lib/employer-candidates";
import { hiredInternIds, hiredProposalSql, isAdminViewing } from "@/lib/employer-visibility";
import { employerRegion, type Currency } from "@/lib/employer-pricing";
import { getEmployerRows } from "@/lib/employer-request";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { splitTakenDownProposals, TAKEN_DOWN_PAY_NOTE } from "@/lib/projects/takedown-payable";
import { orderProposalIds } from "@/lib/order-ids";
import { expiryOf } from "@/lib/proposal-expiry";
import { payGateFor, payGateRefusal, PAY_GATE_CODE, PAY_GATE_MESSAGE, splitByPayGate, type PayGate, type PayGateReason, type PayGateRefusal } from "@/lib/pay-gate";

export { payGateFor, PAY_GATE_CODE, type PayGate, type PayGateReason, type PayGateRefusal } from "@/lib/pay-gate";

/** How long an unpaid checkout order stays open (payments.ts OPEN_ORDER_MINUTES; kept here so this module needs no payments import). */
const OPEN_ORDER_WINDOW_MINUTES = 30;
/** How long an offer the sweeper expired for non-payment stays in `PayableCheckout.expired`. */
const SWEPT_EXPIRY_VISIBLE_DAYS = 14;


export const DURATION_LABEL: Record<string, string> = {
  "1m": "1 month",
  "2m": "2 months",
  "3m": "3 months",
  "6m": "6 months",
};

export type PayableLine = {
  id: string;
  /** Full name - render through `displayNameOf`, never raw. */
  internName: string;
  internInitials: string;
  /** True only once the intern is hired; checkout is pre-payment, so usually false. */
  nameUnlocked: boolean;
  internId: string;
  projectId: string;
  projectName: string | null;
  roleTitle: string;
  durationLabel: string;
  months: number;
  /** Offer's monthly amount, minor units; null when the offer has none. */
  monthlyMinor: number | null;
  score: number;
  charge: LineCharge;
  /** How the one-time hiring fee is shown at checkout (lib/fee-display.ts). */
  fee: FeeDisplay;
  /** Same line billed as one month (score 6+ only; see charge.monthlyBlocked). */
  monthlyCharge: LineCharge;
  /** Set for a hired monthly-plan placement: the next month is due. */
  due: { monthsPaid: number; months: number } | null;
  /** YYYY-MM-DD the due month falls due (post-paid: 2 days before the intern's pay day; else start + months paid); null when not a due line or no start. */
  dueOn: string | null;
  /** The first payment of a post-paid hire (score 6+ internship): hiring fee + Month 1 charge, whatever mode was asked for. */
  feeCharge: LineCharge;
  /** YYYY-MM-DD each month after the first falls due on a post-paid hire, month 2 first (month 1 is paid with the hiring charge); empty when not offered, one month long, or no start date. */
  schedule: string[];
  /** Offer start date (YYYY-MM-DD) or null. */
  startDate: string | null;
  /** Set on a full-time offer: the annual CTC the 8.33% fee is on. */
  fullTimeCtcMinor: number | null;
  fullTime: boolean;
  currency: Currency;
};

function addMonthsDay(isoDay: string | null, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay ?? ""));
  if (!m) return null;
  const mo = Number(m[2]) - 1 + months;
  const last = new Date(Date.UTC(Number(m[1]), mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(Number(m[1]), mo, Math.min(Number(m[3]), last))).toISOString().slice(0, 10);
}

/** An accepted offer or due month the employer cannot pay now because its project is taken down (shown, never orderable). */
export type BlockedPayable = { id: string; projectId: string; projectName: string | null; note: string };

/**
 * An accepted offer that is not payable and is NOT in `lines`: its start date has passed unpaid (`expired`), or Findtern is
 * still checking the candidate's CGPA / a correction awaits the employer's confirmation (`gated`). Carries only what the
 * employer may see before hire (initials, never a name; no pay figures) so the page can say why and what to do next.
 */
export type HeldPayable = {
  id: string;
  projectId: string;
  projectName: string | null;
  roleTitle: string;
  internInitials: string;
  startDate: string | null;
  reason: PayGateReason;
  note: string;
};

export type PayableCheckout = {
  lines: PayableLine[];
  /** Accepted, unpaid offers whose start date has passed with no open order: "Expired, send a new proposal". Empty when none. */
  expired: HeldPayable[];
  /** Accepted offers held by the CGPA check (reason `cgpa_pending` | `cgpa_incorrect_unacked`). Empty when none. */
  gated: HeldPayable[];
  /**
   * Offers / due months that would be payable but belong to a project Findtern took down. They are NOT in `lines`
   * (so not in `totals`, the "To pay" counts or any pay-now button) and carry the note "Taken down: contact admin".
   * Empty whenever no project is taken down.
   */
  blocked: BlockedPayable[];
  /** Per-currency order total, minor units. */
  totals: Map<Currency, number>;
  region: "IN" | null;
  defaultCurrency: Currency;
  prefill: { name?: string; email?: string; contact?: string };
};

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Proposal ids that have an unpaid order from the last 30 minutes (the same rule as payments.ts hasOpenOrderFor, one query for all). */
export async function openOrderProposalIds(db: Db | Tx, employerId: string, now: Date = new Date()): Promise<Set<string>> {
  const rows = await db
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.employerId, employerId),
        eq(schema.employerPayments.status, "created"),
        gte(schema.employerPayments.createdAt, new Date(now.getTime() - OPEN_ORDER_WINDOW_MINUTES * 60_000)),
      ),
    );
  return new Set(rows.flatMap((r) => orderProposalIds(r.raw)));
}

/**
 * The pay gate (expiry + CGPA check) for these proposals of one employer, read on `db` (pass the order transaction to
 * re-check under the lock). A proposal that is not found, or not this employer's, is absent from the map.
 */
export async function payGatesFor(db: Db | Tx, employerId: string, proposalIds: string[], now: Date = new Date()): Promise<Map<string, PayGate>> {
  if (proposalIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.id, proposalIds)));
  if (rows.length === 0) return new Map();
  const ob = await db
    .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(inArray(schema.internOnboarding.userId, [...new Set(rows.map((r) => r.internId))]));
  const extraOf = new Map(ob.map((o) => [o.userId, o.extraData]));
  const open = await openOrderProposalIds(db, employerId, now);
  return new Map(
    rows.map((p) => [p.id, payGateFor({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, extraData: extraOf.get(p.internId), updatedAt: p.updatedAt, hasOpenOrder: open.has(p.id) }, now)]),
  );
}

/** The first refusal among these proposals' pay gates (expired, CGPA check), or null when each is payable or not found. For the order transaction. */
export async function payGateRefusalFor(db: Db | Tx, employerId: string, proposalIds: string[], now: Date = new Date()): Promise<PayGateRefusal | null> {
  const gates = await payGatesFor(db, employerId, proposalIds, now);
  for (const id of proposalIds) {
    const refusal = payGateRefusal(gates.get(id) ?? { payable: true, reason: null });
    if (refusal) return refusal;
  }
  return null;
}

/**
 * The 409 for a requested offer that cannot be paid because of the pay gate, or null. The routes' early answer (the order
 * transaction re-checks). Three cases: `payableCheckout` held it back (expired by the clock, or CGPA check); or it was already
 * expired by the sweeper for not being paid (status `expired`, reason `unpaid_past_start`, so it is not in the checkout at all).
 * An offer that is simply unknown or already paid is left to the caller's own "nothing to pay" answer.
 */
export async function payRequestRefusal(db: Db | Tx, employerId: string, checkout: Pick<PayableCheckout, "expired" | "gated" | "lines">, proposalIds: string[]): Promise<PayGateRefusal | null> {
  const h = [...checkout.expired, ...checkout.gated].find((x) => proposalIds.includes(x.id));
  if (h) return { error: h.note, code: PAY_GATE_CODE[h.reason] };
  const missing = proposalIds.filter((id) => !checkout.lines.some((l) => l.id === id));
  if (missing.length === 0) return null;
  const rows = await db
    .select({ status: schema.proposals.status, hiredAt: schema.proposals.hiredAt, offerDetails: schema.proposals.offerDetails })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.id, missing)));
  return rows.some((r) => expiryOf(r).reason === "unpaid_past_start") ? { error: PAY_GATE_MESSAGE.expired, code: PAY_GATE_CODE.expired } : null;
}

/**
 * Of the new-hire `lines` (never a due month), the first whose intern is hired and still running with a DIFFERENT company
 * (candidate-hold.ts). Such an offer was accepted before that hire existed (or in the unguarded past) and must not become a
 * second paid placement. Another offer of the same company never counts: its own full-time conversion is legitimate.
 */
export async function lineHeldByOtherHire(db: Db | Tx, employerId: string, lines: { id: string; internId: string }[]): Promise<boolean> {
  if (lines.length === 0) return false;
  const rows = await db
    .select({ employerId: schema.proposals.employerId, status: schema.proposals.status, hiredAt: schema.proposals.hiredAt, endedAt: schema.proposals.endedAt, offerDetails: schema.proposals.offerDetails, currency: schema.proposals.currency })
    .from(schema.proposals)
    .where(and(inArray(schema.proposals.internId, lines.map((l) => l.internId)), ne(schema.proposals.employerId, employerId), hiredProposalSql()));
  return rows.some((r) => hireIsRunning(r));
}

/**
 * Accepted offers awaiting payment, plus hired monthly-plan placements whose
 * next month is due. `processing` is the legacy status for an accepted offer
 * mid-payment; without it those rows could never be paid. The order route
 * reruns this on its locking transaction to confirm what it priced is still
 * payable.
 */
export async function openProposalsWithDues(db: Db | Tx, employerId: string) {
  // Independent reads: one round trip, not two.
  const [open, payments] = await Promise.all([
    db
      .select()
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.status, ["accepted", "processing", "hired"])))
      .orderBy(desc(schema.proposals.updatedAt)),
    db
      .select({ status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt })
      .from(schema.employerPayments)
      .where(eq(schema.employerPayments.employerId, employerId)),
  ]);
  const all = monthlyDues(open, payments);
  // `dues` is what can be paid now; `upcoming` is post-paid months not yet due (display only, never orderable).
  return {
    open,
    dues: new Map(all.filter((d) => d.payable).map((d) => [d.proposalId, d])),
    upcoming: new Map(all.filter((d) => !d.payable).map((d) => [d.proposalId, d])),
  };
}

export async function payableCheckout(
  employerId: string,
  opts: { proposalIds?: string[]; mode?: PayMode } = {},
): Promise<PayableCheckout> {
  const db = getDb();
  // Wave 1: every read that depends on nothing else, in one round trip (was ten sequential ones).
  // The hiring fee is decided here, at charge time, from the live setting and each offer's band, so the page and the order route agree.
  const sweptCutoff = new Date(Date.now() - SWEPT_EXPIRY_VISIBLE_DAYS * 86_400_000).toISOString();
  const [feeSetting, employerRows, { open, dues }, openOrderIds, swept, hiredRows, adminViewing] = await Promise.all([
    getPerHireFeeSetting(),
    getEmployerRows(employerId),
    openProposalsWithDues(db, employerId),
    openOrderProposalIds(db, employerId),
    // Offers the sweeper already expired (status `expired`, reason unpaid_past_start) stay listed for a while, so the page shows the
    // same "Expired, send a new proposal" row before and after the hourly sweep. Not priced; only on the unfiltered view or when asked for.
    db
      .select()
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.employerId, employerId),
          eq(schema.proposals.status, "expired"),
          sql`${schema.proposals.offerDetails}->>'expiredReason' = 'unpaid_past_start'`,
          sql`(${schema.proposals.offerDetails}->>'expiredAt')::timestamptz >= ${sweptCutoff}::timestamptz`,
          opts.proposalIds?.length ? inArray(schema.proposals.id, opts.proposalIds) : undefined,
        ),
      )
      .orderBy(desc(schema.proposals.updatedAt))
      .limit(50),
    db
      .select({ internId: schema.proposals.internId })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), hiredProposalSql())),
    isAdminViewing(),
  ]);
  const employer = employerRows[0];

  const region = employerRegion(employer ?? {});
  const defaultCurrency: Currency = region === "IN" ? "INR" : "USD";
  const prefill = {
    name: employer?.name,
    email: employer?.companyEmail,
    contact: employer ? `${employer.countryCode}${employer.phoneNumber}` : undefined,
  };

  const wanted = open.filter(
    (p) =>
      (p.status === "accepted" || p.status === "processing" || dues.has(p.id)) && (!opts.proposalIds?.length || opts.proposalIds.includes(p.id)),
  );
  // A project Findtern took down is view-only for the employer: its offers and due months are listed as blocked, never as payable.
  const wantedProjectIds = [...new Set(wanted.map((p) => p.projectId))];
  // Wave 2: the taken-down projects and the candidates' onboarding rows (read for every wanted offer, a superset of
  // the ones that pass the take-down split; the lookups below only ever ask for those) in one round trip.
  const wantedInternIds = [...new Set(wanted.map((p) => p.internId))];
  const [downRows, onboardingRows] = await Promise.all([
    wantedProjectIds.length
      ? db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          .where(and(inArray(schema.projects.id, wantedProjectIds), isNotNull(schema.projects.takenDownAt)))
      : [],
    wantedInternIds.length ? db.select().from(schema.internOnboarding).where(inArray(schema.internOnboarding.userId, wantedInternIds)) : [],
  ]);
  const { payable: notDown, blocked: blockedProposals } = splitTakenDownProposals(wanted, new Set(downRows.map((r) => r.id)));
  const downName = new Map(downRows.map((r) => [r.id, r.projectName]));
  const blocked: BlockedPayable[] = blockedProposals.map((p) => ({ id: p.id, projectId: p.projectId, projectName: downName.get(p.projectId) ?? null, note: TAKEN_DOWN_PAY_NOTE }));

  // The pay gate (pay-gate.ts): an accepted offer whose start date has passed unpaid, or whose candidate's CGPA is still being
  // checked, is held back from `lines` (never priced, never in `totals`) and listed in `expired` / `gated` instead. Processing and
  // hired rows, due months and any offer with an open order are never held. Offers that pass come back as the same array.
  const onboardingByUser = new Map(onboardingRows.map((row) => [row.userId, row]));
  const split = splitByPayGate(
    notDown,
    (p) => ({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails, extraData: onboardingByUser.get(p.internId)?.extraData, updatedAt: p.updatedAt, hasOpenOrder: openOrderIds.has(p.id) }),
    new Date(),
  );
  const proposals = split.payable;
  const held = [...split.expired, ...swept].map((item) => ({ item, reason: "expired" as PayGateReason }));
  held.push(...split.gated);
  const expired: HeldPayable[] = [];
  const gated: HeldPayable[] = [];
  // Wave 3: names and project titles for the held rows and for the payable lines, one round trip.
  const lineInternIds = [...new Set(proposals.map((p) => p.internId))];
  const lineProjectIds = [...new Set(proposals.map((p) => p.projectId))];
  const [heldUsers, heldProjects, userRows, projectRows] = await Promise.all([
    held.length
      ? db
          .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
          .from(schema.users)
          .where(inArray(schema.users.id, [...new Set(held.map((h) => h.item.internId))]))
      : [],
    held.length
      ? db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          .where(and(eq(schema.projects.employerId, employerId), inArray(schema.projects.id, [...new Set(held.map((h) => h.item.projectId))])))
      : [],
    proposals.length
      ? db
          .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
          .from(schema.users)
          .where(inArray(schema.users.id, lineInternIds))
      : [],
    proposals.length
      ? db
          .select({ id: schema.projects.id, projectName: schema.projects.projectName })
          .from(schema.projects)
          .where(and(eq(schema.projects.employerId, employerId), inArray(schema.projects.id, lineProjectIds)))
      : [],
  ]);
  if (held.length > 0) {
    const initialsById = new Map(heldUsers.map((u) => [u.id, initialsOf((u.firstName || "").trim(), (u.lastName || "").trim())]));
    const heldProjectName = new Map(heldProjects.map((r) => [r.id, r.projectName]));
    for (const { item, reason } of held) {
      const offer = parseOffer(item.offerDetails, item.currency);
      (reason === "expired" ? expired : gated).push({
        id: item.id,
        projectId: item.projectId,
        projectName: heldProjectName.get(item.projectId) ?? null,
        roleTitle: offer.roleTitle || heldProjectName.get(item.projectId) || "Internship",
        internInitials: initialsById.get(item.internId) ?? "?",
        startDate: offer.startDate,
        reason,
        note: PAY_GATE_MESSAGE[reason],
      });
    }
  }

  let lines: PayableLine[] = [];

  if (proposals.length > 0) {
    const namesById = new Map(
      userRows.map((row) => {
        const first = (row.firstName || "").trim();
        const last = (row.lastName || "").trim();
        return [
          row.id,
          {
            full: `${first} ${last}`.trim() || "Intern",
            initials: initialsOf(first, last),
          },
        ] as const;
      }),
    );

    // Names unmask only on hire. Checkout lines are accepted (pre-payment),
    // so almost every line here renders initials.
    const hiredIds = adminViewing ? await hiredInternIds(db, employerId) : new Set(hiredRows.map((row) => row.internId));
    const projectsById = new Map(projectRows.map((row) => [row.id, row.projectName]));

    lines = proposals.map((proposal) => {
      const offer = parseOffer(proposal.offerDetails, proposal.currency);
      const score = scoreOf(onboardingByUser.get(proposal.internId));
      const isDue = dues.has(proposal.id);
      // A due month is a later instalment: the hiring fee was in the first.
      const charge = isDue
        ? acceptedLineCharge(offer, "monthly", { firstPayment: false })
        : lineCharge(offer, score, opts.mode, { feeSetting, bandScore: score });
      const feeCharge = acceptedLineCharge(offer, "postpaid", { feeSetting, bandScore: score });
      return {
        id: proposal.id,
        internName: namesById.get(proposal.internId)?.full ?? "Intern",
        internInitials: namesById.get(proposal.internId)?.initials ?? "?",
        nameUnlocked: hiredIds.has(proposal.internId),
        internId: proposal.internId,
        projectId: proposal.projectId,
        projectName: projectsById.get(proposal.projectId) ?? null,
        roleTitle: offer.roleTitle || projectsById.get(proposal.projectId) || "Internship",
        // EMH-23: a full-time offer has no duration; it is a one-time fee.
        durationLabel: offer.fullTime
          ? "Full-time role"
          : dues.has(proposal.id)
            ? `Month ${dues.get(proposal.id)!.monthsPaid + 1} of ${offer.months}`
            : (DURATION_LABEL[offer.duration] ?? `${offer.months} month${offer.months === 1 ? "" : "s"}`),
        months: offer.months,
        monthlyMinor: offer.monthlyMinor,
        score,
        charge,
        // How the one-time fee is shown: FREE only when every charge path above bills 0 for it.
        fee: feeDisplay({
          currency: offer.currency,
          chargedMinor: Math.max(charge.perHireMinor, feeCharge.perHireMinor),
          listMinor: hireFeeMinor(offer),
          applicable: !offer.fullTime && !isDue,
        }),
        // What one month costs here: no hiring fee on a later instalment, or
        // the summary shows more than the order route charges.
        // A due month is priced on the fixed basis; a not-yet-due line keeps the live score
        // only so the checkout can say why month-end payment is not offered (monthlyBlocked).
        monthlyCharge: dues.has(proposal.id)
          ? acceptedLineCharge(offer, "monthly", { firstPayment: false })
          : lineCharge(offer, score, "monthly", { feeSetting, bandScore: score }),
        due: dues.get(proposal.id) ?? null,
        dueOn: dues.has(proposal.id) ? (dues.get(proposal.id)!.dueOn ?? addMonthsDay(offer.startDate, dues.get(proposal.id)!.monthsPaid)) : null,
        feeCharge,
        schedule: dues.has(proposal.id) || offer.fullTime
          ? []
          : Array.from({ length: Math.max(0, offer.months - 1) }, (_, i) => postpaidDueOn(postpaidAnchor(offer.startDate, null) ?? istDay(new Date()), offer.months, i + 2) ?? "").filter(Boolean),
        startDate: offer.startDate,
        fullTimeCtcMinor: offer.fullTime?.annualCtcMinor ?? null,
        fullTime: Boolean(offer.fullTime),
        currency: offer.currency,
      };
    });
  }

  const totals = new Map<Currency, number>();
  for (const line of lines) {
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.charge.totalMinor);
  }

  return { lines, expired, gated, blocked, totals, region, defaultCurrency, prefill };
}

/**
 * `payableCheckout(employerId)` for one page render: the layout strip, the page body and the hire-flow counts all ask for
 * the same figure, and `cache` makes that one set of reads per request. Request-scoped, never shared between requests.
 * Pages only: the order and promo routes call `payableCheckout` directly so they always read fresh.
 */
export const payableCheckoutForRequest = cache((employerId: string) => payableCheckout(employerId));
