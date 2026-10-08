import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
 * Title, one line of orientation, and one action slot. No eyebrow: with an
 * eyebrow on every page header the screen reads as a slide in a deck rather
 * than a place you are working. */

export function PageHead({
  title,
  lede,
  action,
  className,
}: {
  title: string;
  lede?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 md:text-3xl">
          {title}
        </h1>
        {lede ? <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-ink-600">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
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
        {hint ? <p className="mt-0.5 text-sm text-ink-500">{hint}</p> : null}
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
  as?: "div" | "section" | "article" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "min-w-0 rounded-2xl border border-ink-100 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04)]",
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
        "flex flex-col items-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center",
        className,
      )}
    >
      {art ? <ThreadMark className="mb-5" /> : null}
      <h3 className="text-balance text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</h3>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-ink-600">{body}</p>
      {who ? (
        <p className="mt-3 rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600">
          {who}
        </p>
      ) : null}
      {next ? (
        <Link
          href={next.href}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-[var(--dur-instant)] hover:bg-primary-hover hover:shadow-md active:scale-[0.98]"
        >
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
      <dt className="shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className={cn("min-w-0 text-right text-sm font-medium text-ink-900", mono && "tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}
