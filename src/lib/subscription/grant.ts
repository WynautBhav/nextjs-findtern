import { z } from "zod";

import { subscriptionState, type SubscriptionOverride, type SubscriptionConfig, type SubscriptionState } from "../employer-subscription.ts";

/**
 * Admin grant and revoke, pure. They write `platform_settings.employer_subscription_overrides[employerId]`
 * (WP0 reader: `subscriptionState`). A grant always carries `grantedAt`; a revoke stamps `revokedAt`. Whichever
 * action came later wins, told apart by `grantedAt` vs `revokedAt`. Repeating an action that is already the
 * employer's state changes nothing (no write, no audit), so a double click is harmless.
 */

const IST_MS = 330 * 60_000;
export const GRANT_MAX_DAYS = 1095;

const noteSchema = z
  .string({ error: "Add a note: why is this being done?" })
  .trim()
  .min(3, "Add a note of at least 3 characters: why is this being done?")
  .max(500, "Keep the note under 500 characters.");

export const grantBodySchema = z.object({
  employerId: z.string().trim().min(1, "Choose a company."),
  /** An IST calendar day, YYYY-MM-DD: access runs to the end of that day. */
  until: z.string({ error: "Choose the last day of access." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day of access."),
  note: noteSchema,
});

export const revokeBodySchema = z.object({
  employerId: z.string().trim().min(1, "Choose a company."),
  note: noteSchema,
});

/** The instant an IST day ends (23:59:59.999 IST), or null when the text is not a real calendar day. */
export function istDayEnd(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999) - IST_MS);
}

export function grantUntilProblem(until: Date | null, now: Date): string | null {
  if (!until) return "That is not a real date.";
  if (until.getTime() <= now.getTime()) return "Pick a day in the future.";
  // The last day the form offers is 1095 days out, to the end of that India day.
  if (until.getTime() > istDayEnd(addIstDays(istToday(now), GRANT_MAX_DAYS))!.getTime()) return `Access can be granted for ${GRANT_MAX_DAYS} days at most.`;
  return null;
}

export type OverrideChange = { changed: false; override: SubscriptionOverride | null } | { changed: true; override: SubscriptionOverride };

/**
 * Grant access until `until`. The same grant again (same end, no revoke since) is a no-op. A revoke on file stays
 * on file: payments made before it remain void, and this newer grant is what gives access.
 */
export function applyGrant(existing: SubscriptionOverride | null | undefined, i: { until: Date; note: string; by: string; now: Date }): OverrideChange {
  const untilIso = i.until.toISOString();
  const revokedAt = existing?.revokedAt ? Date.parse(existing.revokedAt) : null;
  const grantInForce = !!existing?.grantedUntil && (revokedAt === null || (!!existing.grantedAt && Date.parse(existing.grantedAt) > revokedAt));
  if (grantInForce && existing?.grantedUntil && Date.parse(existing.grantedUntil) === i.until.getTime()) return { changed: false, override: existing };
  return { changed: true, override: { ...(existing ?? {}), grantedUntil: untilIso, grantedAt: i.now.toISOString(), by: i.by, note: i.note } };
}

/** Why this employer cannot be revoked right now, or null. */
export function revokeProblem(state: SubscriptionState): string | null {
  return state.status === "active" || state.status === "expiring" ? null : "This company has no active subscription to revoke.";
}

/**
 * Revoke now: access ends and every payment made before this moment stops counting. The route answers "already revoked"
 * from the employer's state (`status === "revoked"`) before calling this, so a double click writes nothing; a later
 * payment or grant after an old revoke makes the employer active again, and revoking then is a real change.
 */
export function applyRevoke(existing: SubscriptionOverride | null | undefined, i: { note: string; by: string; now: Date }): SubscriptionOverride {
  return { ...(existing ?? {}), revokedAt: i.now.toISOString(), by: i.by, note: i.note };
}

/** What an audit row records about one employer's override: the end that matters, not the whole object. */
export function overrideAuditView(o: SubscriptionOverride | null | undefined) {
  return o ? { grantedUntil: o.grantedUntil ?? null, grantedAt: o.grantedAt ?? null, revokedAt: o.revokedAt ?? null } : null;
}

export { subscriptionState };
export type { SubscriptionConfig };

/** Today's date in India as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** The IST day `days` after an IST day (YYYY-MM-DD), for the form's quick choices and its min/max. */
export function addIstDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
