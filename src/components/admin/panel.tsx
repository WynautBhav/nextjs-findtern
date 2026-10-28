import { AlertTriangle, ArrowRight, type LucideIcon } from "lucide-react";

import { PageHead, ThreadMark } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Panel - the one container every admin block sits in.
 *
 * Restrained on purpose: white surface, hairline border, `--shadow-xs`. The
 * dashboard has six of these on screen at once, so any heavier treatment turns
 * the page into a stack of competing boxes and the numbers stop being readable.
 */

export function Panel({
  as: Tag = "section",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  /** Render as a `<ul>` (or `<div>`) when the panel *is* the list, so a list
      of rows is not a `<ul>` nested inside a bare `<section>`. */
  as?: "section" | "ul" | "div";
}) {
  return (
    <Tag
      className={cn(
        "apple-panel apple-admin overflow-hidden bg-white",
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
    <div className={cn("px-5 py-5", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Admin page header.
 *
 * The old stub pages used a bare `<h1>` with an 8-unit bottom margin, so every
 * screen began with the same floating text and no way to act on it. This one
 * has a real title/subtitle pair and an action slot, which is where
 * "Export CSV" and "Send notification" live.
 */
export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return <PageHead title={title} lede={subtitle} action={action} />;
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
        <span aria-hidden className="mb-4 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="size-5" />
        </span>
      ) : (
        <ThreadMark className="mb-4" />
      )}
      <p className="text-balance text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</p>
      <p className="mt-1.5 max-w-md text-pretty text-sm leading-relaxed text-ink-600">{body}</p>
      {action ? (
        <ButtonLink href={action.href} variant="primary" size="sm" className="mt-5">
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
      <span aria-hidden className="mb-4 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-base font-semibold text-ink-900">Couldn&apos;t load {what}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
        The database didn&apos;t answer. Nothing was changed. Try again in a moment; if it keeps failing, check the server logs.
      </p>
      {retryHref ? (
        <ButtonLink href={retryHref} variant="outline" size="sm" className="mt-5">
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
      className="flex flex-col gap-3 rounded-apple-lg border border-accent-300/70 bg-accent-100/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent-500" />
        {/* One paragraph, not three spans: the count used to wrap onto its own
            line at tablet widths. Inline <strong>s wrap with the sentence. */}
        <p className="min-w-0 leading-relaxed text-ink-800">
          <strong className="nums font-semibold text-ink-900">{count.toLocaleString("en-IN")}</strong> of{" "}
          <strong className="nums font-semibold text-ink-900">{total.toLocaleString("en-IN")}</strong> {noun}{" "}
          {count === 1 ? "has" : "have"} not finished onboarding, so employers can&apos;t see them yet.
        </p>
      </div>
      {href ? (
        <ButtonLink href={href} variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
          Review list
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      ) : null}
    </div>
  );
}
