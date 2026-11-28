import { cn } from "@/lib/utils";
import { HEAT_LABEL, type Heat } from "@/lib/admin/master-data-pure";

/**
 * Heat as three steps: filled bars (1 calm, 2 warm, 3 hot) and the word with its score, so the level never rests on
 * colour alone. The why line shows on hover and on keyboard focus (and is the accessible description).
 */
const FILL = { hot: 3, warm: 2, calm: 1 } as const;
const BAR = { hot: "bg-accent-600", warm: "bg-accent-500", calm: "bg-ink-400" } as const;

export function HeatMark({ heat, id, compact = false }: { heat: Heat; id: string; compact?: boolean }) {
  const tip = `heat-why-${id}`;
  return (
    <span className="group/heat relative inline-flex">
      <span
        tabIndex={0}
        aria-describedby={tip}
        className="inline-flex min-h-8 items-center gap-2 rounded-md px-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <span aria-hidden className="flex items-end gap-[2px]">
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("w-[3px] rounded-[1px]", i === 1 ? "h-[7px]" : i === 2 ? "h-[10px]" : "h-[13px]", i <= FILL[heat.level] ? BAR[heat.level] : "bg-ink-200")} />
          ))}
        </span>
        <span className={cn("nums text-sm", heat.level === "hot" ? "font-semibold text-foreground" : heat.level === "warm" ? "font-medium text-foreground" : "text-text-subtle")}>
          {HEAT_LABEL[heat.level]}
          {compact ? null : <span className="ml-1 font-normal text-text-subtle">{heat.score}</span>}
        </span>
      </span>
      <span
        id={tip}
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 w-max max-w-[16rem] -translate-y-1/2 whitespace-normal rounded-lg bg-foreground px-2.5 py-1.5 text-xs leading-snug text-background opacity-0 shadow-[0_6px_20px_-6px_rgb(0_0_0/0.35)] transition-opacity duration-150 group-hover/heat:opacity-100 group-has-[:focus-visible]/heat:opacity-100 motion-reduce:transition-none"
      >
        {heat.why}
      </span>
    </span>
  );
}
