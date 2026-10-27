import { internStipendInrMinor, parseOffer, stipendEligible, type Offer } from "../offer.ts";
import { isHiredProposal } from "../hire-status.ts";
import { toInrMinor } from "./money.ts";

/**
 * What Findtern owes an intern per hired placement, month by month (legacy
 * `GET /api/admin/interns/:id/employer-dues`, routes.ts:17013-17396, and the
 * dues table in admin-intern-detail.tsx), next to what the employer has paid
 * for the same placement, so staff can check the money came in before they
 * pay the stipend out (ADP-19).
 *
 * The monthly share is `internStipendInrMinor` (half the employer's monthly
 * amount in INR, ₹0 for a scored candidate below 6). Month `k` is due on the
 * start date + `k` months - stipends are paid at the end of each month worked.
 * Full-time offers have no stipend and are left out.
 */

type ProposalLike = {
  id: string;
  status: string;
  employerId: string | null;
  offerDetails: unknown;
  currency?: string | null;
  hiredAt?: Date | string | null;
};
export type PayoutLike = {
  id?: string;
  status: string;
  raw: unknown;
  amountMinor?: number | null;
  currency?: string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
};
/** A paid or unpaid employer order (`employer_payments`). */
export type OrderLike = { status: string; raw: unknown };

export type EmployerSide = {
  /** Offer currency; the amounts below are in it (minor units). */
  currency: "INR" | "USD";
  monthlyMinor: number;
  totalMinor: number;
  months: number;
  paidMonths: number;
  /** Paid in full at checkout (legacy paymentMode "total"). */
  paidInFull: boolean;
  dueMinor: number;
  /** INR equivalents, for totals. */
  monthlyInrMinor: number;
  dueInrMinor: number;
};

export type StipendDue = {
  proposalId: string;
  employerId: string;
  startDate: string | null;
  months: number;
  /** INR paise per month; 0 when the candidate is not stipend-eligible. */
  monthlyShareMinor: number;
  totalShareMinor: number;
  paidMonths: number;
  /** INR actually paid out against this placement. */
  paidMinor: number;
  /** A payout already waiting to be paid for this placement. */
  pending: boolean;
  pendingPayoutId: string | null;
  remainingMonths: number;
  remainingMinor: number;
  /** YYYY-MM-DD of the next unpaid month, null when nothing is left. */
  nextDate: string | null;
  /** Employer side, when orders were supplied. */
  employer: EmployerSide | null;
  /**
   * The next stipend month is not yet covered by an employer payment. Legacy
   * did not block on this; it is shown so staff look before paying.
   */
  aheadOfEmployer: boolean;
};

export function addMonthsIso(iso: string | null | undefined, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  // Clamp to the last day of the target month (31 Jan + 1 month = 28/29 Feb).
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, mo, Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

/**
 * Legacy built the expected month keys with `Date#setMonth`, which rolls
 * over instead of clamping (31 Jan + 1 month = 3 Mar). Payout dates typed in
 * the legacy admin follow either form, so both are accepted when matching.
 */
function rolledMonthsIso(iso: string | null | undefined, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const out = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3])));
  return out.toISOString().slice(0, 10);
}

const rawOf = (raw: unknown) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});

export const proposalOf = (raw: unknown) => {
  const r = rawOf(raw);
  const id = r.proposalId ?? r.proposal_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
};

const dayOf = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** The date a payout stands for: scheduled, else paid, else created (legacy key). */
export function payoutDateKey(p: PayoutLike): string {
  const r = rawOf(p.raw);
  return dayOf(r.scheduledFor ?? r.scheduled_for) || dayOf(p.paidAt) || dayOf(p.createdAt);
}

/**
 * The intern's monthly share, falling back to `totalPrice / months` for
 * offers that store only a total (ADM-20; legacy routes.ts:17260-17268).
 */
export function monthlyShareOf(offer: Offer, score: number | null): number {
  const direct = internStipendInrMinor(offer, score);
  if (direct != null) return direct;
  if (!offer.totalMinor || offer.totalMinor <= 0) return 0;
  if (!stipendEligible(score)) return 0;
  const monthly = offer.totalMinor / Math.max(1, offer.months);
  const inr = offer.currency === "USD" ? toInrMinor(monthly, "USD") : monthly;
  return Math.floor(Math.round(inr) / 2);
}

/** Employer's monthly amount for the placement, in the offer currency. */
function employerMonthlyOf(offer: Offer): number {
  if (offer.monthlyMinor != null) return offer.monthlyMinor;
  if (offer.totalMinor && offer.totalMinor > 0) return Math.round(offer.totalMinor / Math.max(1, offer.months));
  return 0;
}

