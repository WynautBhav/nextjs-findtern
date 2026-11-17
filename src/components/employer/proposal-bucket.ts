import type { ExpiryReason } from "../../lib/proposal-expiry.ts";

/**
 * The one place that decides where an employer's proposal is counted. Pure (type-only import above; the node tests
 * run this file directly). Every employer counter goes through here: the Proposals tabs, the dashboard figures and
 * funnel, the hire-flow strip on checkout / proposals / shortlist / candidates. They used to each filter statuses on
 * their own and disagreed for the same rows.
 *
 * Groups, each proposal in exactly one:
 *   open       sent or interview booked, waiting on the candidate ("awaiting")
 *   draft      saved, never sent: counted on its own, not as "waiting"
 *   verifying  accepted, but Findtern is still confirming the candidate's CGPA (or the employer has to confirm a
 *              correction): not payable yet. Callers pass `verifying` from cgpaBlocksPayment (cgpa-verification.ts)
 *   accepted   accepted or payment in progress, payable: the employer's move is to pay ("To pay")
 *   hired      paid and placed
 *   viewOnly   open/accepted/verifying offers of a taken-down project (an overlay, see ProposalRow.viewOnly)
 *   closed     declined, withdrawn, expired, accepted-and-unpaid past its start date, or sent and unanswered past it
 *   null       a status nobody planned for; still counted (`other`), never dropped
 */
export type ProposalBucket = "open" | "draft" | "verifying" | "accepted" | "hired" | "closed";

/** Statuses are matched ignoring case, padding and spaces/hyphens ("Sent", "Interview Scheduled"): the database was inherited from the legacy app. */
export function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** What the caller knows beyond the status: the CGPA gate, and why an offer expired (proposal-expiry.ts expiryOf). */
export type BucketFlags = { verifying?: boolean; expiredReason?: ExpiryReason | null };

/** `lapsed`: sent, unanswered, and past its start date (see offerState). */
export function proposalBucket(status: string, lapsed: boolean, flags: BucketFlags = {}): ProposalBucket | null {
  const s = normalizeStatus(status);
  if (s === "draft") return "draft";
  if (lapsed) return "closed";
  if (s === "sent" || s === "interview_scheduled") return "open";
  if (s === "accepted") {
    // Accepted and never paid before its start day: no longer payable, so it is closed, not "to pay".
    if (flags.expiredReason === "unpaid_past_start") return "closed";
    return flags.verifying ? "verifying" : "accepted";
  }
  if (s === "processing") return "accepted";
  if (s === "hired") return "hired";
  if (s === "rejected" || s === "withdrawn" || s === "expired") return "closed";
  return null;
}

/** Why a closed proposal is closed, for the sub-label. */
export type ClosedReason = "declined" | "withdrawn" | "expired_unpaid" | "expired_no_reply" | "accepted_elsewhere" | "admin_closed";

export const CLOSED_LABEL: Record<ClosedReason, string> = {
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired_unpaid: "Expired · not paid before start",
  expired_no_reply: "Expired · no reply before start",
  // Legacy status `expired`: set when the candidate accepted another offer from the same company.
  accepted_elsewhere: "Closed · candidate accepted another offer",
  admin_closed: "Closed by Findtern",
};

/** The closed reasons in the order the Closed tab lists them. */
export const CLOSED_ORDER: ClosedReason[] = ["declined", "withdrawn", "expired_unpaid", "expired_no_reply", "accepted_elsewhere", "admin_closed"];

/** Null when the proposal is not in the closed bucket. */
export function closedReasonOf(status: string, lapsed: boolean, flags: BucketFlags = {}): ClosedReason | null {
  if (proposalBucket(status, lapsed, flags) !== "closed") return null;
  const s = normalizeStatus(status);
  if (lapsed) return "expired_no_reply";
  if (s === "rejected") return "declined";
  if (s === "withdrawn") return "withdrawn";
  if (s === "accepted") return "expired_unpaid";
  // Stored `expired`: its reason, or the legacy kind (the candidate accepted another offer).
  switch (flags.expiredReason) {
    case "unpaid_past_start":
      return "expired_unpaid";
    case "no_reply_past_start":
      return "expired_no_reply";
    case "admin_closed":
      return "admin_closed";
    case "withdrawn":
      return "withdrawn";
    default:
      return "accepted_elsewhere";
  }
}

