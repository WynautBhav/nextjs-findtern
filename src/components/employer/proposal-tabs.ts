import type { ClosedReason, ProposalBucket } from "./proposal-bucket.ts";

/**
 * The Proposals page's tabs: which one a proposal is under, what each says about itself, and what an empty one says.
 * Pure (the node tests run it). The count behind each tab is `proposalCounts` (proposal-bucket.ts): there is no second counter.
 *
 * Every proposal is under exactly one of the state tabs (waiting, verifying, to pay, hired, closed; plus drafts and
 * view only when there are some). "All" is the sum. A tab that reads 0 while "All" reads 2 only means the two are in
 * another tab, and the line under the tab bar says what each tab holds.
 */
export type TabKey = "all" | "open" | "draft" | "verifying" | "accepted" | "viewonly" | "hired" | "closed";

export const TAB_KEYS: ReadonlySet<string> = new Set<TabKey>(["all", "open", "draft", "verifying", "accepted", "viewonly", "hired", "closed"]);

/** `?status=` as the dashboard and the strip link it. Unknown values show All. */
export function tabFromParam(value: string | string[] | undefined): TabKey {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && TAB_KEYS.has(v) ? (v as TabKey) : "all";
}

/**
 * The query string (`?status=verifying&project=x`, or "" for none) that makes `tab` the one the URL names, other params
 * kept. "All" is the default, so it drops the param. The inverse of `tabFromParam`: a clicked tab, a shared link and a
 * reload all name the same tab.
 */
export function tabQuery(search: string, tab: TabKey): string {
  const params = new URLSearchParams(search);
  if (tab === "all") params.delete("status");
  else params.set("status", tab);
  const q = params.toString();
  return q ? `?${q}` : "";
}

/** How often the page re-reads while a CGPA check is open, and the least gap between two reads (focus fires with visibility). */
export const VERIFYING_REFRESH_MS = 60_000;
export const REFRESH_MIN_GAP_MS = 5_000;

/**
 * Whether the Proposals page should re-read the server now. Only a CGPA check Findtern is still running changes by
 * itself (the admin decides it, the employer's page cannot know), so nothing else polls; a hidden tab never does.
 * `waitingOnFindtern` counts offers whose gate is pending or overdue.
 */
export function shouldAutoRefresh(o: { waitingOnFindtern: number; visible: boolean; sinceLastMs: number }): boolean {
  return o.waitingOnFindtern > 0 && o.visible && o.sinceLastMs >= REFRESH_MIN_GAP_MS;
}

/** Whether a proposal in `bucket` (and `viewOnly`, a taken-down project) shows under `tab`. */
export function inTab(tab: TabKey, bucket: ProposalBucket | null, viewOnly: boolean): boolean {
  const heldDown = viewOnly && (bucket === "open" || bucket === "accepted" || bucket === "verifying");
  if (tab === "all") return true;
  if (tab === "viewonly") return heldDown;
  return bucket === tab && !heldDown;
}

export const TAB_LABEL: Record<TabKey, { label: string; short: string }> = {
  all: { label: "All", short: "All" },
  open: { label: "Waiting for candidate", short: "Waiting" },
  draft: { label: "Drafts · not sent", short: "Drafts" },
  verifying: { label: "Verifying CGPA", short: "Verifying" },
  accepted: { label: "To pay", short: "To pay" },
  viewonly: { label: "View only · taken down", short: "View only" },
  hired: { label: "Hired", short: "Hired" },
  closed: { label: "Closed", short: "Closed" },
};

/** One line under the tab bar for the active tab. */
export const TAB_EXPLAINER: Record<TabKey, string> = {
  all: "Every proposal, closed ones included. Each sits in exactly one tab, so the tab counts add up to the All count.",
  open: "These candidates have not replied yet. They can accept until the start date.",
  draft: "Saved but never sent. The candidate sees nothing until you send it.",
  verifying: "These candidates accepted. Findtern is confirming their CGPA (usually 24-48 h) before you can pay.",
  accepted: "These candidates accepted and are waiting for payment. Pay to confirm the hire.",
  viewonly: "Findtern took these projects down. You can view the offers, but there is nothing to reply to or pay while a project is down.",
  hired: "Paid and placed. You can see the candidate's name and contact details.",
  closed: "Offers that ended: declined by the candidate, withdrawn by you, or expired.",
};

/** Shown when a tab has no proposals (with no search or filter applied). */
export const TAB_EMPTY: Record<TabKey, { title: string; body: string }> = {
  all: { title: "No proposals yet", body: "Open a candidate, then use Send proposal." },
  open: { title: "Nothing waiting on a candidate", body: "Offers you have sent and not heard back on show here." },
  draft: { title: "No drafts", body: "Offers you saved without sending show here." },
  verifying: { title: "No CGPA checks in progress", body: "Only candidates whose CGPA Findtern is still checking show here. Most offers go straight to To pay." },
  accepted: { title: "Nothing to pay right now", body: "When a candidate accepts and their CGPA is confirmed, the offer shows here, ready to pay." },
  viewonly: { title: "No offers on taken-down projects", body: "Offers on projects Findtern took down show here." },
  hired: { title: "No hires yet", body: "Once an accepted offer is paid, the placement shows here." },
  closed: { title: "No closed proposals", body: "Declined, withdrawn and expired offers show here." },
};

/** "2 declined · 1 expired: not paid before start", for the Closed tab. */
const CLOSED_SHORT: Record<ClosedReason, [string, string]> = {
  declined: ["declined", "declined"],
  withdrawn: ["withdrawn", "withdrawn"],
  expired_unpaid: ["not paid before start", "expired"],
  expired_no_reply: ["no reply before start", "expired"],
  accepted_elsewhere: ["accepted another offer", "closed"],
  admin_closed: ["closed by Findtern", "closed"],
};

export function closedSummary(parts: { reason: ClosedReason; count: number }[]): string {
  return parts
    .map(({ reason, count }) => {
      const [text, verb] = CLOSED_SHORT[reason];
      return reason === "declined" || reason === "withdrawn" ? `${count} ${text}` : `${count} ${verb}: ${text}`;
    })
    .join(" · ");
}
