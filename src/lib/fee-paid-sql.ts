import { sql, type SQL } from "drizzle-orm";

import { schema } from "./db";

/**
 * SQL twin of `isInternPaid` (payments.ts): a `paid` intern_payments row
 * (promo, ₹0 and admin mark-paid rows included) or legacy `extra_data.payment.isPaid`.
 */
export function feePaidSql(userIdCol: SQL | { name: string }, extraDataCol: SQL | { name: string }): SQL<boolean> {
  return sql<boolean>`(EXISTS (SELECT 1 FROM ${schema.internPayments} ip WHERE ip.intern_id = ${userIdCol} AND ip.status = 'paid')
    OR coalesce(${extraDataCol}->'payment'->>'isPaid', '') = 'true')`;
}
