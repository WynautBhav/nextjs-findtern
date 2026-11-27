/**
 * Who may edit or withdraw a proposal, in each state. ONE table, read by both routes (api/proposals/[id] edit,
 * api/proposals/[id]/status withdraw) and by the employer screens (components/employer/proposal-state.ts), so a button
 * can never be offered that the server refuses, or the reverse. Pure: no imports, so the node tests run it directly.
 *
 * Owner decision, 27 Nov 2026 (reverses the 23 Oct rule): once the candidate accepts, the EMPLOYER can no longer edit or
 * withdraw. Only Findtern (admin) can withdraw an accepted offer. An unpaid accepted offer still expires on its start date.
 *
 *   state                 | edit employer | edit admin | withdraw employer | withdraw admin
 *   draft                 | yes           | yes        | yes               | yes
 *   sent                  | yes           | yes        | yes               | yes
 *   interview_scheduled   | yes           | yes        | yes               | yes
 *   accepted (unpaid)     | no            | yes (1)    | no                | yes (1)
 *   processing (checkout) | no            | no         | no                | yes (2)
 *   rejected              | no            | no         | no                | no
 *   withdrawn             | no            | no         | no                | no
 *   expired (stored/computed) | no        | no         | no                | no
 *   hired (paid)          | no            | no         | no                | no
 *
 *   (1) internship only: a full-time acceptance is the hire itself, so it is never edited or withdrawn after the answer.
 *   (2) internship only, and only an abandoned checkout (the status route re-checks the 30-minute window and open orders).
 *   A full-time offer is editable in the same window as an internship (before the candidate answers).
 */
export type ProposalActor = "employer" | "admin";
export type ProposalAction = "edit" | "withdraw";

const OPEN = ["draft", "sent", "interview_scheduled"];
const STATES: Record<ProposalAction, Record<ProposalActor, string[]>> = {
  edit: { employer: OPEN, admin: [...OPEN, "accepted"] },
  withdraw: { employer: OPEN, admin: [...OPEN, "accepted", "processing"] },
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
  if (STATES[action][actor].includes(status) && (!p.fullTime || OPEN.includes(status))) return null;
  if (actor === "employer" && (status === "accepted" || status === "processing")) {
    return `The candidate accepted this offer, so it can't be ${verb}. Write to Findtern if something has changed.`;
  }
  return action === "edit" ? `A ${status || "closed"} proposal can no longer be edited` : `Proposal is already ${status || "closed"}`;
}

/** The employer screens' view of the same table. */
export const employerMay = (action: ProposalAction, p: ProposalRowForPolicy): boolean => proposalActionRefusal(action, "employer", p) === null;
