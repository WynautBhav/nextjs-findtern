import { cn } from "@/lib/utils";
import { scoreA11y, scoreParts } from "./score-helpers";
import { AXIS_ORDER, dialSegments, meanOf, singleSegment, type DialAxes } from "./score-dial-geometry";

const PX = { xs: 28, sm: 56, md: 104, lg: 176 } as const;
const STROKE = { xs: 3, sm: 5, md: 8, lg: 12 } as const;
const GAP = { xs: 0, sm: 8, md: 6, lg: 5 } as const;
const NUM = {
  sm: "text-[17px] font-medium !tracking-normal",
  md: "text-[36px] font-light",
  lg: "text-[64px] font-light",
} as const;
const LABELS = { communication: "Communication", coding: "Coding", aptitude: "Aptitude", interview: "Interview" } as const;

/** The Findtern score as a ring: four axis arcs (or one ring for the mean). Server-compatible. */
export function ScoreDial({
  score,
  axes,
  size = "md",
  tone = "light",
  showBand = true,
  className,
}: {
  score: number;
  axes?: DialAxes;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "light" | "dark";
  showBand?: boolean;
  className?: string;
}) {
  const px = PX[size];
  const sw = STROKE[size];
  const r = (px - sw) / 2;
  const dark = tone === "dark";
  const hasAxes = !!axes && AXIS_ORDER.some((k) => typeof axes[k] === "number");
  const segs = hasAxes && size !== "xs" ? dialSegments({ axes: axes!, r, gap: GAP[size] }) : [singleSegment({ score: size !== "xs" && hasAxes ? (meanOf(axes!) ?? score) : score, r })];
  const { value, band } = scoreParts(score);
  const label =
    scoreA11y(score) +
    (hasAxes ? ". " + AXIS_ORDER.filter((k) => typeof axes![k] === "number").map((k) => `${LABELS[k]} ${(axes![k] as number).toFixed(1)}`).join(", ") : "");
  const c = px / 2;
  return (
    <div role="img" aria-label={label} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: px, height: px }}>
      <svg aria-hidden viewBox={`0 0 ${px} ${px}`} width={px} height={px} className="absolute inset-0 size-full -rotate-90" fill="none" strokeWidth={sw}>
        {segs.map((s) => (
          <g key={s.key} transform={`rotate(${s.rotate} ${c} ${c})`}>
            <circle cx={c} cy={c} r={r} strokeDasharray={s.trackDash} className={dark ? "stroke-white/15" : "stroke-ink-200"} />
            {s.fillLength > 0 ? (
              <circle cx={c} cy={c} r={r} strokeDasharray={s.fillDash} className={cn("score-dial-fill", dark ? "stroke-data-on-dark" : "stroke-brand-600")} style={{ ["--dial-len" as string]: s.fillLength, ["--dial-circ" as string]: s.circumference }} />
            ) : null}
          </g>
        ))}
      </svg>
      {size !== "xs" ? (
        <div aria-hidden className={cn("relative flex flex-col items-center leading-none", dark ? "text-white" : "text-ink-900")}>
          <span className={cn("nums tabular-nums tracking-[-0.04em]", NUM[size])}>{value}</span>
          {showBand && (size === "md" || size === "lg") ? (
            <span className={cn("mt-1 text-xs font-medium", dark ? "text-on-dark-subtle" : "text-text-subtle")}>{band}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
