import { and, eq, sql } from "drizzle-orm";

import { getDb, hasDb, schema } from "@/lib/db";
import { getEmployerSubscriptionConfig, getEmployerSubscriptionOverrides } from "@/lib/platform-settings";
import { inactiveSubscription, subscriptionState, type SubscriptionState } from "@/lib/employer-subscription";

/** More than any employer will ever have (one row per paid renewal); keeps the read bounded. */
const MAX_PAYMENTS = 200;

/**
 * Does this employer hold an active subscription right now? Reads the employer's paid subscription orders
 * (`employer_payments.raw.kind = 'employer_subscription'`) and the two `platform_settings` values (config,
 * per-employer grant/revoke), then applies `subscriptionState`. Read-only. Never throws: no database, an
 * unreachable one or a failing query is "inactive", so a page or a paywall never fails on it.
 */
export async function employerSubscription(employerId: string, now: Date = new Date()): Promise<SubscriptionState> {
  if (!employerId || !hasDb()) return inactiveSubscription();
  try {
    const db = getDb();
    const [payments, config, overrides] = await Promise.all([
      db
        .select({ status: schema.employerPayments.status, paidAt: schema.employerPayments.paidAt, raw: schema.employerPayments.raw })
        .from(schema.employerPayments)
        .where(
          and(
            eq(schema.employerPayments.employerId, employerId),
            eq(schema.employerPayments.status, "paid"),
            sql`${schema.employerPayments.raw}->>'kind' = 'employer_subscription'`,
          ),
        )
        .limit(MAX_PAYMENTS),
      getEmployerSubscriptionConfig(),
      getEmployerSubscriptionOverrides(),
    ]);
    return subscriptionState({
      payments: Array.isArray(payments) ? payments.filter((p) => p && typeof p === "object") : [],
      override: overrides[employerId] ?? null,
      now,
      config,
    });
  } catch {
    return inactiveSubscription();
  }
}
