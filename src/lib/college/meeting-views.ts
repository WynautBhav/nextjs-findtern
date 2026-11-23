import { CALL_GRACE_MS } from "./constants.ts";

/**
 * What the employer's drive page shows of a call, decided from the student's live membership of the drive's college
 * (R2-02 / R1-03). No server imports: unit-tested on its own.
 */
export type MeetingView = {
  id: string;
  driveId: string;
  employerId: string;
  userId: string;
  startsAt: string;
  status: string;
  meetingLink: string | null;
  company?: string;
  driveTitle?: string;
  /** The student's initials, so a call whose student is no longer in the candidate list still says whose it was. */
  studentLabel?: string;
  /** The student is no longer a member of the college: the call is closed for them, whatever the stored row says. */
  noLongerInDrive?: boolean;
};

export const NO_LONGER_IN_DRIVE = "Cancelled: no longer in this drive";

/**
 * A student who is no longer a live member of the drive's college (their leave was approved) is not one of the drive's
 * students: their open request or accepted call that has not happened yet reads as `cancelled` to the employer, as it does
 * to the student (who can no longer answer it). A student the officer merely excludes, or who falls under a raised CGPA
 * cutoff, is still a member: the student still has the call, so the employer keeps seeing it as it is. A call that already
 * happened (or a request that lapsed) is history and is never rewritten. The stored row is closed by whoever ends the membership.
 */
export function maskMeetingViews(views: MeetingView[], liveMemberIds: ReadonlySet<string>, labelOf?: ReadonlyMap<string, string>, now = Date.now()): MeetingView[] {
  return views.map((v) => {
    const label = labelOf?.get(v.userId);
    const out: MeetingView = label ? { ...v, studentLabel: label } : v;
    if (liveMemberIds.has(v.userId)) return out;
    const open = v.status === "requested" || (v.status === "accepted" && new Date(v.startsAt).getTime() + CALL_GRACE_MS >= now);
    if (open) return { ...out, status: "cancelled", meetingLink: null, noLongerInDrive: true };
    return v.status === "cancelled" ? { ...out, noLongerInDrive: true } : out;
  });
}
