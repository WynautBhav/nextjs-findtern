import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { payableCheckout } from "@/lib/employer-payable";
import { parseOffer } from "@/lib/offer";
import { offerState } from "@/components/employer/proposal-state";
import { hireFlowFrom, type HireFlowCounts } from "@/components/employer/proposal-bucket";

/**
 * Where this company's candidates stand, for the cart → checkout strip.
 * `toPay` comes from the caller (the checkout's own payable lines), so the
 * strip and the page below it can never disagree.
 */
export async function hireFlowCounts(employerId: string, toPay: number): Promise<HireFlowCounts> {
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
    db
      .select({ internId: schema.proposals.internId, status: schema.proposals.status, offerDetails: schema.proposals.offerDetails })
      .from(schema.proposals)
      .where(eq(schema.proposals.employerId, employerId)),
  ]);
  // Same rule as the Proposals tabs and the dashboard: one counter (proposal-bucket.ts), and an
  // unanswered offer past its start date is closed everywhere, not "waiting" here and "closed" there.
  return hireFlowFrom({
    cartInternIds: cart.map((c) => c.internId),
    proposals: proposals.map((p) => ({
      internId: p.internId,
      status: p.status,
      lapsed: offerState({ status: p.status, hiredAt: null }, parseOffer(p.offerDetails)).lapsed,
    })),
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
    const toPay = (await payableCheckout(employerId)).lines.length;
    return await hireFlowCounts(employerId, toPay);
  } catch (err) {
    console.error("[employer/flow] counts failed", err);
    return null;
  }
}
