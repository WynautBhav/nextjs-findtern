import { isSubscriptionOrderRaw, subscriptionState, type SubscriptionConfig, type SubscriptionOverride, type SubscriptionState } from "../employer-subscription.ts";
import { csvFilename, toCsv, type CsvColumn } from "../admin/csv.ts";

/**
 * The admin Subscriptions list, pure: one row per employer that has bought or been granted Findtern Pro, built
 * from their paid subscription orders and their admin override. No database here (`admin-list-load.ts` reads it).
 */

export const STATUS_FILTERS = ["all", "active", "expiring", "expired", "revoked"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type SubscriptionSource = "paid" | "promo" | "manual";

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  expiring: "Expiring (30 days or less)",
  expired: "Expired",
  revoked: "Revoked",
};
export const SOURCE_LABELS: Record<SubscriptionSource, string> = { paid: "Paid", promo: "Promo code", manual: "Manual grant" };

export type SubscriptionPaymentInput = {
  id: string;
  employerId: string;
  orderId: string;
  gateway: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
  raw: unknown;
};
export type EmployerInput = { id: string; name: string | null; companyEmail: string | null };

export type SubscriptionRow = {
  employerId: string;
  company: string;
  email: string;
  status: SubscriptionState["status"];
  active: boolean;
  startedAt: string | null;
  endsAt: string | null;
  daysLeft: number | null;
  source: SubscriptionSource | null;
  amountMinor: number | null;
  currency: string | null;
  /** The newest subscription order's row id (links to the order in Orders); null for a pure manual grant. */
  paymentRowId: string | null;
  orderRef: string | null;
  note: string;
  revokedAt: string | null;
};

const isWaived = (p: { gateway: string | null }) => p.gateway === "promo_full_waiver";

/** `status` as the list filters know it ("none" cannot occur: every listed employer has a payment or an override). */
export function buildSubscriptionRows(i: {
  employers: readonly EmployerInput[];
  payments: readonly SubscriptionPaymentInput[];
  overrides: Readonly<Record<string, SubscriptionOverride>>;
  config: SubscriptionConfig;
  now: Date;
}): SubscriptionRow[] {
  // The list shows what each employer really holds; the on/off switch is a banner on the page, not a reason to hide rows.
  const config: SubscriptionConfig = { ...i.config, enabled: true };
  const byEmployer = new Map<string, SubscriptionPaymentInput[]>();
  for (const p of i.payments) {
    if (p.status !== "paid" || !isSubscriptionOrderRaw(p.raw)) continue;
    byEmployer.set(p.employerId, [...(byEmployer.get(p.employerId) ?? []), p]);
  }
  const ids = new Set<string>([...byEmployer.keys(), ...Object.keys(i.overrides)]);
  const employerOf = new Map(i.employers.map((e) => [e.id, e]));
  const rows: SubscriptionRow[] = [];
  for (const employerId of ids) {
    const payments = (byEmployer.get(employerId) ?? []).slice().sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));
    const override = i.overrides[employerId];
    const state = subscriptionState({ payments, override, now: i.now, config });
    const revokedAtMs = override?.revokedAt && Date.parse(override.revokedAt) <= i.now.getTime() ? Date.parse(override.revokedAt) : null;
    const counting = payments.filter((p) => p.paidAt && (revokedAtMs === null || p.paidAt.getTime() > revokedAtMs));
    const latest = counting[counting.length - 1] ?? payments[payments.length - 1] ?? null;
    const grantInForce =
      !!override?.grantedUntil && (revokedAtMs === null || (!!override.grantedAt && Date.parse(override.grantedAt) > revokedAtMs));
    // The grant is the source when it is what sets the end date (it reaches past every payment's period).
    const grantSetsEnd = grantInForce && !!state.endsAt && Date.parse(override!.grantedUntil!) >= Date.parse(state.endsAt) - 1;
    const source: SubscriptionSource | null = grantSetsEnd || (!latest && grantInForce) ? "manual" : latest ? (isWaived(latest) ? "promo" : "paid") : null;
    const startedMs = counting[0]?.paidAt?.getTime() ?? (grantInForce && override?.grantedAt ? Date.parse(override.grantedAt) : null);
    const e = employerOf.get(employerId);
    rows.push({
      employerId,
      company: e?.name?.trim() || "Unknown company",
      email: e?.companyEmail?.trim() || "",
      status: state.status,
      active: state.active,
      startedAt: startedMs !== null ? new Date(startedMs).toISOString() : null,
      endsAt: state.endsAt,
      daysLeft: state.daysLeft,
      source,
      amountMinor: source === "manual" || !latest ? null : latest.amountMinor,
      currency: source === "manual" || !latest ? null : latest.currency,
      paymentRowId: latest?.id ?? null,
      orderRef: latest?.orderId ?? null,
      note: override?.note ?? "",
      revokedAt: override?.revokedAt ?? null,
    });
  }
  // Soonest to end first among the live ones, then the rest by company: what needs a look is on top.
  const rank = (r: SubscriptionRow) => (r.active ? 0 : r.status === "expired" ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || (a.endsAt ?? "9").localeCompare(b.endsAt ?? "9") || a.company.localeCompare(b.company));
}

export function parseStatusFilter(v: string | null | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "") ? (v as StatusFilter) : "all";
}

/** "Active" counts everything with access (including the ones about to end); "Expiring" is the 30-day subset. */
export function filterSubscriptionRows(rows: readonly SubscriptionRow[], f: { status: StatusFilter; q?: string | null }): SubscriptionRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status === "active" && !r.active) return false;
    if (f.status === "expiring" && r.status !== "expiring") return false;
    if ((f.status === "expired" || f.status === "revoked") && r.status !== f.status) return false;
    return !q || r.company.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });
}

export function filterCounts(rows: readonly SubscriptionRow[]): Record<StatusFilter, number> {
  return Object.fromEntries(STATUS_FILTERS.map((s) => [s, filterSubscriptionRows(rows, { status: s }).length])) as Record<StatusFilter, number>;
}

const ist = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10) : "");

const CSV_COLUMNS: CsvColumn<SubscriptionRow>[] = [
  { header: "Company", value: (r) => r.company },
  { header: "Email", value: (r) => r.email },
  { header: "Plan", value: () => "Findtern Pro" },
  { header: "Status", value: (r) => r.status },
  { header: "Started (IST)", value: (r) => ist(r.startedAt) },
  { header: "Ends (IST)", value: (r) => ist(r.endsAt) },
  { header: "Days left", value: (r) => r.daysLeft },
  { header: "Source", value: (r) => (r.source ? SOURCE_LABELS[r.source] : "") },
  { header: "Amount", value: (r) => (r.amountMinor === null ? "" : (r.amountMinor / 100).toFixed(2)) },
  { header: "Currency", value: (r) => r.currency ?? "" },
  { header: "Order", value: (r) => r.orderRef ?? "" },
  { header: "Note", value: (r) => r.note },
];

export function subscriptionsCsv(rows: readonly SubscriptionRow[]): string {
  return toCsv([...rows], CSV_COLUMNS);
}
export { csvFilename };
