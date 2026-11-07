import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { payableCheckout } from "@/lib/employer-payable";
import type { HireFlowCounts } from "@/components/employer/hire-flow";

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
      .select({ internId: schema.proposals.internId, status: schema.proposals.status })
      .from(schema.proposals)
      .where(eq(schema.proposals.employerId, employerId)),
  ]);
  const proposedTo = new Set(proposals.filter((p) => !["rejected", "withdrawn", "expired"].includes(p.status)).map((p) => p.internId));
  return {
    shortlisted: new Set(cart.map((c) => c.internId).filter((id) => !proposedTo.has(id))).size,
    awaitingReply: proposals.filter((p) => p.status === "sent" || p.status === "interview_scheduled").length,
    toPay,
    hired: new Set(proposals.filter((p) => p.status === "hired").map((p) => p.internId)).size,
  };
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
