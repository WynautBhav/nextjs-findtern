import Link from "next/link";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The Pipeline page's two views, one click apart: Proposals | Meetings. Plain links (each view has its own URL, so the back
 * button and a bookmark keep the view), with `aria-current` on the open one. Each segment carries the same "needs you"
 * figure as the sidebar badge (queue-counts.ts), so the two never disagree. A view the admin may not open is left out; with
 * only one left there is nothing to switch, so the control is not drawn.
 */
export type PipelineSegment = { key: "proposals" | "meetings"; label: string; href: string; count: number | null; note: string };

export function PipelineToggle({ active, segments }: { active: PipelineSegment["key"]; segments: PipelineSegment[] }) {
  if (segments.length < 2) return null;
  return (
    <nav aria-label="Pipeline view" className="inline-flex w-full rounded-full bg-[color:var(--admin-panel-2)] p-1 sm:w-auto">
      {segments.map((s) => {
        const on = s.key === active;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none sm:min-h-10 sm:flex-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              on ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "text-text-subtle hover:bg-[color:var(--admin-panel)] hover:text-foreground",
            )}
          >
            {s.label}
            {s.count != null ? (
              <span
                title={`${formatNumber(s.count)} ${s.note}`}
                className={cn("nums inline-flex min-w-6 justify-center rounded-full px-1.5 text-xs font-semibold leading-5", on ? "bg-white/20" : "bg-ink-100 text-ink-700")}
              >
                {formatNumber(s.count)}
                <span className="sr-only"> {s.note}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
