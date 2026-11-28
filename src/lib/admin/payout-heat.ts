import { formatMoney, formatNumber } from "../format.ts";
import { heatOf, type Heat, type HeatGuide } from "./heat.ts";
import { payoutCapMinor, payoutDateKey, type StipendDue } from "./stipend-dues.ts";

/**
 * Heat on /admin/payouts: which unpaid stipends to deal with first. It only reads the page's own money rules, never
 * changes them: a ledger payout's date is payoutDateKey (scheduled, else the day it was added), a placement's next
 * month is stipendDues' nextDate with payoutCapMinor as its amount, "employer hasn't paid" is aheadOfEmployer, and
 * "can't be marked paid" is canPayOut's bank check (the same one the mark-paid route enforces).
 *
 * Open rows: a ledger payout still `pending`, and a placement with a stipend month still owed. Paid, failed and
 * cancelled payouts, and placements with nothing left (or no stipend), are closed and get null. A failed transfer is
 * closed in the ledger because its month shows as owed again on Dues by placement, where it is retried.
 *
 * Every point comes from WEIGHTS, and the guide the page shows is written from the same numbers.
 */
export const WEIGHTS = {
  /** The pay date has passed. */
  overdue: 40,
  /** Plus this much for each day late, up to LIMITS.lateDays days. */
  perDayLate: 3,
  /** Due today or in the next 3 days. */
  dueIn3Days: 30,
  /** Due in 4 to 7 days. */
  dueIn7Days: 15,
  /** It can't be marked paid: the intern's bank details are missing or incomplete. */
  noBank: 25,
  /** The employer hasn't paid for this month yet (on a post-paid hire the payout stays locked until they do). */
  employerBehind: 20,
  /** Money at stake: this much per full ₹10,000, up to LIMITS.amountSteps steps. */
  per10k: 5,
} as const;

export const LIMITS = { lateDays: 10, amountSteps: 3 } as const;
const STEP_MINOR = 10_000 * 100;

export type PayoutHeatInput = {
  open: boolean;
  /** YYYY-MM-DD the money is due. */
  dueDay: string | null;
  /** The payout has no pay date: dueDay is the day it was added. */
  undated?: boolean;
  /** INR paise at stake. */
  amountInrMinor: number;
  /** Non-null when the payout can't be marked paid (canPayOut's reason). */
  bankProblem?: string | null;
  employerBehind?: boolean;
  /** Dues row: a payout for this month already exists and waits to be marked paid (shown, adds nothing). */
  payoutWaiting?: boolean;
};

const DAY = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const plural = (n: number, w: string) => `${formatNumber(n)} ${w}${n === 1 ? "" : "s"}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Points for the amount at stake. */
export const amountPoints = (inrMinor: number) => WEIGHTS.per10k * Math.min(LIMITS.amountSteps, Math.max(0, Math.floor(inrMinor / STEP_MINOR)));

/** `today` is the India calendar day (istDayKey). */
export function payoutHeat(p: PayoutHeatInput, today: string): Heat | null {
  if (!p.open) return null;
  const W = WEIGHTS;
  let score = 0;
  const why: string[] = [];

  const left = p.dueDay && ISO.test(p.dueDay) && ISO.test(today) ? dayNumber(p.dueDay) - dayNumber(today) : null;
  if (left !== null) {
    if (left < 0) {
      const late = -left;
      score += W.overdue + W.perDayLate * Math.min(late, LIMITS.lateDays);
      why.push(p.undated ? `Added ${plural(late, "day")} ago with no pay date` : `${plural(late, "day")} overdue`);
    } else {
      if (left <= 3) score += W.dueIn3Days;
      else if (left <= 7) score += W.dueIn7Days;
      const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${plural(left, "day")}`;
      why.push(p.undated ? "Added today with no pay date" : `Due ${when}`);
    }
  } else {
    why.push("No pay date");
  }

  if (p.bankProblem) {
    score += W.noBank;
    why.push(/no bank/i.test(p.bankProblem) ? "no bank details" : "bank details incomplete");
  }
  if (p.employerBehind) {
    score += W.employerBehind;
    why.push("employer hasn't paid this month");
  }
  if (p.payoutWaiting) why.push("payout created, not marked paid");

  score += amountPoints(p.amountInrMinor);
  if (p.amountInrMinor > 0) why.push(formatMoney(p.amountInrMinor, "INR", { zeroLabel: false }));

  const out = heatOf(score, why);
  return { ...out, why: out.why.charAt(0).toUpperCase() + out.why.slice(1) };
}

/* ── The two kinds of row on the page ────────────────────────────────── */

/** A ledger payout is open while it is pending. */
export const isOpenPayout = (status: string | null | undefined) => String(status ?? "").toLowerCase() === "pending";

export function ledgerHeatInput(
  r: { status: string; raw: unknown; scheduledFor: string | null; paidAt: Date | string | null; createdAt: Date | string | null; inrMinor: number },
  bankProblem: string | null,
): PayoutHeatInput {
  return {
    open: isOpenPayout(r.status),
    dueDay: payoutDateKey({ status: r.status, raw: r.raw, paidAt: r.paidAt, createdAt: r.createdAt }) || null,
    undated: !r.scheduledFor,
    amountInrMinor: r.inrMinor,
    bankProblem,
  };
}

/** A placement is open while a stipend month is still owed on it. */
export const isOpenDue = (d: Pick<StipendDue, "remainingMinor" | "monthlyShareMinor">) => d.remainingMinor > 0 && d.monthlyShareMinor > 0;

