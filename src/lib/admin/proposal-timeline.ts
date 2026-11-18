/**
 * The dated steps of one proposal, oldest first, for the admin's read-only proposal page. Pure: reads only the row and its
 * `offerDetails` stamps (acceptedAt, declinedAt, lapsedAt, expiredAt, closedByAdminAt), so a missing stamp is simply
 * a missing step, never a made-up date.
 */
export type TimelineStep = { key: string; label: string; at: string };

type Input = {
  status: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  hiredAt: Date | string | null;
  offerDetails: unknown;
  /** The interview this offer follows (interview-first flow): when it was booked, if known. */
  interviewAt?: Date | string | null;
};

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "string" && v && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

export function proposalTimeline(p: Input): TimelineStep[] {
  const d = (p.offerDetails && typeof p.offerDetails === "object" && !Array.isArray(p.offerDetails) ? p.offerDetails : {}) as Record<string, unknown>;
  const steps: TimelineStep[] = [];
  const add = (key: string, label: string, at: unknown) => {
    const v = iso(at);
    if (v) steps.push({ key, label, at: v });
  };
  add("interview", "Interview booked", p.interviewAt);
  add("sent", "Proposal sent", p.createdAt);
  add("accepted", "Candidate accepted", d.acceptedAt);
  add("declined", "Candidate declined", d.declinedAt);
  add("hired", "Paid and hired", p.hiredAt);
  add("expired", d.expiredReason === "unpaid_past_start" ? "Expired: not paid before start" : d.expiredReason === "no_reply_past_start" ? "Expired: no reply before start" : "Expired", d.expiredAt);
  add("closed", "Closed by Findtern", d.closedByAdminAt);
  // Withdrawn / rejected without a stamp: the last update is the best date there is.
  if (["withdrawn", "rejected"].includes(p.status) && !steps.some((s) => ["declined", "closed"].includes(s.key))) add("ended", p.status === "withdrawn" ? "Withdrawn" : "Rejected", p.updatedAt);
  return steps.sort((a, b) => a.at.localeCompare(b.at));
}
