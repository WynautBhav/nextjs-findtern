import { INR_PER_USD } from "../currency.ts";
import { formatMoney, formatNumber } from "../format.ts";
import { parseOffer, todayIst } from "../offer.ts";
import { heatOf, type Heat, type HeatGuide } from "./heat.ts";
import type { AcceptedPay, PipelineBucket } from "./proposal-pipeline.ts";

/**
 * Heat on the Proposals view: which open offers an admin should chase first. Built on the page's own status rules: the
 * bucket (proposalPipelineStatus), the Accepted part (acceptedPayOf) and the offer's start day, the moment an unanswered
 * or unpaid offer expires (proposal-expiry.ts). Only Pending and Accepted (not hired) rows are open; the rest get null.
 *
 * Every point comes from WEIGHTS, and the guide the page shows is written from the same numbers.
 */
export const WEIGHTS = {
  /** The student said yes and the employer has not paid: the hire is one payment away. */
  acceptedUnpaid: 40,
  /** Waiting for the student's reply. */
  pending: 15,
  /** The employer's payment is under way: little to do but watch. */
  paymentUnderWay: 5,
  /** Days until the start day, when an unanswered or unpaid offer expires. Not for payment under way (it never expires). */
  startIn2Days: 40,
  startIn7Days: 25,
  startIn14Days: 10,
  /** Pending: days since the offer was sent with no reply. */
  noReply7Days: 15,
  noReply3Days: 8,
  /** Accepted, not paid: days since the student said yes. */
  unpaid3Days: 10,
  /** Money at stake. */
  fullTime: 10,
  bigStipend: 5,
} as const;

/** "Big stipend": the employer pays this much a month or more (INR paise). */
export const BIG_MONTHLY_MINOR = 25_000 * 100;

const DAY = 86_400_000;
const dayNumber = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`) / DAY;

export type ProposalHeatInput = {
  bucket: PipelineBucket;
  pay: AcceptedPay | null;
  offerDetails: unknown;
  currency: string | null;
  createdAt: Date | string | null;
};

/** Whole days from today (India) to the offer's start day; null without a valid start day. */
export function daysToStart(offerDetails: unknown, now: Date): number | null {
  const d = offerDetails && typeof offerDetails === "object" ? (offerDetails as Record<string, unknown>) : {};
  const day = String(d.startDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return dayNumber(day) - dayNumber(todayIst(now));
}

const daysSince = (v: unknown, now: Date): number | null => {
  const t = v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now.getTime() - t) / DAY));
};
const plural = (n: number, w: string) => `${formatNumber(n)} ${w}${n === 1 ? "" : "s"}`;

export function proposalHeat(p: ProposalHeatInput, now: Date = new Date()): Heat | null {
  const unpaid = p.bucket === "accepted" && p.pay !== "processing";
  const underWay = p.bucket === "accepted" && p.pay === "processing";
  if (p.bucket !== "pending" && p.bucket !== "accepted") return null;

  const W = WEIGHTS;
  let score = 0;
  const why: string[] = [];
  const o = parseOffer(p.offerDetails, p.currency);

  // Deadline first: it is what makes a row hot.
  if (!underWay) {
    const left = daysToStart(p.offerDetails, now);
    if (left !== null) {
      if (left <= 2) score += W.startIn2Days;
      else if (left <= 7) score += W.startIn7Days;
      else if (left <= 14) score += W.startIn14Days;
      why.push(left <= 0 ? "Starts today" : `Starts in ${plural(left, "day")}`);
    }
  }

  if (unpaid) {
    score += W.acceptedUnpaid;
    const d = p.offerDetails && typeof p.offerDetails === "object" ? (p.offerDetails as Record<string, unknown>) : {};
    const since = daysSince(d.acceptedAt, now);
    if (since !== null && since >= 3) score += W.unpaid3Days;
    why.push(since === null ? "employer hasn't paid" : `employer hasn't paid in ${plural(since, "day")}`);
  } else if (underWay) {
    score += W.paymentUnderWay;
    why.push("payment under way");
  } else {
    score += W.pending;
    const since = daysSince(p.createdAt, now);
    if (since !== null && since >= 7) score += W.noReply7Days;
    else if (since !== null && since >= 3) score += W.noReply3Days;
    why.push(since === null ? "no reply yet" : `no reply in ${plural(since, "day")}`);
  }

  if (o.fullTime) {
    score += W.fullTime;
    const ctc = o.fullTime.annualCtcMinor;
    why.push(ctc != null ? `full-time, ${formatMoney(ctc, o.currency, { zeroLabel: false })} CTC` : "full-time");
  } else if (o.monthlyMinor != null) {
    const inr = o.currency === "USD" ? o.monthlyMinor * INR_PER_USD : o.monthlyMinor;
    if (inr >= BIG_MONTHLY_MINOR) score += W.bigStipend;
    why.push(`${formatMoney(o.monthlyMinor, o.currency, { zeroLabel: false })} a month`);
  }

  const out = heatOf(score, why);
  return { ...out, why: out.why.charAt(0).toUpperCase() + out.why.slice(1) };
}

