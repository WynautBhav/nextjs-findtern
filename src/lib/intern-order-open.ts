import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { withLock } from "@/lib/advisory-lock";
import { schema } from "@/lib/db";
import { isInternPaid } from "@/lib/payments";

/** How long an order that settles on the spot (test, free, full promo) counts as still being completed. */
export const SETTLING_MINUTES = 5;

/** How long an unpaid Razorpay order stays open for a retry (matches the employer side). */
const OPEN_ORDER_MINUTES = 30;

export type Opened = { error: string; alreadyPaid?: true } | { reuse: string } | null;

/**
 * Check and insert as one step per intern, so two requests at once (a double
 * click, two tabs) can't both pass the paid check and open two orders, each
 * with its own invoice. Only database work runs inside the lock, on `tx`: a
 * second pool connection or a gateway call here would hold the lock while
 * waiting. Returns the refusal, or null once the order row is in.
 */
export async function openOrder(internId: string, row: typeof schema.internPayments.$inferInsert): Promise<Opened> {
  return withLock(`intern-pay:${internId}`, async (tx): Promise<Opened> => {
    if (await isInternPaid(internId, tx)) return { error: "Your profile is already activated.", alreadyPaid: true as const };
    // Razorpay checkouts for this fee still open (a second tab, a double click, or
    // the modal closed and Pay pressed again). The same request (same amount, same
    // code) is handed the order already open, so both tabs can be paid only once.
    // A different one (a code applied since) replaces the older, which is closed,
    // so only one order is ever live.
    if (!row.gateway || row.gateway === "razorpay") {
      const openOrders = await tx
        .select({ id: schema.internPayments.id, orderId: schema.internPayments.orderId, amountMinor: schema.internPayments.amountMinor, raw: schema.internPayments.raw })
        .from(schema.internPayments)
        .where(
          and(
            eq(schema.internPayments.internId, internId),
            eq(schema.internPayments.status, "created"),
            eq(schema.internPayments.gateway, "razorpay"),
            gte(schema.internPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
          ),
        )
        .orderBy(asc(schema.internPayments.createdAt));
      const codeOf = (raw: unknown) => String((raw as { promoCode?: unknown } | null)?.promoCode ?? "");
      const same = openOrders.find((o) => o.amountMinor === (row.amountMinor ?? 0) && codeOf(o.raw) === codeOf(row.raw));
      if (same) return { reuse: same.orderId };
      if (openOrders.length > 0) {
        await tx
          .update(schema.internPayments)
          .set({ status: "failed", updatedAt: new Date() })
          .where(inArray(schema.internPayments.id, openOrders.map((o) => o.id)));
      }
    }
    // Orders that settle on the spot are inserted, then settled after the lock
    // is released; one still in that gap must not be joined by a second.
    if (row.gateway === "test" || row.gateway === "free") {
      const [settling] = await tx
        .select({ id: schema.internPayments.id })
        .from(schema.internPayments)
        .where(
          and(
            eq(schema.internPayments.internId, internId),
            eq(schema.internPayments.status, "created"),
            inArray(schema.internPayments.gateway, ["test", "free"]),
            gte(schema.internPayments.createdAt, new Date(Date.now() - SETTLING_MINUTES * 60_000)),
          ),
        )
        .limit(1);
      if (settling) return { error: "A payment is already being completed. Give it a moment, then refresh." };
    }
    await tx.insert(schema.internPayments).values(row);
    return null;
  });
}
