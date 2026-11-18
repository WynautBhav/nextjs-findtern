import { cn } from "@/lib/utils";
import type { TrailStage } from "@/components/employer/proposal-trail";

/**
 * The four-stage trail (Sent, Accepted, Paid, Starts) as one hairline with a node per stage and the date under it.
 * Server-safe, no state. `attention` rings the current stage in the signal colour: the move is yours (pay, confirm).
 */
export function StageTrail({ stages, attention = false, className }: { stages: TrailStage[]; attention?: boolean; className?: string }) {
  return (
    <ol aria-label="Progress" className={cn("grid grid-cols-4", className)}>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const nextDone = stages[i + 1]?.state === "done";
        return (
          <li key={s.key} className="relative min-w-0 pr-1" aria-current={s.state === "current" ? "step" : undefined}>
            <div className="relative flex h-4 items-center">
              <span
                aria-hidden
                className={cn(
                  "relative z-10 size-3 shrink-0 rounded-full",
                  s.state === "done" && "bg-brand-700",
                  s.state === "current" && (attention ? "bg-surface-raised ring-2 ring-signal" : "bg-surface-raised ring-2 ring-brand-700"),
                  s.state === "todo" && "bg-surface-raised ring-1 ring-ink-300",
                  s.state === "closed" && "bg-ink-300",
                )}
              />
              {!last ? <span aria-hidden className={cn("absolute left-3 right-0 top-1/2 h-px -translate-y-1/2", s.state === "done" && nextDone ? "bg-brand-700" : "bg-ink-300")} /> : null}
            </div>
            <p className={cn("mt-1.5 text-xs", s.state === "done" || s.state === "current" ? "font-medium text-ink-900" : "text-ink-600")}>
              {s.label}
              <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (next)" : s.state === "closed" ? " (did not happen)" : ""}</span>
            </p>
            {s.date ? <p className="nums text-xs text-ink-600">{s.date}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
