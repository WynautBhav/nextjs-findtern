import { cn } from "@/lib/utils";

import type { VisibilityState } from "./visibility-state";

/**
 * The profile visibility status: "Hidden" blinks red, "Visible" blinks green, anything else ("Not visible yet") is a
 * quiet neutral pill with no blink. Meaning is never colour alone: the text label is always there, and the dot is
 * decoration (aria-hidden). The blink is two opacity-only loops (.status-blink on the dot, .status-halo on a ring around
 * it, src/app/globals.css; nothing is painted behind the text, so its contrast never changes). They run only under
 * prefers-reduced-motion: no-preference; otherwise it is a static dot.
 * The dot box is a fixed size-3, and the pill is the same height as <Pill size="sm"> (text-xs line box), so a state change moves nothing.
 *
 * Wanted on the profile page too (one line there: swap `<Pill tone={status.tone}>` for this); left out of this change
 * because that page is being redesigned on another branch.
 */
const STYLE: Record<VisibilityState, string> = {
  hidden: "bg-danger-soft text-danger ring-danger/30",
  live: "bg-success-soft text-success ring-success/30",
  waiting: "bg-accent-100 text-accent-700 ring-accent-300/70",
};

export function VisibilityPill({ state, children, className }: { state: VisibilityState; children: React.ReactNode; className?: string }) {
  const blinks = state !== "waiting";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset", STYLE[state], className)}>
      {blinks ? (
        <span aria-hidden className="relative grid size-3 shrink-0 place-items-center">
          <span className="status-halo absolute inset-0 rounded-full bg-current opacity-0" />
          <span className="status-blink relative size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