/** Proposal ids an order pays for, in every shape legacy and the new app write. */
export function orderIdsOf(raw: unknown): { ids: string[]; dueIds: string[]; mode: string; purpose: string } {
  const r = rawOf(raw);
  const notes = rawOf(r.notes ?? rawOf(r.order).notes);
  const list = (v: unknown): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    const s = String(v).trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        return list(JSON.parse(s));
      } catch {
        return [];
      }
    }
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  };
  const ids = list(notes.proposalIds ?? notes.proposal_ids ?? r.proposalIds ?? notes.proposalId ?? notes.proposal_id);
  return {
    ids,
    dueIds: list(notes.dueProposalIds),
    mode: String(notes.paymentMode ?? notes.payment_mode ?? "").trim().toLowerCase(),
    purpose: String(notes.purpose ?? "").trim().toLowerCase(),
  };
}

/**
 * What the employer has paid for one placement. "total" (legacy) or "upfront"
 * (early new-app rows) at checkout covers every month; otherwise each monthly
 * order, and each checkout that carried the placement as a due month, pays one.
 */
export function employerSide(proposalId: string, offer: Offer, orders: OrderLike[]): EmployerSide {
  let paidInFull = false;
  let paidMonths = 0;
  for (const o of orders) {
    if (String(o.status).toLowerCase() !== "paid") continue;
    const { ids, dueIds, mode, purpose } = orderIdsOf(o.raw);
    if (ids.includes(proposalId)) {
      if (mode === "total" || mode === "upfront") paidInFull = true;
      else if (mode === "monthly" || purpose === "employer_monthly_payment") paidMonths += 1;
    } else if (dueIds.includes(proposalId)) {
      paidMonths += 1;
    }
  }
  const months = offer.months;
  const monthlyMinor = employerMonthlyOf(offer);
  const covered = paidInFull ? months : Math.min(months, paidMonths);
  const dueMinor = paidInFull ? 0 : monthlyMinor * Math.max(0, months - covered);
  return {
    currency: offer.currency,
    monthlyMinor,
    totalMinor: offer.totalMinor ?? monthlyMinor * months,
    months,
    paidMonths: covered,
    paidInFull,
    dueMinor,
    monthlyInrMinor: toInrMinor(monthlyMinor, offer.currency),
    dueInrMinor: toInrMinor(dueMinor, offer.currency),
  };
}

export function stipendDues(
  proposals: ProposalLike[],
  payouts: PayoutLike[],
  score: number | null,
  orders?: OrderLike[],
): StipendDue[] {
  const paid = new Map<string, number>();
  const paidMinor = new Map<string, number>();
  const pending = new Map<string, string>();
  const unlinkedPaid: { amountMinor: number; key: string; used: boolean }[] = [];
  for (const p of payouts) {
    const id = proposalOf(p.raw);
    const status = String(p.status).toLowerCase();
    if (!id) {
      // ADP-18: the legacy admin also creates payouts with no placement; a
      // paid one counts against a month when amount and date match.
      const amount = Math.floor(Number(p.amountMinor ?? 0));
      const key = payoutDateKey(p);
      if (status === "paid" && amount > 0 && key) unlinkedPaid.push({ amountMinor: amount, key, used: false });
      continue;
    }
    if (status === "paid") {
      paid.set(id, (paid.get(id) ?? 0) + 1);
      paidMinor.set(id, (paidMinor.get(id) ?? 0) + toInrMinor(p.amountMinor ?? 0, p.currency));
    } else if (status === "pending" && !pending.has(id)) {
      pending.set(id, p.id ?? id);
    }
  }
  return proposals
    .filter((p) => isHiredProposal(p))
    .map((p) => ({ p, offer: parseOffer(p.offerDetails, p.currency) }))
    .filter(({ offer }) => !offer.fullTime)
    .map(({ p, offer }) => {
      const months = offer.months;
      const share = monthlyShareOf(offer, score);

      let matched = 0;
      let matchedMinor = 0;
      if (share > 0 && offer.startDate) {
        const keys = new Set<string>();
        for (let i = 1; i <= months; i++) {
          const a = addMonthsIso(offer.startDate, i);
          const b = rolledMonthsIso(offer.startDate, i);
          if (a) keys.add(a);
          if (b) keys.add(b);
        }
        for (const u of unlinkedPaid) {
          if (u.used || u.amountMinor !== share || !keys.has(u.key)) continue;
          u.used = true;
          matched += 1;
          matchedMinor += u.amountMinor;
        }
      }

      const paidMonths = Math.min(months, (paid.get(p.id) ?? 0) + matched);
      const remainingMonths = Math.max(0, months - paidMonths);
      const employer = orders ? employerSide(p.id, offer, orders) : null;
      const nextDate = remainingMonths > 0 ? addMonthsIso(offer.startDate, paidMonths + 1) : null;
      return {
        proposalId: p.id,
        employerId: p.employerId ?? "",
        startDate: offer.startDate,
        months,
        monthlyShareMinor: share,
        totalShareMinor: share * months,
        paidMonths,
        paidMinor: (paidMinor.get(p.id) ?? 0) + matchedMinor,
        pending: pending.has(p.id),
        pendingPayoutId: pending.get(p.id) ?? null,
        remainingMonths,
        remainingMinor: share * remainingMonths,
        nextDate,
        employer,
        aheadOfEmployer: Boolean(employer && remainingMonths > 0 && share > 0 && paidMonths >= employer.paidMonths),
      };
    });
}

