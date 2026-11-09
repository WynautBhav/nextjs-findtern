import Link from "next/link";
import { ArrowRight, CalendarClock, Check, ChevronDown } from "lucide-react";

import { BANDS, PLAN_NAME } from "@/lib/score";
import { RowAvatar } from "@/components/employer/candidate-row-parts";
import { SaveToggle } from "@/components/employer/candidate-card";
import { skillBaseName } from "@/components/employer/candidate-view";
import { Pill } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/**
 * Presentational pieces of the employer dashboard, used nowhere else. Server
 * components only (SaveToggle and RowAvatar bring their own client code).
 *
 * The page is a ledger: hairline-ruled lists, one numeric column on the
 * right, tabular figures. Green is for the one filled button and the Hired
 * state; everything else sits on the neutral ramp.
 */

/** Link style for "All …" links: neutral, underline on hover. */
export const QUIET_LINK = "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline";

/** One header for every section: title left, optional link right, one baseline. */
export function SectionHead({ id, title, href, link }: { id: string; title: string; href?: string; link?: string }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-4">
      <h2 id={id} className="scroll-mt-24 text-lg font-medium text-ink-900">
        {title}
      </h2>
      {href && link ? (
        <Link href={href} className={cn(QUIET_LINK, "-my-2.5 shrink-0")}>
          {link}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

export type QueueItem = {
  count: number;
  label: string;
  detail: string;
  /** Longer explanation kept behind "How it works". */
  more?: string;
  href: string;
  cta: string;
};

/** The hero: what is waiting on you, with the total in the heading and one filled button on the first row. */
export function Queue({ items, total }: { items: QueueItem[]; total: number }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white">
      <h2 id="todo-h" className="scroll-mt-24 px-5 pb-1 pt-5 text-2xl font-medium text-ink-900 sm:px-6">
        <span className="nums">{total}</span> {total === 1 ? "thing needs" : "things need"} you
      </h2>
      <ul className="divide-y divide-ink-100 px-5 pb-2 sm:px-6">
        {items.map((t, i) => (
          <li key={t.href} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="nums text-right text-[28px] font-medium leading-none text-ink-900">{t.count}</span>
            <div className="min-w-0">
              <p className="text-base font-medium text-ink-900">{t.label.charAt(0).toUpperCase() + t.label.slice(1)}</p>
              <p className="mt-1 max-w-[60ch] text-sm leading-5 text-ink-600">{t.detail}</p>
              {t.more ? (
                <details className="max-w-[60ch] text-sm leading-5 text-ink-600">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-sm font-medium text-ink-700 underline underline-offset-4 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                    How it works
                  </summary>
                  <p className="pb-2">{t.more}</p>
                </details>
              ) : null}
            </div>
            <Link
              href={t.href}
              className={cn(
                "col-start-2 inline-flex min-h-11 items-center justify-center gap-1.5 justify-self-start whitespace-nowrap rounded-lg px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.97] sm:col-start-auto sm:w-44 sm:justify-self-end",
                // The first (most urgent) row carries the page's one filled button.
                i === 0 ? "bg-primary text-white hover:bg-primary-hover" : "text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
              )}
            >
              {t.cta}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PipelineStep = {
  n: number;
  label: string;
  status: string;
  tone: "awaiting" | "accepted" | "hired" | "closed";
};

const BAR_TONE: Record<PipelineStep["tone"], string> = {
  awaiting: "bg-ink-400",
  accepted: "bg-ink-700",
  hired: "bg-brand-700",
  closed: "bg-ink-200 ring-1 ring-inset ring-ink-300",
};

/** The four proposal buckets as one proportional bar and four figures; each figure opens its Proposals tab. */
export function PipelineStrip({ steps }: { steps: PipelineStep[] }) {
  const total = steps.reduce((sum, s) => sum + s.n, 0);
  return (
    <div>
      {total > 0 ? (
        <div aria-hidden className="mb-4 flex h-2 gap-0.5 overflow-hidden rounded">
          {steps
            .filter((s) => s.n > 0)
            .map((s) => (
              <span key={s.status} className={cn("min-w-1", BAR_TONE[s.tone])} style={{ flexGrow: s.n, flexBasis: 0 }} />
            ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {steps.map((s) => (
          <div key={s.status} className="relative min-w-0">
            <dt className="flex items-center gap-2 text-sm text-ink-600">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-sm", BAR_TONE[s.tone])} />
              <Link
                href={`/employer/proposals?status=${s.status}`}
                className="-my-3 inline-flex min-h-11 items-center outline-none after:absolute after:inset-0 after:content-[''] hover:text-ink-900 hover:underline hover:underline-offset-4 focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
              >
                {s.label}
              </Link>
            </dt>
            {/* A zero is quiet: lighter weight and colour than a real count. */}
            <dd className={cn("nums -mt-1 pb-3 text-[28px] leading-none", s.n === 0 ? "font-normal text-ink-500" : "font-medium text-ink-900")}>{s.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One project row: title, hires, offers still open, and the one next action. */
export function ProjectLine({
  id,
  name,
  closed,
  hired,
  open,
  action,
  hiddenOnPhone,
}: {
  id: string;
  name: string;
  closed: boolean;
  hired: number;
  open: number;
  action: { label: string; href: string } | null;
  hiddenOnPhone: boolean;
}) {
  const candidatesHref = `/employer/candidates?project=${encodeURIComponent(id)}`;
  const same = action?.href === candidatesHref;
  return (
    // The title's link stretches over the row; a different next action sits above it.
    <li className={cn("group relative py-3", hiddenOnPhone && "max-xl:hidden")}>
      <p className="flex items-start gap-2">
        <Link
          href={candidatesHref}
          className="line-clamp-2 min-w-0 break-words text-base font-medium leading-5 text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500 group-hover:underline group-hover:underline-offset-4"
        >
          {name}
        </Link>
        {closed ? <Pill tone="closed">Closed</Pill> : null}
      </p>
      <p className="nums mt-1 flex items-center justify-between gap-3 text-sm text-ink-600">
        <span>
          <span className={hired > 0 ? "font-medium text-success" : undefined}>{hired} hired</span>
          {closed ? null : (
            <>
              <span aria-hidden> · </span>
              <span className={open > 0 ? "text-ink-900" : undefined}>{open} open</span>
            </>
          )}
        </span>
        {action ? (
          same ? (
            <span className="inline-flex items-center gap-1 font-medium text-ink-700">
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          ) : (
            <Link href={action.href} className="relative z-10 -my-3 inline-flex min-h-11 items-center gap-1 font-medium text-ink-800 underline-offset-4 hover:underline">
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )
        ) : null}
      </p>
    </li>
  );
}

/** The Findtern Score as the data moment of a match row: the figure and a thin bar out of 10. */
export function ScoreMark({ score }: { score: number }) {
  return (
    <div className="w-14 shrink-0 pt-0.5" title={`Findtern Score ${score.toFixed(1)} out of 10`}>
      <p className="nums flex items-baseline justify-end gap-1 leading-none">
        <span className="text-lg font-medium text-ink-900">{score.toFixed(1)}</span>
        <span className="text-xs text-ink-600" aria-hidden>
          /10
        </span>
        <span className="sr-only"> Findtern Score out of 10</span>
      </p>
      <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-ink-700" style={{ width: `${Math.max(0, Math.min(10, score)) * 10}%` }} />
      </div>
    </div>
  );
}

export type MatchRowProps = {
  id: string;
  href: string;
  initials: string;
  photoUrl: string | null;
  presence: Parameters<typeof RowAvatar>[0]["presence"];
  where: string;
  score: number | null;
  fit: {
    hit: number;
    of: number;
    projectId: string;
    projectName: string;
  } | null;
  chips: { name: string; matched: boolean }[];
  more: number;
  saved: boolean;
};

/** One dense match row: initials, city, fit line, matched and other skills, score with its bar, star. */
export function MatchRow(m: MatchRowProps) {
  return (
    <li className="group relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3 xl:grid-cols-[2.5rem_minmax(0,26rem)_minmax(0,1fr)_auto] xl:items-center xl:gap-x-6 xl:py-4">
      <div className="col-start-1 row-start-1 self-start">
        <RowAvatar photoUrl={m.photoUrl} initials={m.initials} presence={m.presence} className="size-10 text-sm sm:size-10 sm:text-sm" />
      </div>
      <div className="min-w-0 xl:col-start-2">
        <p className="truncate text-sm text-ink-600">
          <Link
            href={m.href}
            className="text-base font-medium text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500 group-hover:underline group-hover:underline-offset-4"
          >
            {m.initials}
            {m.presence ? <span className="sr-only">, {m.presence}</span> : null}
          </Link>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {m.where || "Location not stated"}
        </p>
        {m.fit?.of ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-600 xl:line-clamp-1" title={`${m.fit.hit} of ${m.fit.of} skills for ${m.fit.projectName}`}>
            <span className="nums font-medium text-ink-900">
              {m.fit.hit} of {m.fit.of}
            </span>{" "}
            skills for {m.fit.projectName}
          </p>
        ) : null}
      </div>
      {m.chips.length ? (
        <ul className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap gap-1.5 xl:col-span-1 xl:col-start-3 xl:row-start-1" aria-label="Skills">
          {m.chips.map((k) =>
            k.matched ? (
              <li key={k.name} className="inline-flex h-6 items-center gap-1 rounded-md bg-ink-100 px-2 text-xs font-medium text-ink-800">
                <Check className="size-3 text-ink-600" strokeWidth={2.5} aria-hidden />
                {skillBaseName(k.name)}
                <span className="sr-only"> (matches)</span>
              </li>
            ) : (
              <li key={k.name} className="inline-flex h-6 items-center rounded-md px-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200">
                {skillBaseName(k.name)}
              </li>
            ),
          )}
          {m.more ? (
            <li className="inline-flex h-6 items-center px-1 text-xs text-ink-600">
              +{m.more}
              <span className="sr-only"> more skills</span>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="col-span-2 col-start-2 row-start-2 text-sm text-ink-600 xl:col-span-1 xl:col-start-3 xl:row-start-1">No skills listed</p>
      )}
      <div className="col-start-3 row-start-1 flex items-start gap-1 xl:col-start-4 xl:items-center">
        {m.score !== null ? <ScoreMark score={m.score} /> : <span className="pt-1 text-xs text-ink-600">Not scored yet</span>}
        <span className="relative z-10 -mr-2 -mt-1.5 xl:mt-0">
          {m.fit ? <SaveToggle internId={m.id} projectId={m.fit.projectId} shortlisted={m.saved} name={m.initials} /> : null}
        </span>
      </div>
    </li>
  );
}

/** Column labels for the match list; wide screens only, where the rows are columns. */
export function MatchHeader() {
  return (
    <div aria-hidden className="hidden grid-cols-[2.5rem_minmax(0,26rem)_minmax(0,1fr)_auto] gap-x-6 pb-2 text-xs text-ink-600 xl:grid">
      <span />
      <span>Candidate and fit</span>
      <span>Skills for this project</span>
      <span className="flex w-[5.75rem] justify-start">
        <span className="w-14 text-right">Score</span>
      </span>
    </div>
  );
}

/** What the score bands mean, once under the list. The row's number is the score; this says what each range is. */
export function ScoreBands() {
  return (
    <details className="group/legend border-b border-ink-100 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-ink-700 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        What the score bands mean
        <ChevronDown className="size-4 text-ink-500 transition-transform group-open/legend:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <dl className="grid gap-x-6 gap-y-2 pb-4 text-sm sm:grid-cols-3">
        {[...BANDS].reverse().map((band) => (
          <div key={band.id}>
            <dt className="font-medium text-ink-900">
              {PLAN_NAME[band.id]} <span className="nums font-normal text-ink-600">{band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`}</span>
            </dt>
            <dd className="text-ink-600">{band.blurb}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Small meeting glyph used by the next-meeting block. */
export function MeetingGlyph() {
  return <CalendarClock className="size-4" aria-hidden />;
}
