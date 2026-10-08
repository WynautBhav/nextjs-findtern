import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Panel — the one container every admin block sits in.
 *
 * Restrained on purpose: white surface, hairline border, `--shadow-xs`. The
 * dashboard has six of these on screen at once, so any heavier treatment turns
 * the page into a stack of competing boxes and the numbers stop being readable.
 */

export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xs",
        className,
      )}
      {...props}
    >
      {children}
    </section>
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
        "flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span
            aria-hidden
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-text-subtle">
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
    <div className={cn("px-5 py-4", className)} {...props}>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-text-subtle">{subtitle}</p>
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
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon ? (
        <span
          aria-hidden
          className="mb-3 grid size-11 place-items-center rounded-full bg-ink-100 text-ink-400"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-text-subtle">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Attention banner — the "123 interns have incomplete profiles" strip.
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 backdrop-blur-xs dark:text-amber-200"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-semibold text-amber-900 dark:text-amber-100">Action Required:</span>
          <span className="font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {count.toLocaleString("en-IN")}
          </span>
          <span className="text-amber-800 dark:text-amber-300">
            {noun} {count === 1 ? "has" : "have"} incomplete onboarding profiles out of{" "}
            <span className="font-semibold tabular-nums text-amber-900 dark:text-amber-100">
              {total.toLocaleString("en-IN")}
            </span>{" "}
            total registered signups.
          </span>
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-500/25 dark:text-amber-100"
        >
          <span>Review Triage Queue</span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
