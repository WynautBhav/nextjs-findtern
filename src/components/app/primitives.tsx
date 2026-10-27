import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the candidate and intern surfaces.
 *
 * Every screen is rebuilt from these so that two screens never disagree about
 * what a heading looks like or what an empty state teaches. The old app had
 * one shared abstraction, a 17 line `PageHeader` and a dashed `EmptyState`,
 * which is why nine screens ended up hand rolling their own borders.
 */

/* ── Page head ──────────────────────────────────────────────────────────
 * The one page title for every role (AdminPageHeader and the employer
 * PageHeader are thin wrappers). Set on the marketing site's display scale,
 * so a signed-in page has the same voice as the page that sold it. The
 * eyebrow is optional and meant for section landings, not every screen. */

export function PageHead({
  title,
  lede,
  eyebrow,
  action,
  className,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-balance text-3xl font-semibold leading-[1.12] tracking-[-0.025em] text-ink-900">{title}</h1>
        {lede ? <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-ink-600">{lede}</p> : null}
      </div>
      {action ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{action}</div> : null}
    </header>
  );
}

/* ── Hero band ──────────────────────────────────────────────────────────
 * The home page's dark green wash, for the top of a dashboard: one greeting,
 * one sentence on what matters today, one or two actions, and (optionally)
 * the handful of figures that answer "how am I doing". Used once per screen
 * at most; more than one and it stops being the focal point. */

export function HeroBand({
  eyebrow,
  title,
  lede,
  actions,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  /** Figures under the copy, usually a row of `StatTile tone="onDark"`. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative isolate mb-8 overflow-hidden rounded-apple-xl bg-brand-950 px-6 py-8 text-white sm:px-9 sm:py-10", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_15%_-20%,rgb(22_107_84/0.6)_0%,transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent-300">{eyebrow}</p> : null}
          <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">{title}</h1>
          {lede ? <p className="mt-3 max-w-xl text-pretty text-base leading-relaxed text-on-dark-subtle sm:text-lg">{lede}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap gap-3 sm:w-auto">{actions}</div> : null}
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────────────
 * A figure that matters, set large. "0" and "None" are facts too, but the
 * caller should prefer a sentence ("No interviews yet") over a hero zero:
 * pass `value={null}` and an `empty` line. */

export function StatTile({
  label,
  value,
  hint,
  empty,
  href,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode | null;
  hint?: React.ReactNode;
  /** Shown in place of the figure when `value` is null. */
  empty?: string;
  href?: string;
  tone?: "default" | "onDark";
  className?: string;
}) {
  const dark = tone === "onDark";
  const body = (
    <>
      <p className={cn("text-sm font-medium", dark ? "text-on-dark-subtle" : "text-ink-600")}>{label}</p>
      {value === null ? (
        <p className={cn("mt-2 text-base font-medium", dark ? "text-white/80" : "text-ink-700")}>{empty ?? "-"}</p>
      ) : (
        <p className={cn("nums mt-1.5 text-3xl font-semibold leading-tight tracking-[-0.02em]", dark ? "text-white" : "text-ink-900")}>{value}</p>
      )}
      {hint ? <p className={cn("mt-1.5 text-sm", dark ? "text-on-dark-subtle" : "text-ink-600")}>{hint}</p> : null}
    </>
  );
  const cls = cn(
    "block min-w-0 rounded-apple-lg p-5",
    dark ? "bg-white/[0.06] ring-1 ring-inset ring-white/10" : "border border-ink-200/80 bg-white shadow-xs",
    href && (dark ? "apple-spring hover:bg-white/[0.1]" : "apple-spring hover:border-brand-300 hover:shadow-sm"),
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Section heading inside a page. Smaller and quieter than a page title. */
export function SectionHead({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-600">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ── Surface ───────────────────────────────────────────────────────────
 * One border, one radius, one shadow step. The old screens used
 * `rounded-xl border border-ink-100 bg-white` in nine places and
 * `rounded-xl ... shadow-xs` in one, which is how a radius difference of four
 * pixels shipped unnoticed. */

export function Surface({
  children,
  className,
  as: As = "div",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "ul";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "min-w-0 rounded-apple-xl border border-ink-200/80 bg-white shadow-xs",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/* ── Status pill ────────────────────────────────────────────────────────
 * One pill component for every state in the product. Before this the same
 * status was rendered as `bg-brand-50 text-brand-700` on some screens, as a
 * bare uppercase string on others, and as the literal database enum
 * `interview_first` on a third. Enums never reach a user. */

export type Tone = "live" | "waiting" | "closed" | "new" | "paid" | "neutral";

const TONE: Record<Tone, string> = {
  live: "bg-brand-50 text-brand-800 ring-brand-200/70",
  waiting: "bg-accent-100 text-accent-700 ring-accent-300/70",
  closed: "bg-ink-100 text-ink-600 ring-ink-200",
  new: "bg-info-soft text-info ring-info/25",
  paid: "bg-success-soft text-success ring-success/25",
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Empty scene ────────────────────────────────────────────────────────
 * Every empty state in the product teaches the next step and says who acts
 * next. "No data" is a dead end and the old `EmptyState` was one: a dashed
 * box with a sentence and nothing to press. */

export function EmptyScene({
  title,
  body,
  next,
  who,
  art,
  className,
}: {
  title: string;
  body: string;
  /** The action that resolves this state, if there is one. */
  next?: { label: string; href: string };
  /** Who has to do the thing. Absent means the candidate does. */
  who?: string;
  /**
   * A small original mark drawn in CSS: an arc and a dot, the shape of a
   * thread with a bead on it. Chosen over clip art or an illustration
   * because it is unmistakably part of this product's own language and it
   * scales to a 20 pixel tab bar without turning to mush.
   */
  art?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-apple-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center",
        className,
      )}
    >
      {art ? <ThreadMark className="mb-5" /> : null}
      <h2 className="text-balance text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-ink-600">{body}</p>
      {who ? (
        // "You - send the first offer" reads as "You: send the first offer";
        // plain meta, not one more pill.
        <p className="mt-3 text-xs text-text-subtle">
          {who.includes(" - ") ? (
            <>
              <span className="font-semibold text-ink-700">{who.split(" - ")[0]}:</span> {who.split(" - ").slice(1).join(" - ")}
            </>
          ) : (
            who
          )}
        </p>
      ) : null}
      {next ? (
        <Link href={next.href} className={buttonClass({ className: "mt-6" })}>
          {next.label}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The product mark for an empty thread: one arc with a bead.
 *
 * Drawn rather than imported so it inherits tokens exactly and cannot drift
 * from the palette. `aria-hidden`, because it carries no information the text
 * beside it does not.
 */
export function ThreadMark({ className, tone = "brand" }: { className?: string; tone?: "brand" | "amber" }) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={cn("h-8 w-12", className)}
      aria-hidden
      fill="none"
      strokeLinecap="round"
    >
      <path
        d="M4 24c6-14 12-14 18 0s12 14 22 0"
        stroke={tone === "amber" ? "var(--color-accent-400)" : "var(--color-brand-300)"}
        strokeWidth="2.25"
        opacity="0.55"
      />
      <circle
        cx="24"
        cy="17"
        r="4.5"
        fill={tone === "amber" ? "var(--color-accent-400)" : "var(--color-brand-600)"}
        style={{ transformOrigin: "24px 17px", animation: "thread-breath 2.4s ease-in-out 1" }}
      />
      <circle cx="24" cy="17" r="8.5" stroke={tone === "amber" ? "var(--color-accent-400)" : "var(--color-brand-300)"} strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

/* ── Waiting note ───────────────────────────────────────────────────────
 * The counter to every product that makes you wonder. Wherever something is
 * pending, this says who has it and roughly how long it usually takes. */

export function WaitingNote({
  who,
  typical,
  children,
  className,
}: {
  who: string;
  typical: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm leading-relaxed text-ink-600", className)}>
      <span className="font-medium text-ink-800">{who}</span> has it. {typical}
      {children}
    </p>
  );
}

/* ── Key value row ──────────────────────────────────────────────────────
 * Replaces `dl` markup that was repeated inline on six screens with slightly
 * different gaps each time. */

export function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="shrink-0 text-sm text-ink-600">{label}</dt>
      <dd className={cn("min-w-0 text-right text-sm font-medium text-ink-900", mono && "tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

/* ── Filter tabs ─────────────────────────────────────────────────────────
 * Status filters with counts, in place of a row of tiles repeating the
 * numbers the list could be filtered by. Links when the filter lives in the
 * URL (server pages), toggle buttons when the list filters in the browser.
 * Not role="tablist": these narrow one list, they don't switch panels, so a
 * group of pressed/current controls is the honest semantics. */

export type FilterTab = { key: string; label: string; count?: number };

export function FilterTabs({
  label,
  tabs,
  value,
  hrefFor,
  onChange,
  className,
}: {
  /** Names the group for screen readers: "Show proposals". */
  label: string;
  tabs: FilterTab[];
  value: string;
  /** URL filters: each tab is a link. */
  hrefFor?: (key: string) => string;
  /** In-browser filters: each tab is a toggle button. */
  onChange?: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]",
        className,
      )}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        const cls = cn(
          "apple-spring inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium",
          on ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        );
        const inner = (
          <>
            {t.label}
            {t.count !== undefined ? (
              <span className={cn("nums text-xs", on ? "text-white/75" : "text-text-subtle")}>{t.count}</span>
            ) : null}
          </>
        );
        return hrefFor ? (
          <Link key={t.key} href={hrefFor(t.key)} scroll={false} aria-current={on ? "true" : undefined} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={t.key} type="button" aria-pressed={on} onClick={() => onChange?.(t.key)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
