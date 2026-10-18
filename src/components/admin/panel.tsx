import type { LucideIcon } from "lucide-react";
import Link from "next/link";

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
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
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
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden /> : null}
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-text-subtle">
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
  return (
    <div className="apple-admin mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="apple-title text-[28px] font-bold leading-[34px] text-ink-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-[14px] leading-6 text-text-subtle">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
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
    <div className="apple-admin flex flex-col items-center px-6 py-14 text-center">
      {Icon ? (
        <span
          aria-hidden
          className="mb-3 grid size-11 place-items-center rounded-full bg-ink-100 text-ink-400"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-text-subtle">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center rounded-[10px] bg-brand-700 px-4 text-[14px] font-medium text-white hover:bg-brand-600"
        >
          {action.label}
        </Link>
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
      className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 backdrop-blur-xs sm:flex-row sm:items-center sm:justify-between dark:text-amber-200"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="relative mt-1.5 flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        {/* One paragraph, not three spans: the count used to wrap onto its own
            line at tablet widths. Inline <strong>s wrap with the sentence. */}
        <p className="min-w-0 leading-relaxed text-amber-800 dark:text-amber-300">
          <strong className="font-semibold text-amber-900 dark:text-amber-100">Action Required:</strong>{" "}
          <strong className="font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {count.toLocaleString("en-IN")}
          </strong>{" "}
          {noun} {count === 1 ? "has" : "have"} incomplete onboarding profiles out of{" "}
          <strong className="font-semibold tabular-nums text-amber-900 dark:text-amber-100">
            {total.toLocaleString("en-IN")}
          </strong>{" "}
          total registered signups.
        </p>
      </div>
      {href ? (
        <Link
          href={href}
          className="apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-[10px] bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-500/25 sm:self-auto dark:text-amber-100"
        >
          <span>Review Triage Queue</span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