export function duesHeatInput(d: StipendDue, bankProblem: string | null): PayoutHeatInput {
  return {
    open: isOpenDue(d),
    dueDay: d.nextDate,
    amountInrMinor: payoutCapMinor(d),
    bankProblem,
    employerBehind: d.aheadOfEmployer,
    payoutWaiting: d.pending,
  };
}

/* ── Filter, order, CSV ─────────────────────────────────────────────── */

export const HEAT_BANDS = ["hot", "warm", "calm", "closed"] as const;
export type HeatBand = (typeof HEAT_BANDS)[number];
export const heatBand = (h: Heat | null): HeatBand => (h ? h.level : "closed");
export const parseHeatBand = (v: string | undefined | null): HeatBand | "" => ((HEAT_BANDS as readonly string[]).includes(v ?? "") ? (v as HeatBand) : "");

export function bandCounts(heats: (Heat | null)[]): Record<HeatBand, number> {
  const out: Record<HeatBand, number> = { hot: 0, warm: 0, calm: 0, closed: 0 };
  for (const h of heats) out[heatBand(h)] += 1;
  return out;
}

/** Open rows by score (hottest first for desc), closed rows after them. Ties keep the incoming order (stable sort). */
export function sortByHeat<R extends { heat: Heat | null }>(rows: R[], dir: "asc" | "desc" = "desc"): R[] {
  return [...rows].sort((a, b) => {
    if (!a.heat || !b.heat) return a.heat ? -1 : b.heat ? 1 : 0;
    return dir === "desc" ? b.heat.score - a.heat.score : a.heat.score - b.heat.score;
  });
}

/**
 * One page of "open rows by heat, then closed rows": which slice of the (fully loaded) open rows it shows, and the
 * offset and count to read from the closed rows in SQL. No row is skipped or shown twice across pages.
 */
export function heatPageSplit(openCount: number, offset: number, limit: number) {
  const openStart = Math.min(offset, openCount);
  const openEnd = Math.min(offset + limit, openCount);
  return { openStart, openEnd, closedOffset: Math.max(0, offset - openCount), closedLimit: limit - (openEnd - openStart) };
}

export const DUE_SORTS = ["heat", "next"] as const;
export type DueSort = (typeof DUE_SORTS)[number];

/** The Dues table after the heat filter and sort. "next" orders by the next payment date; rows with none stay last either way. */
export function dueHeatView<R extends { heat: Heat | null; nextDate: string | null }>(rows: R[], band: HeatBand | "", sort: DueSort, dir: "asc" | "desc"): R[] {
  const list = band ? rows.filter((d) => heatBand(d.heat) === band) : rows;
  if (sort === "heat") return sortByHeat(list, dir);
  return [...list].sort((a, b) => {
    if (!a.nextDate || !b.nextDate) return a.nextDate ? -1 : b.nextDate ? 1 : 0;
    const d = a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0;
    return dir === "asc" ? d : -d;
  });
}

const LEVEL_WORD = { hot: "Hot", warm: "Warm", calm: "Calm" } as const;
/** The CSV "Heat" cell: "Hot 82: why", or "Closed". */
export const heatCsv = (h: Heat | null) => (h ? `${LEVEL_WORD[h.level]} ${h.score}: ${h.why}` : "Closed");

/* ── The written rules ──────────────────────────────────────────────── */

const money = (minor: number) => formatMoney(minor, "INR", { zeroLabel: false });
const FACTORS: { key: keyof typeof WEIGHTS; label: string; points: string }[] = [
  { key: "overdue", label: "The pay date has passed (a payout with no pay date counts from the day it was added)", points: `+${WEIGHTS.overdue}` },
  { key: "perDayLate", label: `Each day late, up to ${LIMITS.lateDays} days`, points: `+${WEIGHTS.perDayLate} a day, up to +${WEIGHTS.perDayLate * LIMITS.lateDays}` },
  { key: "dueIn3Days", label: "Due today or in the next 3 days", points: `+${WEIGHTS.dueIn3Days}` },
  { key: "dueIn7Days", label: "Due in 4 to 7 days", points: `+${WEIGHTS.dueIn7Days}` },
  { key: "noBank", label: "Intern's bank details are missing or incomplete, so it can't be marked paid", points: `+${WEIGHTS.noBank}` },
  { key: "employerBehind", label: "Employer hasn't paid for this month yet (Dues by placement)", points: `+${WEIGHTS.employerBehind}` },
  {
    key: "per10k",
    label: `Money at stake, for each full ${money(STEP_MINOR)}`,
    points: `+${WEIGHTS.per10k}, up to +${WEIGHTS.per10k * LIMITS.amountSteps}`,
  },
];

/** Which weight each guide row shows, in order (for the test that keeps the guide and the score in step). */
export const PAYOUT_HEAT_FACTOR_KEYS = FACTORS.map((f) => f.key);

export const PAYOUT_HEAT_GUIDE: HeatGuide = {
  measures:
    "Heat shows which unpaid stipends to deal with first. A row gets hotter once its pay date has passed and with each day late, as the date gets close, when something stops it being paid, and when more money is waiting.",
  factors: FACTORS.map(({ label, points }) => ({ label, points })),
  noHeat:
    "Paid, failed and cancelled payouts, and placements with nothing left to pay. A failed transfer shows up again as owed on Dues by placement, so it gets its heat there. These rows show a dash and sit at the bottom.",
  action:
    "A hot row is usually an intern waiting for money that is already late. Pay it and record the bank reference. If the bank details are missing, ask the intern for them. If the employer hasn't paid, chase the employer first.",
};
