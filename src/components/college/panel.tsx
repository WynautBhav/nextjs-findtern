import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The college card look: hairline border, no shadow. A local copy so admin restyles never repaint /college. */
const COLLEGE_SURFACE = "rounded-apple-xl border border-ink-200/80 bg-card";

/**
 * Panel - the one container every admin block sits in.
 *
 * Restrained on purpose: the `Surface` look (white, hairline border, `shadow-xs`
 * on the college's dark shell; the soft `shadow-tile` and no border on the
 * light console's grey canvas, which overrides it). The
 * dashboard has six of these on screen at once, so any heavier treatment turns
 * the page into a stack of competing boxes and the numbers stop being readable.
 */

export type PanelVariant = "plain" | "inset" | "rail" | "well";

/** Each variant's surface. Unset is the default card (`COLLEGE_SURFACE` + `shadow-xs`). */
const PANEL_VARIANT: Record<PanelVariant, string> = {
  // No surface: heading and content sit on the page ground, flush with its edges.
  plain:
    "[&_[data-panel-header]]:border-b-0 [&_[data-panel-header]]:px-0 [&_[data-panel-body]]:px-0",
  // Slightly darker than a card, no border.
  inset: "overflow-hidden rounded-apple-xl bg-surface",
  // Narrow side panel: card ground with a left rule only.
  rail: "overflow-hidden border-l border-ink-200/80 bg-card",
  // A recessed block with a hairline.
  well: "overflow-hidden rounded-apple-xl border border-ink-200 bg-surface",
};

export function Panel({
  as: Tag = "section",
  variant,
  bleed = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  /** Render as a `<ul>` (or `<div>`) when the panel *is* the list, so a list
      of rows is not a `<ul>` nested inside a bare `<section>`. */
  as?: "section" | "ul" | "div";
  /** Surface treatment. Leave unset for the standard card. */
  variant?: PanelVariant;
  /** Drops the inner padding of `PanelBody` (and `PanelHeader`'s sides), for tables and lists that run edge to edge. */
  bleed?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "apple-admin",
        variant ? PANEL_VARIANT[variant] : ["overflow-hidden shadow-xs", COLLEGE_SURFACE],
        bleed && "[&_[data-panel-body]]:p-0",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Accepted for old callers, not drawn: an icon before every panel
   * heading is a §0 template tell. */
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-panel-header=""
      className={cn(
        "apple-admin flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-ink-600">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PanelBody({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-panel-body="" className={cn("px-5 py-5", className)} {...props}>
      {children}
    </div>
  );
}
