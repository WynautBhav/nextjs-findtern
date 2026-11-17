/**
 * The one place that decides where an employer's proposal is counted. Pure and
 * import-free (the node tests run this file directly). Every employer counter
 * goes through here: the Proposals tabs, the dashboard figures and funnel, the
 * hire-flow strip on checkout / proposals / shortlist / candidates. They used
 * to each filter statuses on their own and disagreed for the same rows.
 *
 * Groups, each proposal in exactly one:
 *   open     sent or interview booked, waiting on the candidate ("awaiting")
 *   draft    saved, never sent: counted on its own, not as "waiting"
 *   accepted accepted or payment in progress: the employer's move is to pay
 *   hired    paid and placed
 *   viewOnly open/accepted offers of a taken-down project (an overlay on open + accepted, see ProposalRow.viewOnly)
 *   closed   declined, withdrawn, expired, or sent and unanswered past its start date
 *   null     a status nobody planned for; still counted (`other`), never dropped
 */
export type ProposalBucket = "open" | "draft" | "accepted" | "hired" | "closed";

/** Statuses are matched ignoring case, padding and spaces/hyphens ("Sent", "Interview Scheduled"): the database was inherited from the legacy app. */
export function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** `lapsed`: sent, unanswered, and past its start date (see offerState). */
export function proposalBucket(status: string, lapsed: boolean): ProposalBucket | null {
  const s = normalizeStatus(status);
  if (s === "draft") return "draft";
  if (lapsed) return "closed";
  if (s === "sent" || s === "interview_scheduled") return "open";
  if (s === "accepted" || s === "processing") return "accepted";
  if (s === "hired") return "hired";
  if (s === "rejected" || s === "withdrawn" || s === "expired") return "closed";
  return null;
}

/** `viewOnly`: the proposal's project is taken down by admin (projects.takenDownAt). Its open/accepted offers count as "View only", not Waiting / To pay. */
export type ProposalRow = { status: string; lapsed: boolean; viewOnly?: boolean };

export type ProposalCounts = {
  /** Every proposal. The Proposals page's "All" tab. */
  all: number;
  /** Everything not closed: awaiting + drafts + accepted + hired + other. The one number for "my proposals". */
  total: number;
  /** Open bucket: waiting on the candidate. */
  awaiting: number;
  drafts: number;
  /** Accepted bucket: accepted offers to pay for. */
  accepted: number;
  hired: number;
  closed: number;
  /** Unrecognised status: shown in "All" and in `total`, in no tab. */
  other: number;
  /**
   * Waiting or accepted offers on a project Findtern took down: no reply to wait for, nothing to pay while it is down.
   * Still inside `total`. The key is only present when there is one, so every other output is unchanged.
   */
  viewOnly?: number;
};

export function proposalCounts(rows: ProposalRow[]): ProposalCounts {
  const c = { all: rows.length, total: 0, awaiting: 0, drafts: 0, accepted: 0, hired: 0, closed: 0, other: 0 };
  let viewOnly = 0;
  for (const r of rows) {
    const b = proposalBucket(r.status, r.lapsed);
    if (r.viewOnly && (b === "open" || b === "accepted")) viewOnly += 1;
    else if (b === "open") c.awaiting += 1;
    else if (b === "draft") c.drafts += 1;
    else if (b === "accepted") c.accepted += 1;
    else if (b === "hired") c.hired += 1;
    else if (b === "closed") c.closed += 1;
    else c.other += 1;
  }
  c.total = c.all - c.closed;
  return viewOnly > 0 ? { ...c, viewOnly } : c;
}

/** The hire-flow strip (cart → proposals → checkout → hired). */
export type HireFlowCounts = {
  shortlisted: number;
  /** Proposals waiting on the candidate (= the Proposals "Waiting" tab). */
  awaitingReply: number;
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
    toPay: input.toPay,
    hired: new Set(input.proposals.filter((p) => proposalBucket(p.status, p.lapsed) === "hired").map((p) => p.internId)).size,
    proposals: counts.total,
  };
}
