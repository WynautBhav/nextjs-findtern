import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * GST invoice numbers: one running serial per Indian financial year
 * (1 April - 31 March, IST), shared by employer orders and intern fees.
 * "FT/2026-27/0001". Assigned once, at the moment a payment is marked paid,
 * and stored - so a number never changes after it is printed.
 */

export const INVOICE_PREFIX = "FT";

/** "2026-27" for any instant in that Indian financial year. */
export function financialYear(at: Date = new Date()): string {
  const ist = new Date(at.getTime() + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNumber(fy: string, n: number): string {
  return `${INVOICE_PREFIX}/${fy}/${String(n).padStart(4, "0")}`;
}

/**
 * Give a paid row its number if it has none. The counter increment is one
 * atomic upsert, so two payments settling at once can never share a number;
 * the `invoice_number IS NULL` guard makes a second call a no-op.
 */
export async function assignInvoiceNumber(
  kind: "employer" | "intern",
  paymentId: string,
  paidAt: Date = new Date(),
): Promise<string | null> {
  const db = getDb();
  const table = kind === "employer" ? schema.employerPayments : schema.internPayments;
  const [row] = await db
    .select({ invoiceNumber: table.invoiceNumber })
    .from(table)
    .where(eq(table.id, paymentId))
    .limit(1);
  if (!row) return null;
  if (row.invoiceNumber) return row.invoiceNumber;

  const fy = financialYear(paidAt);
  const [counter] = await db
    .insert(schema.invoiceCounters)
    .values({ fy, last: 1 })
    .onConflictDoUpdate({
      target: schema.invoiceCounters.fy,
      set: { last: sql`${schema.invoiceCounters.last} + 1`, updatedAt: new Date() },
    })
    .returning({ last: schema.invoiceCounters.last });
  const number = formatInvoiceNumber(fy, counter.last);
  const updated = await db
    .update(table)
    .set({ invoiceNumber: number })
    .where(and(eq(table.id, paymentId), isNull(table.invoiceNumber)))
    .returning({ invoiceNumber: table.invoiceNumber });
  return updated[0]?.invoiceNumber ?? null;
}
