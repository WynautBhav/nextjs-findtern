import { inrMinorToUsdMinor } from "./currency.ts";

/**
 * Employer subscription ("Findtern Pro"): pure rules. No SQL, no migration. A purchase is an `employer_payments`
 * row with `raw.kind = "employer_subscription"` and `raw.periodDays`, no proposal ids; admin config and per-employer
 * grants/revokes live in `platform_settings` (`employer_subscription`, `employer_subscription_overrides`).
 * The database read is `subscription/entitlement-db.ts`.
 */

export type SubscriptionConfig = { priceInrMinor: number; durationDays: number; enabled: boolean };

/** GST-inclusive Rs 10,000 for 365 days, on. */
export const SUBSCRIPTION_DEFAULTS: SubscriptionConfig = { priceInrMinor: 1_000_000, durationDays: 365, enabled: true };

const MAX_DURATION_DAYS = 3650;
const DAY_MS = 86_400_000;
const EXPIRING_DAYS = 30;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.round(v) >= 1 && Math.round(v) <= max ? Math.round(v) : null;

/** The stored config, each field falling back to its default on its own when missing or unreadable. */
export function parseSubscriptionConfig(raw: unknown): SubscriptionConfig {
  const r = isRecord(raw) ? raw : {};
  return {
    priceInrMinor: positive(r.priceInrMinor, Number.MAX_SAFE_INTEGER) ?? SUBSCRIPTION_DEFAULTS.priceInrMinor,
    durationDays: positive(r.durationDays, MAX_DURATION_DAYS) ?? SUBSCRIPTION_DEFAULTS.durationDays,
    enabled: typeof r.enabled === "boolean" ? r.enabled : SUBSCRIPTION_DEFAULTS.enabled,
  };
}

/** The price in `currency` minor units: INR as set, USD through the Rs 100 = $1 rule (Rs 10,000 -> $100). */
export function subscriptionPriceMinor(c: SubscriptionConfig, currency: "INR" | "USD"): number {
  return currency === "USD" ? inrMinorToUsdMinor(c.priceInrMinor) : c.priceInrMinor;
}

/** Is this `employer_payments.raw` a subscription purchase (as opposed to a hire order)? */
export function isSubscriptionOrderRaw(raw: unknown): boolean {
  return isRecord(raw) && raw.kind === "employer_subscription";
}

/**
 * One employer's admin override (`platform_settings.employer_subscription_overrides[employerId]`).
 * `grantedUntil`: access until then without paying. `revokedAt`: access ends then and payments made before it no
 * longer count. When both exist the later action wins, told apart by `grantedAt` (a grant with no `grantedAt` is
 * older than any revoke), so a writer should clear the opposite field or stamp `grantedAt`.
 */
export type SubscriptionOverride = { grantedUntil?: string; grantedAt?: string; revokedAt?: string; by: string; note: string };

const isoOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Date.parse(v)) ? v : null);

/** The stored overrides object, keeping only entries that are objects and only date fields that are real dates. */
export function parseSubscriptionOverrides(raw: unknown): Record<string, SubscriptionOverride> {
  const out: Record<string, SubscriptionOverride> = {};
  if (!isRecord(raw)) return out;
  for (const [employerId, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    const entry: SubscriptionOverride = { by: typeof v.by === "string" ? v.by : "", note: typeof v.note === "string" ? v.note : "" };
    for (const k of ["grantedUntil", "grantedAt", "revokedAt"] as const) {
      const d = isoOrNull(v[k]);
      if (d !== null) entry[k] = d;
    }
    out[employerId] = entry;
  }
  return out;
}

export type SubscriptionState = {
  active: boolean;
  status: "none" | "active" | "expiring" | "expired" | "revoked";
  endsAt: string | null;
  daysLeft: number | null;
};

const INACTIVE: SubscriptionState = { active: false, status: "none", endsAt: null, daysLeft: null };

/** Inactive, for callers whose lookup failed. A fresh object each time. */
export const inactiveSubscription = (): SubscriptionState => ({ ...INACTIVE });

/**
 * Where an employer stands. Each paid subscription order adds its `raw.periodDays` (else the configured length,
 * else 365): paying while active extends from the current end, paying after it ended starts from the payment. An
 * admin grant raises the end to `grantedUntil` (never shortens it); a revoke voids every payment made before it.
 * `config.enabled === false` switches the feature off: nobody is active. `expiring` is 30 days or fewer left.
 */
export function subscriptionState(i: {
  payments: { status: string; paidAt: Date | null; raw: unknown }[];
  override: unknown;
  now?: Date;
  config?: SubscriptionConfig;
}): SubscriptionState {
  const now = (i.now ?? new Date()).getTime();
  const config = i.config ?? SUBSCRIPTION_DEFAULTS;
  if (config.enabled === false) return inactiveSubscription();

  const ov = isRecord(i.override) ? i.override : {};
  const grantedUntil = isoOrNull(ov.grantedUntil);
  const grantedAt = isoOrNull(ov.grantedAt);
  const revokedAtRaw = isoOrNull(ov.revokedAt);
  // A revoke dated in the future is not in force yet.
  const revokedAt = revokedAtRaw !== null && Date.parse(revokedAtRaw) <= now ? Date.parse(revokedAtRaw) : null;

  const paid = i.payments
    .filter((p) => p.status === "paid" && p.paidAt instanceof Date && !Number.isNaN(p.paidAt.getTime()) && isSubscriptionOrderRaw(p.raw))
    .map((p) => ({ at: (p.paidAt as Date).getTime(), days: positive((p.raw as Record<string, unknown>).periodDays, MAX_DURATION_DAYS) ?? config.durationDays }))
    .filter((p) => revokedAt === null || p.at > revokedAt)
    .sort((a, b) => a.at - b.at);

  let end: number | null = null;
  for (const p of paid) {
    const start: number = end !== null && end > p.at ? end : p.at;
    end = start + p.days * DAY_MS;
  }

  const grantInForce = grantedUntil !== null && (revokedAt === null || (grantedAt !== null && Date.parse(grantedAt) > revokedAt));
  if (grantInForce) end = Math.max(end ?? 0, Date.parse(grantedUntil as string));

  if (end === null) return revokedAt !== null ? { active: false, status: "revoked", endsAt: null, daysLeft: null } : inactiveSubscription();

  const endsAt = new Date(end).toISOString();
  if (end <= now) return { active: false, status: "expired", endsAt, daysLeft: null };
  const left = end - now;
  return { active: true, status: left <= EXPIRING_DAYS * DAY_MS ? "expiring" : "active", endsAt, daysLeft: Math.ceil(left / DAY_MS) };
}
