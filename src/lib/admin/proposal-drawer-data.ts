/**
 * One proposal as the Proposal pipeline prints it: its row words, its CSV row and the View drawer's data. Shared by the
 * Proposal pipeline table and the Projects page's offers pop-up, so both show the same words for the same offer.
 */
import { isPpoOffer, PIPELINE_LABEL, pipelinePay, type AcceptedPay, type PipelineBucket, type PipelineCsvRow } from "@/lib/admin/proposal-pipeline";
import { proposalTimeline } from "@/lib/admin/proposal-timeline";
import type { StatusTone } from "@/lib/admin/status-tone";
import type { CgpaGate } from "@/lib/cgpa-verification";
import { formatDate, formatIstClock, formatSlotTime } from "@/lib/format";
import { parseOffer } from "@/lib/offer";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";

export type DrawerProposal = {
  id: string;
  candidate: string;
  internId: string;
  email: string | null;
  phone: string | null;
  company: string;
  employerId: string;
  project: string;
  typeLabel: string;
  ppo: boolean;
  outcome: { label: string; tone: StatusTone; expired: boolean };
  /** Why it expired or closed, in the shared wording (EXPIRY_LABEL). */
  expiryLabel: string | null;
  flow: string;
  sent: string;
  /** Pay in the Projects tab's words: the employer's monthly amount and the intern's stipend are different numbers. */
  pay: { label: string; employerMonthly: string | null; internStipend: string | null };
  offerDetails: unknown;
  currency: string | null;
  steps: { key: string; label: string; at: string }[];
  interview: { status: string; booked: string; slot: string; link: string | null } | null;
};

export type PipelineItem = {
  id: string;
  /** The true status (expiry applied); `storedStatus` is what the database holds. */
  status: string;
  storedStatus?: string;
  flowType: string | null;
  currency: string | null;
  offerDetails: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
  hiredAt: Date | null;
  internId: string;
  internFirstName: string | null;
  internLastName: string | null;
  internEmail: string | null;
  internPhone: string | null;
  employerId: string;
  companyName: string | null;
  projectId: string;
  projectName: string | null;
  projectTimezone: string | null;
  bucket: PipelineBucket;
  /** Accepted only: waiting on the employer's payment, or the payment under way. */
  pay: AcceptedPay | null;
  expiryReason: ExpiryReason | null;
  interview: { id: string; status: string; createdAt: Date | null; slot: Date | null; timezone: string | null; meetingLink: string | null; isAi: boolean } | null;
  cgpaGate?: CgpaGate | null;
};


export const BUCKET_TONE: Record<PipelineBucket, StatusTone> = {
  pending: "warning",
  accepted: "info",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
  expired: "neutral",
};

export const nameOf = (r: PipelineItem) => `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim() || r.internEmail || "Candidate";
export const typeOf = (r: PipelineItem) => (parseOffer(r.offerDetails, r.currency).fullTime ? "Full-time proposal" : "Internship proposal");
export const projectOf = (r: PipelineItem) => r.projectName || parseOffer(r.offerDetails, r.currency).roleTitle || "-";
export const payOf = (r: PipelineItem) => pipelinePay(r.offerDetails, r.currency).label;
/** "27 Nov 2026, 12:53 PM IST". */
export const when = (d: Date | string | null | undefined) => (d ? `${formatDate(d)}, ${formatIstClock(d)}` : "-");

export function csvRowOf(r: PipelineItem): PipelineCsvRow {
  return {
    candidate: nameOf(r),
    employer: r.companyName ?? "Company",
    project: projectOf(r),
    type: `${typeOf(r)}${isPpoOffer(r.offerDetails, r.currency) ? " (PPO)" : ""}`,
    outcome: PIPELINE_LABEL[r.bucket],
    created: formatDate(r.createdAt),
    pay: payOf(r),
  };
}

export function drawerOf(r: PipelineItem): DrawerProposal {
  const iv = r.interview;
  return {
    id: r.id,
    candidate: nameOf(r),
    internId: r.internId,
    email: r.internEmail,
    phone: r.internPhone,
    company: r.companyName ?? "Company",
    employerId: r.employerId,
    project: projectOf(r),
    typeLabel: typeOf(r),
    ppo: isPpoOffer(r.offerDetails, r.currency),
    outcome: { label: PIPELINE_LABEL[r.bucket], tone: BUCKET_TONE[r.bucket], expired: r.bucket === "expired" },
    expiryLabel: r.expiryReason ? EXPIRY_LABEL[r.expiryReason] : null,
    flow: r.flowType === "interview_first" ? "Interview first" : "Direct offer",
    sent: when(r.createdAt),
    pay: pipelinePay(r.offerDetails, r.currency),
    offerDetails: r.offerDetails,
    currency: r.currency,
    steps: proposalTimeline({ status: r.storedStatus ?? r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, hiredAt: r.hiredAt, offerDetails: r.offerDetails, interviewAt: iv?.createdAt ?? null }).map((s) => ({
      ...s,
      at: when(s.at),
    })),
    interview: iv
      ? {
          status: iv.status,
          booked: when(iv.createdAt),
          slot: iv.slot ? `${formatSlotTime(iv.slot, iv.timezone || "Asia/Kolkata")} (${iv.timezone || "Asia/Kolkata"})` : "Not picked yet",
          link: iv.meetingLink,
        }
      : null,
  };
}