/** `viewOnly`: the proposal's project is taken down by admin (projects.takenDownAt). Its open/accepted offers count as "View only", not Waiting / To pay. */
export type ProposalRow = { status: string; lapsed: boolean; viewOnly?: boolean } & BucketFlags;

export type ProposalCounts = {
  /** Every proposal. The Proposals page's "All" tab. */
  all: number;
  /** Everything not closed: awaiting + drafts + verifying + accepted + hired + other. The one number for "my proposals". */
  total: number;
  /** Open bucket: waiting on the candidate. */
  awaiting: number;
  drafts: number;
  /** Accepted bucket: accepted offers the employer can pay for now. */
  accepted: number;
  hired: number;
  closed: number;
  /** Unrecognised status: shown in "All" and in `total`, in no tab. */
  other: number;
  /**
   * Waiting, verifying or accepted offers on a project Findtern took down: no reply to wait for, nothing to pay while it is down.
   * Still inside `total`. The key is only present when there is one, so every other output is unchanged.
   */
  viewOnly?: number;
  /** Accepted offers whose candidate's CGPA is being confirmed: not payable yet. Present only when there is one. */
  verifying?: number;
};

export function proposalCounts(rows: ProposalRow[]): ProposalCounts {
  const c = { all: rows.length, total: 0, awaiting: 0, drafts: 0, accepted: 0, hired: 0, closed: 0, other: 0 };
  let viewOnly = 0;
  let verifying = 0;
  for (const r of rows) {
    const b = proposalBucket(r.status, r.lapsed, r);
    if (r.viewOnly && (b === "open" || b === "accepted" || b === "verifying")) viewOnly += 1;
    else if (b === "open") c.awaiting += 1;
    else if (b === "draft") c.drafts += 1;
    else if (b === "verifying") verifying += 1;
    else if (b === "accepted") c.accepted += 1;
    else if (b === "hired") c.hired += 1;
    else if (b === "closed") c.closed += 1;
    else c.other += 1;
  }
  c.total = c.all - c.closed;
  return { ...c, ...(viewOnly > 0 ? { viewOnly } : {}), ...(verifying > 0 ? { verifying } : {}) };
}

/** How many closed proposals there are per reason (the Closed tab's one-line summary). Only reasons that occur. */
export function closedBreakdown(rows: ProposalRow[]): { reason: ClosedReason; count: number }[] {
  const n = new Map<ClosedReason, number>();
  for (const r of rows) {
    const reason = closedReasonOf(r.status, r.lapsed, r);
    if (reason) n.set(reason, (n.get(reason) ?? 0) + 1);
  }
  return CLOSED_ORDER.filter((reason) => n.has(reason)).map((reason) => ({ reason, count: n.get(reason)! }));
}

/** The hire-flow strip (cart → waiting → verifying → to pay → hired). */
export type HireFlowCounts = {
  shortlisted: number;
  /** Proposals waiting on the candidate (= the Proposals "Waiting" tab). */
  awaitingReply: number;
  /** Accepted, CGPA being confirmed (= the Proposals "Verifying CGPA" tab). */
  verifying: number;
  toPay: number;
  hired: number;
  /** Every proposal not closed (= the Proposals page's total). */
  proposals: number;
};

/**
 * Strip numbers from plain rows. `toPay` comes from the caller (the checkout's
 * own payable lines), so the strip and the page below it cannot disagree.
 * A candidate with a live offer (even a lapsed one, which still holds them
 * until withdrawn) is no longer "shortlisted, no proposal yet".
 */
export function hireFlowFrom(input: { cartInternIds: string[]; proposals: (ProposalRow & { internId: string })[]; toPay: number }): HireFlowCounts {
  const counts = proposalCounts(input.proposals);
  const proposedTo = new Set(input.proposals.filter((p) => !["rejected", "withdrawn", "expired"].includes(normalizeStatus(p.status))).map((p) => p.internId));
  return {
    shortlisted: new Set(input.cartInternIds.filter((id) => !proposedTo.has(id))).size,
    awaitingReply: counts.awaiting,
    verifying: counts.verifying ?? 0,
    toPay: input.toPay,
    hired: new Set(input.proposals.filter((p) => proposalBucket(p.status, p.lapsed, p) === "hired").map((p) => p.internId)).size,
    proposals: counts.total,
  };
}