/**
 * What is still owed to an intern across their placements: every unpaid
 * month at their share, from the dues table - not just payout rows already
 * created, which made a hired intern with no payout scheduled read as owed
 * nothing. Payouts not tied to a placement are added on top.
 */
export function owedMinor(dues: StipendDue[], unlinkedPendingMinor: number): number {
  return dues.reduce((sum, d) => sum + d.remainingMinor, 0) + unlinkedPendingMinor;
}

/* ── Payout guards (ADP-29) ─────────────────────────────────────────── */

/** Most a new payout on this placement may be: one month, never more than is owed. */
export function payoutCapMinor(due: StipendDue): number {
  return Math.max(0, Math.min(due.monthlyShareMinor, due.remainingMinor));
}

/**
 * Why a new payout on this placement is refused, or null when it may be
 * created. Legacy disabled "Create payout" on a dues row when the intern's
 * share is 0 (score below 6), when a payout is already pending, or when
 * nothing is left; it prefilled one month and could not exceed what was owed.
 */
export function payoutRefusal(due: StipendDue | undefined, amountMinor: number): string | null {
  if (!due) return "Payouts are created from a hired placement's dues. This placement has none.";
  if (due.monthlyShareMinor <= 0) return "No stipend is due on this placement: the intern's Findtern Score is below 6.";
  if (due.pending) return "A payout is already pending for this placement. Mark it paid or failed before creating another.";
  if (due.remainingMinor <= 0 || due.remainingMonths <= 0) return "Nothing is left to pay on this placement.";
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return "Enter an amount greater than zero.";
  const cap = payoutCapMinor(due);
  if (amountMinor > cap) return `That is more than one month's stipend still owed (at most ₹${(cap / 100).toLocaleString("en-IN")}).`;
  return null;
}

/* ── Payout series (raw.cycle, ADP-21 / DB-18) ──────────────────────── */

export type PayoutCycle = {
  remaining: number;
  monthsStep: number;
  amountMinor: number;
  currency: "INR" | "USD";
  method: string;
};

/**
 * The schedule legacy stores on a payout so marking it paid queues the next
 * month: `remaining` counts this payout too (routes.ts:8425-8483, client
 * admin-intern-detail.tsx:937-947).
 */
export function cycleFor(months: number, amountMinor: number, method: string): PayoutCycle {
  return { remaining: Math.max(1, Math.floor(months)), monthsStep: 1, amountMinor, currency: "INR", method: method || "bank" };
}

/**
 * The payout legacy queues when one with a saved schedule is marked paid
 * (routes.ts:8615-8657): same amount and method, `monthsStep` months after
 * this one's scheduled date, one month fewer to go. Null when the series is
 * over or the row carries no usable schedule.
 */
export function nextFromCycle(paid: { amountMinor: number; currency: string; method: string; raw: unknown }): {
  amountMinor: number;
  currency: string;
  method: string;
  scheduledFor: string;
  cycle: Record<string, unknown>;
} | null {
  const raw = rawOf(paid.raw);
  const cycle = raw.cycle && typeof raw.cycle === "object" ? (raw.cycle as Record<string, unknown>) : null;
  if (!cycle) return null;
  const remaining = Math.floor(Number(cycle.remaining ?? cycle.remainingMonths ?? 0));
  if (!Number.isFinite(remaining) || remaining <= 1) return null;
  const stepRaw = Math.floor(Number(cycle.monthsStep ?? 1));
  const step = Number.isFinite(stepRaw) ? Math.max(1, stepRaw) : 1;
  const amount = Math.floor(Number(cycle.amountMinor ?? cycle.amount_minor ?? paid.amountMinor ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const base = dayOf(raw.scheduledFor ?? raw.scheduled_for);
  const scheduledFor = base ? addMonthsIso(base, step) : null;
  if (!scheduledFor) return null;
  return {
    amountMinor: amount,
    currency: String(cycle.currency ?? paid.currency ?? "INR").toUpperCase() === "USD" ? "USD" : "INR",
    method: String(cycle.method ?? paid.method ?? "bank"),
    scheduledFor,
    cycle: { ...cycle, remaining: remaining - 1 },
  };
}
