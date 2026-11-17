import { and, eq, sql } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { parseSubscriptionConfig, parseSubscriptionOverrides, subscriptionState, type SubscriptionOverride } from "@/lib/employer-subscription";
import { applyGrant, applyRevoke, overrideAuditView, revokeProblem } from "@/lib/subscription/grant";

const KEY = "employer_subscription_overrides";
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export type OverrideResult = { ok: true; changed: boolean } | { ok: false; status: number; error: string };

/**
 * Grant or revoke one employer's subscription, as one transaction under one lock: read the overrides object, change this
 * employer's entry, write the object back and the audit row. The other employers' entries are written back exactly as they
 * were found (even ones this code does not understand). An action that is already the employer's state changes nothing and
 * writes no audit row, so a double click is harmless. No money moves: a revoke never touches a payment row.
 */
export async function changeOverride(
  employerId: string,
  adminId: string,
  action: { kind: "grant"; until: Date; note: string } | { kind: "revoke"; note: string },
  now: Date = new Date(),
): Promise<OverrideResult> {
  return withLock("subscription-overrides", async (tx): Promise<OverrideResult> => {
    const [setting] = await tx.select({ value: schema.platformSettings.value }).from(schema.platformSettings).where(eq(schema.platformSettings.key, KEY)).limit(1);
    const all = isRecord(setting?.value) ? { ...setting.value } : {};
    const existing: SubscriptionOverride | null = parseSubscriptionOverrides(all)[employerId] ?? null;

    let next: SubscriptionOverride;
    if (action.kind === "grant") {
      const change = applyGrant(existing, { until: action.until, note: action.note, by: adminId, now });
      if (!change.changed) return { ok: true, changed: false };
      next = change.override;
    } else {
      const [configRow] = await tx.select({ value: schema.platformSettings.value }).from(schema.platformSettings).where(eq(schema.platformSettings.key, "employer_subscription")).limit(1);
      const payments = await tx
        .select({ status: schema.employerPayments.status, paidAt: schema.employerPayments.paidAt, raw: schema.employerPayments.raw })
        .from(schema.employerPayments)
        .where(and(eq(schema.employerPayments.employerId, employerId), eq(schema.employerPayments.status, "paid"), sql`${schema.employerPayments.raw}->>'kind' = 'employer_subscription'`));
      // Judged as the employer holds it, whatever the on/off switch says: the switch hides the feature, not the grant.
      const state = subscriptionState({ payments, override: existing, now, config: { ...parseSubscriptionConfig(configRow?.value), enabled: true } });
      if (state.status === "revoked") return { ok: true, changed: false };
      const problem = revokeProblem(state);
      if (problem) return { ok: false, status: 409, error: problem };
      next = applyRevoke(existing, { note: action.note, by: adminId, now });
    }

    const value = { ...all, [employerId]: next };
    await tx
      .insert(schema.platformSettings)
      .values({ key: KEY, value, updatedBy: adminId, updatedAt: now })
      .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedBy: adminId, updatedAt: now } });
    await recordAdminAudit(
      tx,
      {
        adminId,
        action: action.kind === "grant" ? "subscription.granted" : "subscription.revoked",
        targetType: "employer",
        targetId: employerId,
        meta: { note: action.note, ...(action.kind === "grant" ? { until: action.until.toISOString() } : {}), before: overrideAuditView(existing), after: overrideAuditView(next) },
      },
      { strict: true },
    );
    return { ok: true, changed: true };
  });
}

/** Does this employer exist? A grant for a mistyped id is refused rather than stored. */
export async function employerExists(employerId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: schema.employers.id }).from(schema.employers).where(eq(schema.employers.id, employerId)).limit(1);
  return Boolean(row);
}