/** The "What heat means" text, written from WEIGHTS so the guide and the score cannot disagree. */
const pts = (n: number) => `+${n}`;
export const PROPOSAL_HEAT_GUIDE: HeatGuide = {
  measures:
    "Heat shows which open proposals to chase first. An offer gets hotter when a hire is close to being lost: the start day is near, the student has not answered, or the employer has not paid.",
  factors: [
    { label: "Student said yes, employer has not paid", points: pts(WEIGHTS.acceptedUnpaid) },
    { label: "Waiting for the student's reply", points: pts(WEIGHTS.pending) },
    { label: "Employer's payment is under way", points: pts(WEIGHTS.paymentUnderWay) },
    { label: "Start day in 2 days or less (the offer expires then)", points: pts(WEIGHTS.startIn2Days) },
    { label: "Start day in 3 to 7 days", points: pts(WEIGHTS.startIn7Days) },
    { label: "Start day in 8 to 14 days", points: pts(WEIGHTS.startIn14Days) },
    { label: "No reply for 7 days or more", points: pts(WEIGHTS.noReply7Days) },
    { label: "No reply for 3 to 6 days", points: pts(WEIGHTS.noReply3Days) },
    { label: "Not paid 3 days or more after the student said yes", points: pts(WEIGHTS.unpaid3Days) },
    { label: "Full-time offer", points: pts(WEIGHTS.fullTime) },
    { label: `Internship paying ${formatMoney(BIG_MONTHLY_MINOR, "INR")} a month or more`, points: pts(WEIGHTS.bigStipend) },
  ],
  noHeat: "Hired, rejected, withdrawn and expired proposals. Nothing is left to do on them, so they show a dash and sit at the bottom.",
  action:
    "A hot row usually means a hire is days from expiring. If the employer has not paid, call or nudge the employer. If the student has not answered, nudge the student. Payment under way stays calm: the start day does not expire it.",
};

/** The Heat filter's four values: the three levels, and Closed for rows with no heat. */
export const HEAT_BANDS = ["hot", "warm", "calm", "closed"] as const;
export type HeatBand = (typeof HEAT_BANDS)[number];
export const heatBand = (h: Heat | null): HeatBand => (h ? h.level : "closed");
export const parseHeatBand = (v: string | undefined | null): HeatBand | "" => ((HEAT_BANDS as readonly string[]).includes(v ?? "") ? (v as HeatBand) : "");

/**
 * Heat order: open rows by score (hottest first for `desc`), closed rows always after them, newest first. Ties go
 * to the newest proposal.
 */
export function sortByHeat<R extends { heat: Heat | null; createdAt: Date | null }>(rows: R[], dir: "asc" | "desc" = "desc"): R[] {
  const t = (r: R) => (r.createdAt ? r.createdAt.getTime() : 0);
  return [...rows].sort((a, b) => {
    if (!a.heat || !b.heat) return a.heat ? -1 : b.heat ? 1 : t(b) - t(a);
    const d = dir === "desc" ? b.heat.score - a.heat.score : a.heat.score - b.heat.score;
    return d || t(b) - t(a);
  });
}
