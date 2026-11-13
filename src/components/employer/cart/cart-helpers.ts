import { shortDateTime } from "@/lib/format";
import type { CandidateProfile } from "@/lib/employer-candidates";

export type CartLineItem = {
  id: string;
  projectId: string;
  projectName: string;
  /** The project is closed (inactive): no new meetings or proposals on it. */
  projectClosed?: boolean;
  createdAt: string | null;
  candidate: CandidateProfile;
  /** The project's wanted skills, for the "matches N of M" line. */
  projectSkills?: string[];
  hourlyRateMinor: number;
  perHireMinor: number;
  /** A proposal already out to this candidate (any project), if any. */
  openProposalId?: string | null;
  /** An accepted offer to this candidate (any project): it is paid, not re-proposed. */
  acceptedProposalId?: string | null;
  /** An open meeting holds the candidate until this time (ISO); no new booking or proposal before. */
  meetingUntil?: string | null;
  /** The booked meeting's link while it is live, for "Join meeting". */
  meetingLink?: string | null;
  meetingInterviewId?: string | null;
};

/** The clock, read in event handlers only. */
export function nowMs(): number {
  return Date.now();
}

/** An open meeting still holds this candidate. */
export function meetingLocked(line: CartLineItem): boolean {
  return Boolean(line.meetingUntil && Date.parse(line.meetingUntil) > nowMs());
}

/** "3 Nov, 4:30 pm" in the company's timezone. */
export function untilLabel(iso: string, timeZone: string): string {
  return shortDateTime(new Date(iso), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone });
}
