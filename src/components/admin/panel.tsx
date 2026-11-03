import { AlertTriangle, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { ThreadMark } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "./surface.ts";

/**
 * Panel - the one container every admin block sits in.
 *
 * A rounded card on the admin frame: `--admin-panel` ground (white in the
 * light theme), `--radius-admin-card`, no shadow. The edge is transparent in
 * light and a 1px rule in dark (`--admin-panel-edge`). The college console
 * has its own copy (`components/college/panel.tsx`).
 */

export type PanelVariant = "plain" | "inset" | "rail" | "well";

const PANEL_DEFAULT =
  "overflow-hidden rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)]";

/** Each variant's surface. Unset is the white panel default. */
const PANEL_VARIANT: Record<PanelVariant, string> = {
  // No surface: heading and content sit on the frame, flush with its edges.
  plain:
    "[&_[data-panel-header]]:px-0 [&_[data-panel-header]]:pt-0 [&_[data-panel-body]]:px-0",
  // One tone step off the panel, no edge.
  inset: "overflow-hidden rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel-2)]",
  // Narrow side panel: panel ground with a left rule only.
  rail: "overflow-hidden border-l border-[color:var(--admin-rule)] bg-[color:var(--admin-panel)]",
  // A recessed block, a tone step down.
  well: "overflow-hidden rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel-2)]",
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
  /** Surface treatment. Leave unset for the white panel default. */
  variant?: PanelVariant;
  /** Drops the inner padding of `PanelBody` (and `PanelHeader`'s sides), for tables and lists that run edge to edge. */
  bleed?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "apple-admin",
        variant ? PANEL_VARIANT[variant] : PANEL_DEFAULT,
        bleed && "[&_[data-panel-body]]:p-0",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * The small round arrow link ("open this"): a 36px circle (44px on touch)
 * with a diagonal arrow. `inverted` is for a filled tile, where it flips to
 * ink on the tile colour. Pass `stretch` to make the arrow's link cover the
 * whole `relative` parent (one link, no nested anchors).
 */
export function ArrowLinkButton({
  href,
  label,
  inverted = false,
  stretch = false,
  className,
}: {
  href: string;
  /** Accessible name, e.g. "Open interns". */
  label: string;
  inverted?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "apple-spring grid size-9 shrink-0 place-items-center rounded-full touch:size-11",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        inverted
          ? "bg-[color:var(--admin-tile-ink)] text-[color:var(--admin-tile)] hover:opacity-90"
          : "bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-tile)] hover:text-[color:var(--admin-tile-ink)]",
        stretch && "after:absolute after:inset-0 after:rounded-[inherit] after:content-['']",
        className,
      )}
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  linkHref,
  linkLabel,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Accepted for old callers, not drawn: an icon before every panel
   * heading is a §0 template tell. */
  icon?: LucideIcon;
  /** Right-side slot: buttons, a select, a count. */
  action?: React.ReactNode;
  /** Draws the small round arrow link at the far right of the header. */
  linkHref?: string;
  /** Accessible name for that link (default "Open <title>" when the title is text). */
  linkLabel?: string;
  className?: string;
}) {
  const arrowLabel = linkLabel ?? (typeof title === "string" ? `Open ${title}` : "Open");
  return (
    <header
      data-panel-header=""
      className={cn(
        "apple-admin flex flex-wrap items-start justify-between gap-3 px-[var(--admin-pad-panel)] pt-[var(--admin-pad-panel)] pb-1",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-text-subtle">{description}</p>
        ) : null}
      </div>
      {action || linkHref ? (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {linkHref ? <ArrowLinkButton href={linkHref} label={arrowLabel} /> : null}
        </div>
      ) : null}
    </header>
  );
}

export function PanelBody({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-panel-body="" className={cn("p-[var(--admin-pad-panel)]", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Admin page header: a 28-32px title, an optional one-sentence finding or
 * description under it (`subtitle`), and an action slot on the right. Fill the
 * slot with pill buttons: `ADMIN_PILL_PRIMARY` (filled) and
 * `ADMIN_PILL_SECONDARY` (outline) from `./surface.ts`.
 */
export function AdminPageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8", className)}>
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-balance break-words text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-text-subtle sm:text-base">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{action}</div> : null}
    </header>
  );
}

/**
 * Empty state that tells the admin what to do next.
 *
 * `action` is the part that matters: "No interns" alone leaves someone guessing
 * whether the table is broken or genuinely empty.
 */
export function AdminEmpty({
  title,
  body,
  action,
  icon: Icon,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon ? (
        <span
          aria-hidden
          className="mb-4 grid size-12 place-items-center rounded-full bg-[color:var(--admin-bar-tint)] text-foreground"
        >
          <Icon className="size-5" />
        </span>
      ) : (
        <ThreadMark className="mb-4" />
      )}
      <p className="text-balance text-base font-semibold tracking-[-0.01em] text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-pretty text-sm leading-relaxed text-text-subtle">{body}</p>
      {action ? (
        <ButtonLink href={action.href} variant="primary" size="sm" className={cn("mt-5", ADMIN_PILL_PRIMARY)}>
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}

/**
 * A failed query, said plainly (DESIGN.md §0: an outage is never "no data").
 * Pages catch their own load error and render this in place of the table.
 */
export function AdminLoadError({
  what,
  retryHref,
}: {
  /** What failed to load, e.g. "the candidate list". */
  what: string;
  retryHref?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span aria-hidden className="mb-4 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-base font-semibold text-foreground">Couldn&apos;t load {what}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-text-subtle">
        The database didn&apos;t answer. Nothing was changed. Try again in a moment; if it keeps failing, check the server logs.
      </p>
      {retryHref ? (
        <ButtonLink href={retryHref} variant="outline" size="sm" className={cn("mt-5", ADMIN_PILL_SECONDARY)}>
          Try again
        </ButtonLink>
      ) : null}
    </div>
  );
}

/**
 * Attention banner - the "123 interns have incomplete profiles" strip.
 *
 * Uses `warning` only when the count is actually non-zero; at zero it is not
 * rendered at all, because a permanently visible warning trains people to
 * ignore the one time it matters.
 */
export function AttentionBanner({
  count,
  total,
  noun = "interns",
  href,
}: {
  count: number;
  total: number;
  noun?: string;
  href?: string;
}) {
  if (count <= 0) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-admin-card)] bg-warning-soft px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-warning" />
        {/* One paragraph, not three spans: the count used to wrap onto its own
            line at tablet widths. Inline <strong>s wrap with the sentence. */}
        <p className="min-w-0 leading-relaxed text-foreground">
          <strong className="nums font-semibold text-foreground">{count.toLocaleString("en-IN")}</strong> of{" "}
          <strong className="nums font-semibold text-foreground">{total.toLocaleString("en-IN")}</strong> {noun}{" "}
          {count === 1 ? "has" : "have"} not finished onboarding, so employers can&apos;t see them yet.
        </p>
      </div>
      {href ? (
        <ButtonLink
          href={href}
          variant="outline"
          size="sm"
          className={cn("shrink-0 self-start sm:self-auto", ADMIN_PILL_SECONDARY)}
        >
          Review list
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      ) : null}
    </div>
  );
}
