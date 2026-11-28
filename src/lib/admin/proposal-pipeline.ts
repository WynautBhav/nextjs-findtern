import { isHiredProposal } from "../hire-status.ts";
import { internStipendInrMinor, parseOffer } from "../offer.ts";
import { formatMoney } from "../format.ts";
import type { ExpiryInput } from "../proposal-expiry.ts";
import { offerReplyOf } from "./dashboard-board-pure.ts";
import { csvCell } from "../../components/admin/dashboard/board/table-csv.ts";

/**
 * The Proposal pipeline's one bucket per sent proposal. Pure, so the KPI cards, the table they filter, the CSV and the
 * verify script share one definition. Built on the dashboard's reply rule (offerReplyOf: effectiveProposalStatus for
 * expiry, proposalOutcome for yes/no, isHiredProposal for hires), with "said yes" split into Hired and Accepted (not hired yet).
 * Drafts were never sent: null, and left out of every count.
 */
export const PIPELINE_BUCKETS = ["pending", "accepted", "hired", "rejected", "withdrawn", "expired"] as const;
export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_LABEL: Record<PipelineBucket, string> = {
  pending: "Pending",
  accepted: "Accepted",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const PIPELINE_HINT: Record<PipelineBucket | "all", string> = {
  all: "Every proposal sent",
  pending: "Waiting for the reply",
  accepted: "Said yes, not hired yet",
  hired: "Paid and hired",
  rejected: "Student said no",
  withdrawn: "Company took it back",
  expired: "Lapsed or closed",
};

export function proposalPipelineStatus(p: ExpiryInput & { status: string }, now: Date = new Date()): PipelineBucket | null {
  if (p.status === "draft") return null;
  const reply = offerReplyOf(p, now);
  if (reply === "accepted") return isHiredProposal(p) ? "hired" : "accepted";
  return reply;
}

/** The `status=` URL value, kept only when it names a bucket. */
export function parsePipelineStatus(v: string | undefined | null): PipelineBucket | "" {
  return (PIPELINE_BUCKETS as readonly string[]).includes(v ?? "") ? (v as PipelineBucket) : "";
}

/** A PPO: a full-time offer made on top of an earlier proposal (the dashboard's rule: offer_details.fullTimeOffer.baseProposalId). */
export function isPpoOffer(offerDetails: unknown, currency: string | null = null): boolean {
  if (!parseOffer(offerDetails, currency).fullTime) return false;
  const od = offerDetails && typeof offerDetails === "object" ? (offerDetails as Record<string, unknown>) : {};
  const ft = od.fullTimeOffer && typeof od.fullTimeOffer === "object" ? (od.fullTimeOffer as Record<string, unknown>) : {};
  return typeof ft.baseProposalId === "string";
}

/**
 * The Accepted bucket's two parts, from the stored status: `unpaid` (status accepted: waiting on the employer's payment)
 * and `processing` (the payment is under way). SQL twin of `unpaid`: scope.ts acceptedUnpaidWhere (the sidebar badge and
 * the dashboard's "Needs you" queue count the same set).
 */
export const ACCEPTED_PAY = ["unpaid", "processing"] as const;
export type AcceptedPay = (typeof ACCEPTED_PAY)[number];
export const ACCEPTED_PAY_LABEL: Record<AcceptedPay, string> = { unpaid: "Waiting on payment", processing: "Payment under way" };

export function acceptedPayOf(bucket: PipelineBucket, storedStatus: string): AcceptedPay | null {
  if (bucket !== "accepted") return null;
  return storedStatus === "processing" ? "processing" : "unpaid";
}

/**
 * The `pay=` URL value. Only `unpaid` is a filter (the sidebar badge and the dashboard's "Needs you" queue link to
 * `?status=accepted&pay=unpaid`); the page shows it as a removable tag, not as a part of the Accepted card. Anything else is ignored.
 */
export function parsePayFilter(v: string | undefined | null): "unpaid" | "" {
  return v === "unpaid" ? "unpaid" : "";
}

/** Proposal type: full-time when the offer carries a full-time block (parseOffer fullTime; a PPO is full-time), else internship. */
export const PIPELINE_TYPES = ["internship", "fulltime"] as const;
export type PipelineType = (typeof PIPELINE_TYPES)[number];
export const PIPELINE_TYPE_LABEL: Record<PipelineType, string> = { internship: "Internship", fulltime: "Full-time" };

export function proposalTypeOf(offerDetails: unknown, currency: string | null = null): PipelineType {
  return parseOffer(offerDetails, currency).fullTime ? "fulltime" : "internship";
}

/** The `type=` URL value, kept only when it names a type. */
export function parsePipelineType(v: string | undefined | null): PipelineType | "" {
  return (PIPELINE_TYPES as readonly string[]).includes(v ?? "") ? (v as PipelineType) : "";
}

/**
 * The type control's counts and the rows it leaves, from one pass: each segment's count is the Total sent card (and the
 * table, with no outcome card pressed) when that segment is picked.
 */
export function pipelineByType<R extends { type: PipelineType }>(rows: R[], type: PipelineType | "") {
  const counts = { all: rows.length, internship: 0, fulltime: 0 };
  for (const r of rows) counts[r.type] += 1;
  return { counts, rows: type ? rows.filter((r) => r.type === type) : rows };
}

/**
 * The cards and the table from one array: `rows` already carry the date, picker and search filters. Each card's count is the
 * number of rows the table shows when that card is pressed, the buckets add up to `total`, and the Accepted parts add up to
 * the Accepted card.
 */
export function pipelineView<R extends { bucket: PipelineBucket; pay?: AcceptedPay | null }>(rows: R[], status: PipelineBucket | "", pay: "unpaid" | "" = "") {
  const counts = Object.fromEntries(PIPELINE_BUCKETS.map((b) => [b, 0])) as Record<PipelineBucket, number>;
  const acceptedPay = { unpaid: 0, processing: 0 } as Record<AcceptedPay, number>;
  for (const r of rows) {
    counts[r.bucket] += 1;
    if (r.bucket === "accepted" && r.pay) acceptedPay[r.pay] += 1;
  }
  const byStatus = status ? rows.filter((r) => r.bucket === status) : rows;
  return { total: rows.length, counts, acceptedPay, rows: status === "accepted" && pay ? byStatus.filter((r) => r.pay === pay) : byStatus };
}

/** One table row as the screen prints it; the CSV writes exactly these columns. */
export type PipelineCsvRow = {
  /** "Hot 82: why", or "Closed" (proposal-heat.ts). */
  heat?: string;
  candidate: string;
  employer: string;
  project: string;
  type: string;
  outcome: string;
  created: string;
  pay: string;
};

export const PIPELINE_CSV_HEAD = ["Heat", "Candidate", "Employer", "Project or role", "Type", "Outcome", "Created", "Pay"] as const;

export function pipelineCsv(rows: PipelineCsvRow[]): string[][] {
  return [[...PIPELINE_CSV_HEAD], ...rows.map((r) => [r.heat ?? "", r.candidate, r.employer, r.project, r.type, r.outcome, r.created, r.pay].map(csvCell))];
}

/**
 * What an offer pays, in the words the Projects tab uses. Internship: the intern's stipend (internStipendInrMinor, with the
 * candidate score stored on the offer, as projects-board-pure paySummary does), which is not the employer's monthly amount;
 * full-time: the annual CTC. `employerMonthlyMinor` is what the company pays a month, for the drawer.
 */
export function pipelinePay(offerDetails: unknown, currency: string | null): { label: string; employerMonthly: string | null; internStipend: string | null } {
  const o = parseOffer(offerDetails, currency);
  if (o.fullTime) {
    const ctc = o.fullTime.annualCtcMinor;
    return { label: ctc != null ? `CTC ${formatMoney(ctc, o.currency, { zeroLabel: false })}` : "-", employerMonthly: null, internStipend: null };
  }
  const stipend = internStipendInrMinor(o, o.candidateScore);
  return {
    label: stipend != null ? `Stipend ${formatMoney(stipend, "INR", { zeroLabel: false })}/mo` : "-",
    employerMonthly: o.monthlyMinor != null ? formatMoney(o.monthlyMinor, o.currency, { zeroLabel: false }) : null,
    internStipend: stipend != null ? formatMoney(stipend, "INR", { zeroLabel: false }) : null,
  };
}
