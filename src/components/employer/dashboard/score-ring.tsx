export type ScoreRingProps = {
  /** Findtern Score out of 10. Arc = score / 10, colour from `bandFor(score)` in lib/score. */
  score: number;
  /** Outer diameter in px. Default 56. */
  size?: number;
  /** Default 4. */
  strokeWidth?: number;
  className?: string;
};

/** WP3 fills this in. WP0 ships the contract only; it renders nothing. */
export function ScoreRing(props: ScoreRingProps) {
  void props;
  return null;
}
