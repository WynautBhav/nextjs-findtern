import { and, eq, sql } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { waiverCodeTail, waiverFlagOf, waiverRedeemProblem } from "@/lib/full-waiver";
import { seatFreeWhere } from "@/lib/promo-rules";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Thrown inside a settlement transaction to roll the whole claim back: the order stays unpaid, the code unspent. */
export class WaiverRefused extends Error {}

/**
 * Consume a full-waiver code for an order the settlement has just claimed, on that settlement's transaction. Locks the code's
 * row, repeats every check (a code switched off, expired or used up since the order was opened is refused, a rolled-back claim
 * leaves nothing behind), writes the one usage row, bumps the counter only while a use is free, and writes the audit row in the same
 * transaction. The code text is never audited or logged: the code id and its last 4 characters are.
 * Returns without doing anything when the order is not a waiver order.
 */
export async function redeemWaiverInTx(
  tx: Tx,
  order: { kind: "employer" | "intern"; paymentRowId: string; orderId: string; accountId: string; currency: string; raw: unknown },
): Promise<void> {
  const flag = waiverFlagOf(order.raw);
  if (!flag) return;
  if (!flag.promoCodeId) throw new WaiverRefused("This order is not a valid full-waiver order");
  const audience = order.kind;
  const [row] = await tx.select().from(schema.promoCodes).where(eq(schema.promoCodes.id, flag.promoCodeId)).for("update").limit(1);
  if (!row) throw new WaiverRefused("Invalid promo code");
  const [prior] = await tx
    .select({ id: schema.promoCodeUsages.id })
    .from(schema.promoCodeUsages)
    .where(and(eq(schema.promoCodeUsages.promoCodeId, row.id), eq(schema.promoCodeUsages.userId, order.accountId)))
    .limit(1);
  const problem = waiverRedeemProblem(row, { audience, alreadyUsedByAccount: Boolean(prior) });
  if (problem) throw new WaiverRefused(problem);

  const inserted = await tx
    .insert(schema.promoCodeUsages)
    .values({ promoCodeId: row.id, userId: order.accountId, orderId: order.orderId, discountAppliedMinor: flag.waivedMinor })
    .onConflictDoNothing()
    .returning({ id: schema.promoCodeUsages.id });
  if (inserted.length === 0) throw new WaiverRefused("You have already used this code");
  const took = await tx
    .update(schema.promoCodes)
    .set({ usedCount: sql`${schema.promoCodes.usedCount} + 1`, updatedAt: new Date() })
    .where(seatFreeWhere(row.id))
    .returning({ id: schema.promoCodes.id });
  if (took.length === 0) throw new WaiverRefused("Promo code exhausted");

  await recordAdminAudit(
    tx,
    {
      adminId: order.accountId,
      action: "promo.full_waiver_redeemed",
      targetType: order.kind === "employer" ? "employer_payments" : "intern_payments",
      targetId: order.paymentRowId,
      meta: { orderId: order.orderId, promoCodeId: row.id, codeTail: waiverCodeTail(row.code), accountId: order.accountId, audience, amountWaivedMinor: flag.waivedMinor, currency: order.currency },
    },
    { strict: true },
  );
}
