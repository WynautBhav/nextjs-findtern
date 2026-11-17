/**
 * Emails and notification copy for the CGPA verification flow. Same EmailContent shape and tone as lib/emails.ts
 * (rendered by renderEmail, sent by notify()); kept in its own file so the verification copy lives in one place.
 * Templates never throw: a missing public origin only costs the button (see ctaTo in emails.ts).
 */
import type { EmailContent } from "../emails.ts";
import { linkTo } from "../origin.ts";

const hi = (name: string) => `Hi ${name || "there"},`;

function cta(label: string, path: string): EmailContent["cta"] {
  const url = linkTo(path);
  return url === null ? undefined : { label, url };
}

const unit = (type: string) => (type === "percentage" ? "%" : " / 10");

export const cgpaEmails = {
  /** To the intern when they accept an offer while their CGPA is still to be checked. */
  requestedForIntern: (o: { internName: string; semester: number | null; score: string; scoreType: string }): EmailContent => ({
    subject: "We’ll verify your CGPA within 24-48 hours | Findtern",
    preheader: "Findtern will call or email you to confirm your CGPA. Keep your phone nearby.",
    heading: "We’ll verify your CGPA within 24-48 hours",
    greeting: hi(o.internName),
    lines: [
      "You accepted an offer, so Findtern will now check the CGPA on your profile against the marksheets you uploaded.",
      "You’ll get a confirmation call or email from us within 24 to 48 hours. There is nothing else you need to do.",
    ],
    facts: [
      ...(o.semester ? ([["Semester", String(o.semester)]] as [string, string][]) : []),
      ["Score you entered", `${o.score}${unit(o.scoreType)}`],
    ],
    status: "Verification in progress",
    tone: "wait",
    cta: cta("View your profile", "/intern/profile"),
  }),

  /** To the Findtern team when an offer is accepted and the intern's CGPA is still pending. Internal. */
  dueForAdmin: (o: { internName: string; internId: string; proposalId: string; semester: number | null; score: string; scoreType: string; company: string; role: string; startDate: string | null }): EmailContent => ({
    subject: `CGPA to verify: ${o.internName}`,
    preheader: `${o.internName} accepted an offer from ${o.company}. Verify within 24-48 hours.`,
    heading: "A candidate accepted an offer and needs a CGPA check",
    greeting: "Hi team,",
    lines: ["Verify the CGPA against the uploaded proofs within 24 to 48 hours. The queue has the proofs and the phone number."],
    facts: [
      ["Candidate", `${o.internName} (${o.internId})`],
      ...(o.semester ? ([["Semester", String(o.semester)]] as [string, string][]) : []),
      ["Claimed score", `${o.score}${unit(o.scoreType)}`],
      ["Company", o.company],
      ["Role", o.role],
      ...(o.startDate ? ([["Start date", o.startDate]] as [string, string][]) : []),
      ["Proposal", o.proposalId],
    ],
    status: "Due within 48 hours",
    tone: "wait",
    cta: cta("Open the CGPA queue", "/admin/cgpa-verifications"),
    reason: "This is an internal alert from the Findtern platform.",
  }),

  verifiedForIntern: (o: { internName: string; score: string; scoreType: string }): EmailContent => ({
    subject: "Your CGPA is verified | Findtern",
    preheader: "Thanks for waiting. Nothing more to do on your side.",
    heading: "Your CGPA is verified",
    greeting: hi(o.internName),
    lines: [`We checked the ${o.score}${unit(o.scoreType)} on your profile against your marksheets and it is correct.`],
    status: "Verified",
    tone: "done",
    cta: cta("View your profile", "/intern/profile"),
  }),

  incorrectForIntern: (o: { internName: string; claimed: string; corrected: string; scoreType: string; note: string }): EmailContent => ({
    subject: "We corrected your CGPA | Findtern",
    preheader: `Your marksheets show ${o.corrected}${unit(o.scoreType)}. Your profile now carries that score.`,
    heading: "We corrected your CGPA",
    greeting: hi(o.internName),
    lines: [
      `The CGPA on your profile did not match your marksheets, so we updated it. Your profile now shows ${o.corrected}${unit(o.scoreType)}.`,
      "The company that made you an offer is told about the correction and confirms it before going ahead.",
      ...(o.note ? [`Note from Findtern: ${o.note}`] : []),
    ],
    facts: [
      ["You entered", `${o.claimed}${unit(o.scoreType)}`],
      ["Marksheets show", `${o.corrected}${unit(o.scoreType)}`],
    ],
    status: "Corrected",
    tone: "alert",
    cta: cta("View your profile", "/intern/profile"),
  }),
};

/** In-app copy for the employer. Initials only, as everywhere before a hire. */
export const cgpaEmployerCopy = {
  verified: (candidate: string, role: string) => ({
    title: "Candidate's CGPA verified",
    message: `Findtern verified the CGPA of ${candidate} for ${role}. Nothing more to do on this.`,
  }),
  incorrect: (candidate: string, role: string, from: string, to: string, scoreType: string) => ({
    title: "Candidate's CGPA was corrected",
    message: `Findtern corrected the CGPA of ${candidate} for ${role} from ${from}${unit(scoreType)} to ${to}${unit(scoreType)}. Review it and confirm to continue.`,
  }),
};
