import { bandFor, type BandId } from "@/lib/score";
import { cn } from "@/lib/utils";
import { ringArc } from "./card-geometry";

export type ScoreRingProps = {
  /** Findtern Score out of 10. Arc = score / 10, colour from `bandFor(score)` in lib/score. */
  score: number;
  /** Outer diameter in px. Default 56. */
  size?: number;
  /** Default 4. */
  strokeWidth?: number;
  className?: string;
};

/** One hue per band: Standard is the warm accent, Skilled a mid green, Assured the deepest. */
const ARC: Record<BandId, { arc: string; track: string }> = {
  standard: { arc: "stroke-accent-600", track: "stroke-accent-200" },
  skilled: { arc: "stroke-brand-500", track: "stroke-brand-100" },
  assured: { arc: "stroke-brand-800", track: "stroke-brand-100" },
};

/**
 * The Findtern Score as a ring: a track, an arc of score / 10 in the band's
 * colour, the figure in the middle. The arc is a static dash length (never
 * animated), so the final value is in the server HTML; the only motion is a
 * one-off opacity and 0.96 -> 1 scale on first paint (CSS `starting:`), which
 * `motion-reduce` switches off. The figure is real text; the SVG is decoration.
 */
export function ScoreRing({ score, size = 56, strokeWidth = 4, className }: ScoreRingProps) {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
  const band = bandFor(value);
  const r = (size - strokeWidth) / 2;
  const { arc, circumference: c } = ringArc(value, r);
  const label = `Findtern Score ${value.toFixed(1)} out of 10, ${band.name}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-grid shrink-0 place-items-center transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:scale-[0.96] starting:opacity-0 motion-reduce:transition-none",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className={ARC[band.id].track} />
        {value > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${c}`}
            className={ARC[band.id].arc}
          />
        ) : null}
      </svg>
      <span aria-hidden className={cn("nums relative font-semibold leading-none tracking-[-0.02em] text-ink-900", size < 48 ? "text-sm" : "text-base")}>
        {value.toFixed(1)}
      </span>
    </span>
  );
}
