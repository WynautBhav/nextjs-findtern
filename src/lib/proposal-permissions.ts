/**
 * Who may edit or withdraw a proposal, in each state. ONE table, read by both routes (api/proposals/[id] edit,
 * api/proposals/[id]/status withdraw) and by the employer screens (components/employer/proposal-state.ts), so a button
 * can never be offered that the server refuses, or the reverse. Pure: no imports, so the node tests run it directly.
 *
 * Owner rule (Vaibhav, 27 Nov 2026): the employer may WITHDRAW an offer until the hire is paid, even after the candidate
 * accepted, internship or full-time. EDITING closes once the candidate accepts. An unpaid accepted offer still expires
 * on its start date.
 *
 *   state                 | edit employer | edit admin | withdraw employer | withdraw admin
 *   draft                 | yes           | yes        | yes               | yes
 *   sent                  | yes           | yes        | yes               | yes
 *   interview_scheduled   | yes           | yes        | yes               | yes
 *   accepted (unpaid)     | no            | yes (1)    | yes               | yes
 *   processing (checkout) | no            | no         | no                | yes (2)
 *   rejected              | no            | no         | no                | no
 *   withdrawn             | no            | no         | no                | no
 *   expired (stored/computed) | no        | no         | no                | no
 *   hired (paid)          | no            | no         | no                | no
 *
 *   (1) internship only: a full-time offer is never edited after the answer.
 *   (2) internship only, and only an abandoned checkout (the status route re-checks the 30-minute window and open orders).
 *   Accepted withdrawals are refused by the status route while a payment order is open.
 *   A full-time offer is editable in the same window as an internship (before the candidate answers).
 */
export type ProposalActor = "employer" | "admin";
export type ProposalAction = "edit" | "withdraw";

const OPEN = ["draft", "sent", "interview_scheduled"];
const STATES: Record<ProposalAction, Record<ProposalActor, string[]>> = {
  edit: { employer: OPEN, admin: [...OPEN, "accepted"] },
  withdraw: { employer: [...OPEN, "accepted"], admin: [...OPEN, "accepted", "processing"] },
};

export type ProposalRowForPolicy = {
  status: string | null | undefined;
  hiredAt?: Date | string | null;
  fullTime: boolean;
  /** Stored `expired`, or an unanswered / unpaid offer whose start day has begun (proposal-expiry.ts expiryOf). */
  expired?: boolean;
};

const VERB: Record<ProposalAction, string> = { edit: "edited", withdraw: "withdrawn" };

/** Why the actor may not do this to the proposal, or null when it is allowed. The words are for the person who asked. */
export function proposalActionRefusal(action: ProposalAction, actor: ProposalActor, p: ProposalRowForPolicy): string | null {
  const status = (p.status ?? "").toLowerCase();
  const verb = VERB[action];
  if (p.hiredAt || status === "hired") return "This candidate is already hired, so the offer can't be changed.";
  if (p.expired || status === "expired") return `This offer has expired, so it can't be ${verb}. Send a new proposal instead.`;
  const fullTimeOk = !p.fullTime || OPEN.includes(status) || (action === "withdraw" && status === "accepted");
  if (STATES[action][actor].includes(status) && fullTimeOk) return null;
  if (actor === "employer" && status === "accepted") return "The candidate accepted this offer, so it can't be edited. You can still withdraw it until you pay.";
  if (actor === "employer" && status === "processing") return "A payment for this offer is in progress. Try again in a few minutes.";
  return action === "edit" ? `A ${status || "closed"} proposal can no longer be edited` : `Proposal is already ${status || "closed"}`;
}

/** The employer screens' view of the same table. */
export const employerMay = (action: ProposalAction, p: ProposalRowForPolicy): boolean => proposalActionRefusal(action, "employer", p) === null;
