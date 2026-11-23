import { cgpaEmployerCopy, cgpaEmployerEmails } from "./emails/cgpa.ts";
import type { NotifyInput } from "./notify.ts";

/**
 * The notification an employer gets when Findtern decides the CGPA of a candidate with an accepted, unpaid offer from
 * them: verified (the offer is payable now) or corrected (confirm to continue). Pure, so the copy and the dedupe key are
 * tested; the routes pass the result to `notify`. One key per offer and decision time, so a retry or a second route that
 * records the same decision never notifies twice.
 */
export function cgpaEmployerNotice(o: {
  employerId: string;
  proposalId: string;
  /** "Candidate AB": initials only. */
  candidate: string;
  role: string;
  decision: "verified" | "incorrect";
  claimedScore: string;
  correctedScore: string;
  scoreType: string;
  /** ISO time of the decision. */
  at: string;
  /** The employer holds Findtern Pro: only then may the alert quote the scores. Absent means no (fail closed). */
  showScores?: boolean;
}): NotifyInput {
  const incorrect = o.decision === "incorrect";
  const copy = incorrect ? cgpaEmployerCopy.incorrect(o.candidate, o.role, o.showScores ? { from: o.claimedScore, to: o.correctedScore, scoreType: o.scoreType } : null) : cgpaEmployerCopy.verified(o.candidate, o.role);
  return {
    to: { type: "employer", id: o.employerId },
    type: incorrect ? "cgpa_incorrect" : "cgpa_verified",
    title: copy.title,
    message: copy.message,
    data: { proposalId: o.proposalId },
    dedupeKey: `cgpa_decision:${o.proposalId}:${o.at}`,
    email: incorrect ? cgpaEmployerEmails.incorrect({ candidate: o.candidate, role: o.role, proposalId: o.proposalId }) : cgpaEmployerEmails.verified({ candidate: o.candidate, role: o.role }),
  };
}
