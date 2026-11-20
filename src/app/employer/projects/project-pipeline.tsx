import { cn } from "@/lib/utils";
import { acceptedPercent } from "@/lib/projects/list-summary";

/**
 * Proposals on one project, small: sent and accepted as words, and a bar for the accepted share (a hatched
 * track for everything sent, a solid fill for what was accepted). Real counts only. The fill grows from the
 * left once on first paint (transform only, off under reduced motion).
 */
export function ProjectPipeline({ sent, accepted, className }: { sent: number; accepted: number; className?: string }) {
  const pct = acceptedPercent(sent, accepted);
  return (
    <div className={cn("min-w-0", className)}>
      {sent > 0 ? (
        <p className="nums flex items-baseline gap-x-5 text-sm text-text-subtle">
          <span>
            Sent <span className="font-semibold text-ink-900">{sent}</span>
          </span>
          <span>
            Accepted <span className="font-semibold text-brand-700">{accepted}</span>
          </span>
        </p>
      ) : (
        <p className="text-sm text-text-subtle">No proposals sent yet</p>
      )}
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-[repeating-linear-gradient(135deg,var(--color-ink-200)_0_3px,transparent_3px_6px)]"
        role="img"
        aria-label={sent > 0 ? `${accepted} of ${sent} accepted` : "Nothing sent yet"}
      >
        <div
          className="h-full origin-left rounded-full bg-brand-600 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:scale-x-0 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
