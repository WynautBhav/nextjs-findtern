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
 * PageHeader are thin wrappers). `text-2xl`, not the marketing display
 * scale: a console page is a tool, and a 40px title pushed the work below
 * the fold on phones (SPECS §3.2). Keep the lede for state, not for
 * explaining the page. */

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
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-1 text-sm font-medium text-text-subtle">{eyebrow}</p>
        ) : null}
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-pretty text-sm text-text-subtle">{lede}</p> : null}
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
  /** Figures under the copy. */
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

/** One headline number in a page's figure strip (a `<dl>`): label, figure, quiet hint. */
export function Figure({ label, value, empty, hint }: { label: string; value: React.ReactNode | null; empty: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-text-subtle">{label}</dt>
      <dd className="mt-1">
        {value !== null ? (
          <span className="nums block text-3xl font-semibold tracking-tight text-ink-900">{value}</span>
        ) : (
          <span className="block text-base font-medium text-ink-700">{empty}</span>
        )}
        {hint ? <span className="mt-1 block text-xs text-text-subtle">{hint}</span> : null}
      </dd>
    </div>
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
    <div className={cn("mb-4 flex items-baseline justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-text-subtle">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ── Surface ───────────────────────────────────────────────────────────
 * One border, one radius, no shadow (shadows are for things that float), except
 * inside the light intern console, where it takes the dashboard tile look. The old screens used
 * `rounded-xl border border-ink-100 bg-white` in nine places and
 * `rounded-xl ... shadow-xs` in one, which is how a radius difference of four
 * pixels shipped unnoticed. */

/** On the light console's grey canvas a card is a dashboard tile: no border, one soft shadow. */
export const LIGHT_TILE =
  "in-data-[tone=light]:border-transparent in-data-[tone=light]:shadow-tile";

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
        "min-w-0 rounded-apple-xl border border-ink-200/80 bg-white",
        LIGHT_TILE,
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
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
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
  as: Title = "p",
  className,
}: {
  title: string;
  body: string;
  /** Heading level. A paragraph by default, since most empty states sit inside a tile that already has its own h2. */
  as?: "h2" | "h3" | "p";
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
      {art ? <ThreadMark className="mb-4" /> : null}
      <Title className="text-balance text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</Title>
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
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-sm text-text-subtle">{label}</dt>
      <dd className={cn("min-w-0 text-sm font-medium text-ink-900 [overflow-wrap:anywhere] sm:text-right", mono && "tabular-nums")}>
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

/** The one tab look (filters, view switches, record tabs): a filled pill when on. */
export function pillTabClass(on: boolean): string {
  return cn(
    "apple-spring inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 max-lg:min-h-11",
    on ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  );
}

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
        // Wraps rather than scrolling sideways: a hidden scroller cut the last
        // tab mid-word ("Paymer") with nothing to say there was more (QA-131).
        "flex max-w-full flex-wrap gap-1",
        className,
      )}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        const cls = pillTabClass(on);
        const inner = (
          <>
            {t.label}
            {t.count !== undefined ? (
              <span className={cn("nums text-xs", on ? "text-white/75" : "text-text-subtle")}>{t.count}</span>
            ) : null}
          </>
        );
        return hrefFor ? (
          <Link key={t.key} href={hrefFor(t.key)} scroll={false} aria-current={on ? "page" : undefined} className={cls}>
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
