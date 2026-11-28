import { parseOffer } from "../offer.ts";

/**
 * A meeting's Internship / Full-time type: the linked offer's own type (parseOffer fullTime) when there is one, else the
 * kind of the campus drive the interview was matched to (college_drives.kind, as drive calls use), else Internship.
 * projects.fullTimeOffer is the employer's "Full-time role after the internship" answer: a note, never the type.
 */
export function meetingTrack(
  linkedOffer: { offerDetails: unknown; currency: string | null } | null,
  driveKind: string | null,
  projectFtAfterInternship: boolean | null | undefined,
): { track: "internship" | "full_time"; ftAfterInternship: boolean } {
  const fullTime = linkedOffer ? parseOffer(linkedOffer.offerDetails, linkedOffer.currency).fullTime !== null : driveKind === "full_time";
  return { track: fullTime ? "full_time" : "internship", ftAfterInternship: projectFtAfterInternship === true };
}
