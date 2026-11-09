import type { NextMeetingProps } from "./next-meeting";

/** One row of the hero queue. Same fields the old `Queue` used. */
export type HeroQueueItem = {
  count: number;
  label: string;
  detail: string;
  /** Longer explanation kept behind "How it works". */
  more?: string;
  href: string;
  cta: string;
};

export type HeroProps = {
  companyName: string;
  /** "Monday 9 November" in the employer's timezone, computed on the server. */
  dateLabel: string;
  /** Sum of `queue` counts: the lead figure. 0 means nothing needs the employer. */
  total: number;
  /** Things waiting on the employer, most urgent first, already filtered to count > 0. Show the first 3. */
  queue: HeroQueueItem[];
  /** The foot line: things waiting on candidates (meeting times to pick). Null when none. */
  waitingOnCandidates: { count: number; label: string; href: string } | null;
  /** True when the employer has sent at least one proposal: picks "Nothing needs you right now" over "Make your first hire". */
  hasProposals: boolean;
  /** The right-column card. */
  nextMeeting: NextMeetingProps;
};

/** WP1 fills this in. WP0 ships the contract only; it renders nothing. */
export function Hero(props: HeroProps) {
  void props;
  return null;
}
