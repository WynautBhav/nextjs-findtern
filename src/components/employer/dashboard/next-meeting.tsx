export type NextMeetingData = {
  /** Initials and photo only, as everywhere before a hire. Null when the candidate row is gone. */
  with: { initials: string; photoUrl: string | null } | null;
  /** Slot time in the employer's timezone, already formatted ("Mon 9 Nov, 4:30 pm"). */
  whenLabel: string;
  /** Server-computed "in 2 h 15 m". Static, no ticker. */
  untilLabel: string;
  projectName: string | null;
  /** Set only when the meeting link is live (`isMeetingLinkLive`); render `JoinMeetingButton` with it. */
  joinLink: string | null;
  /** "/employer/schedule". */
  scheduleHref: string;
};

export type NextMeetingProps = {
  /** Null: show the "Hired so far" / "Offers out" fallback instead. */
  meeting: NextMeetingData | null;
  /** Unique interns hired (funnel Hired stage). */
  hired: number;
  /** Proposals awaiting a reply. */
  offersOut: number;
};

/** WP1 fills this in. WP0 ships the contract only; it renders nothing. */
export function NextMeeting(props: NextMeetingProps) {
  void props;
  return null;
}
