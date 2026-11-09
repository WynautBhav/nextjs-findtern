import type { PresenceLabel } from "@/lib/presence";

/** Initials and photo only: never a name, contact or the intern's pay before a hire. */
export type MatchCardProps = {
  id: string;
  /** Intern page, with `?project=` when a fit exists. */
  href: string;
  initials: string;
  photoUrl: string | null;
  presence: PresenceLabel | null;
  /** "Pune · Remote", or "" when unknown (print "Location not stated"). */
  where: string;
  /** Null when not scored yet. */
  score: number | null;
  /** Best open project for this candidate; null when the employer has no open project. */
  fit: { hit: number; of: number; projectId: string; projectName: string } | null;
  /** Up to 3 skills; `matched` means the project wants it. */
  chips: { name: string; matched: boolean }[];
  /** Skills beyond `chips`. */
  more: number;
  /** Already on the shortlist for `fit.projectId`. SaveToggle needs `fit`; render it only when `fit` is set. */
  saved: boolean;
};

/** WP3 fills this in. WP0 ships the contract only; it renders nothing. */
export function MatchCard(props: MatchCardProps) {
  void props;
  return null;
}
