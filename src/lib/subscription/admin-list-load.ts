import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";
import { getEmployerSubscriptionConfig, getEmployerSubscriptionOverrides } from "@/lib/platform-settings";
import { buildSubscriptionRows, type SubscriptionRow } from "@/lib/subscription/admin-list";

/** More than the platform will have for a long time; keeps the read bounded. */
const MAX_PAYMENTS = 5000;

/** Every employer that has bought or been granted Findtern Pro, as the admin list shows them. Throws when the database does (the page shows its error state). */
export async function loadSubscriptionRows(now: Date = new Date()): Promise<{ rows: SubscriptionRow[]; enabled: boolean }> {
  if (!hasDb()) throw new Error("no database");
  const db = getDb();
  const [payments, config, overrides] = await Promise.all([
    db
      .select({ id: schema.employerPayments.id, employerId: schema.employerPayments.employerId, orderId: schema.employerPayments.orderId, gateway: schema.employerPayments.gateway, status: schema.employerPayments.status, amountMinor: schema.employerPayments.amountMinor, currency: schema.employerPayments.currency, paidAt: schema.employerPayments.paidAt, raw: schema.employerPayments.raw })
      .from(schema.employerPayments)
      .where(and(eq(schema.employerPayments.status, "paid"), sql`${schema.employerPayments.raw}->>'kind' = 'employer_subscription'`))
      .limit(MAX_PAYMENTS),
    getEmployerSubscriptionConfig(),
    getEmployerSubscriptionOverrides(),
  ]);
  const ids = [...new Set([...payments.map((p) => p.employerId), ...Object.keys(overrides)])];
  const employers = ids.length
    ? await db.select({ id: schema.employers.id, name: schema.employers.companyName, companyEmail: schema.employers.companyEmail }).from(schema.employers).where(inArray(schema.employers.id, ids))
    : [];
  return { rows: buildSubscriptionRows({ employers, payments, overrides, config, now }), enabled: config.enabled };
}
