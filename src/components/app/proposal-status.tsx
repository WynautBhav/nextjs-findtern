import { Pill, type Tone } from "@/components/app/primitives";

/** Shared mapping from a stored status to a human phrase and a tone.
 *
 *  The old screens printed the raw column value. `interview_first` is a fact
 *  about our schema, not about the candidate's life.
 *
 *  This module is server-safe: it has no client directive, so both server
 *  pages and client components can import it. Keeping it out of the
 *  "use client" offer-decision file is what lets the proposals list render
 *  on the server.
 */
export function proposalStatus(status: string | null): { label: string; tone: Tone; detail: string } {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
      return { label: "You are doing this", tone: "live", detail: "Your timesheet and stipend are running." };
    case "hired":
      return { label: "Converted to full time", tone: "paid", detail: "This became a permanent role." };
    case "rejected":
      return { label: "Not this time", tone: "closed", detail: "Nothing more is needed from you." };
    case "interview_scheduled":
      return { label: "Interview booked", tone: "waiting", detail: "Waiting on the interview to happen." };
    case "withdrawn":
      return { label: "Withdrawn", tone: "closed", detail: "The company closed this one." };
    case "expired":
      return { label: "Expired", tone: "closed", detail: "This offer ran out of time." };
    case "draft":
      return { label: "Not sent yet", tone: "neutral", detail: "The company has not sent this." };
    default:
      return { label: "Waiting on you", tone: "waiting", detail: "Read it and decide when you are ready." };
  }
}

export function StatusPill({ status }: { status: string | null }) {
  const s = proposalStatus(status);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}
