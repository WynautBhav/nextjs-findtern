import Link from "next/link";
import { ArrowRight, CheckCircle2, FolderPlus, Hourglass, Search } from "lucide-react";

import { Arrive } from "@/components/admin/motion/arrive";
import { Reveal } from "@/components/admin/motion/reveal";
import { CountUp } from "@/components/app/count-up";
import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NextMeeting, type NextMeetingProps } from "./next-meeting";

/** One row of the hero queue. Same fields the old `Queue` used. */
export type HeroQueueItem = {
  count: number;
  label: string;
  detail: string;
  /** Longer explanation kept behind "How it works". */
  more?: string;
  href: string;
  cta: string;
};

export type HeroProps = {
  companyName: string;
  /** "Monday 9 November" in the employer's timezone, computed on the server. */
  dateLabel: string;
  /** Sum of `queue` counts: the lead figure. 0 means nothing needs the employer. */
  total: number;
  /** Things waiting on the employer, most urgent first, already filtered to count > 0. Show the first 3. */
  queue: HeroQueueItem[];
  /** The foot line: things waiting on candidates (meeting times to pick). Null when none. */
  waitingOnCandidates: { count: number; label: string; href: string } | null;
  /** True when the employer has sent at least one proposal: picks "Nothing needs you right now" over "Make your first hire". */
  hasProposals: boolean;
  /** The right-column card. */
  nextMeeting: NextMeetingProps;
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
const MAX_ROWS = 3;

/** One tone per queue row, shared by its slice of the bar and the tick under its count: amber ties the first to the amber button. */
const TONES = ["bg-signal", "bg-ink-500", "bg-ink-300"] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The employer home's hero: what is waiting on you. The lead figure counts
 * up, a bar splits it by kind, up to three rows each open their screen, and
 * the first row carries the page's one amber button. The next meeting sits
 * beside it. Server component; only `Count`, `JoinMeetingButton` and the
 * avatar are client code.
 */
export function Hero({ companyName, dateLabel, total, queue, waitingOnCandidates, hasProposals, nextMeeting }: HeroProps) {
  const rows = queue.slice(0, MAX_ROWS);
  const busy = total > 0 && rows.length > 0;
  return (
    <HeroPanel>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-y-4">
        <Arrive index={0} className="lg:col-start-1 lg:row-start-1 lg:self-center">
          <p className="text-sm font-medium text-ink-700">
            <span className="font-medium text-ink-900">{companyName}</span>
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {dateLabel}
          </p>
        </Arrive>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {busy ? (
            <>
              <Arrive index={1} className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <h1 className="flex items-baseline gap-x-4">
                  <span className="nums font-display text-[clamp(2.75rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.03em] text-ink-900">
                    <span aria-hidden>
                      <CountUp value={total} />
                    </span>
                    <span className="sr-only">{total}</span>
                  </span>
                  <span className="text-xl font-medium leading-8 text-ink-900">{total === 1 ? "thing needs you" : "things need you"}</span>
                </h1>
              </Arrive>

              <ul className="mt-3">
                {rows.map((r, i) => (
                  <Arrive
                    as="li"
                    key={r.href}
                    index={i + 2}
                    className={cn(
                      "grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center",
                      i > 0 && "border-t border-ink-200",
                    )}
                  >
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="nums font-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink-900">{r.count}</span>
                      <span aria-hidden className={cn("h-0.5 w-5", TONES[i])} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-medium leading-6 text-ink-900">{cap(r.label)}</p>
                      <p className="mt-0.5 max-w-[60ch] text-[13px] leading-[18px] text-ink-700">{r.detail}</p>
                      {r.more ? (
                        <details className="max-w-[60ch] text-[13px] leading-[18px] text-ink-700">
                          <summary
                            className={cn(
                              // The 44px target is the pseudo-element, so the row itself stays compact.
                              "relative mt-1 inline-flex cursor-pointer list-none items-center rounded-sm font-medium text-ink-900 underline underline-offset-4 after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-[''] [&::-webkit-details-marker]:hidden",
                              FOCUS,
                            )}
                          >
                            How it works
                          </summary>
                          <p className="pb-1 pt-1.5">{r.more}</p>
                        </details>
                      ) : null}
                    </div>
                    <ButtonLink
                      href={r.href}
                      variant={i === 0 ? "primary" : "outline"}
                      size="sm"
                      className={cn("col-start-2 max-sm:w-full sm:col-start-auto sm:w-44 sm:justify-self-end", FOCUS)}
                    >
                      {r.cta}
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  </Arrive>
                ))}
              </ul>
            </>
          ) : (
            <Arrive index={1} className="flex items-start gap-4">
              <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-white/10 text-brand-700 ring-1 ring-inset ring-white/15">
                {hasProposals ? <CheckCircle2 className="size-7" /> : <Search className="size-7" />}
              </span>
              <div className="min-w-0">
                <h1 className="text-balance font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink-900 sm:text-[40px]">
                  {hasProposals ? "Nothing needs you right now" : "Make your first hire"}
                </h1>
                <p className="mt-2 max-w-[52ch] text-sm leading-5 text-ink-700">
                  {hasProposals
                    ? "Nothing is waiting on you."
                    : "Shortlist candidates ranked by their Findtern Score, meet them, and send a proposal."}
                </p>
                <ButtonLink href="/employer/candidates" variant="primary" size="sm" className={cn("mt-5 max-sm:w-full sm:w-44", FOCUS)}>
                  Find candidates
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </Arrive>
          )}

          {waitingOnCandidates ? (
            <Arrive index={5} className="mt-2 border-t border-ink-200 pt-4 text-sm text-ink-700">
              <Link
                href={waitingOnCandidates.href}
                className={cn("-my-2 inline-flex min-h-11 items-center gap-2 rounded-sm underline-offset-4 hover:underline", FOCUS)}
              >
                <Hourglass className="size-4 shrink-0 text-ink-600" aria-hidden />
                <span>
                  <span className="nums font-medium text-ink-900">{waitingOnCandidates.count}</span> {waitingOnCandidates.label}
                </span>
                <ArrowRight className="size-3.5 shrink-0" aria-hidden />
              </Link>
            </Arrive>
          ) : null}
        </div>

        <Arrive index={2} className="lg:col-start-2 lg:row-start-2">
          <NextMeeting {...nextMeeting} />
        </Arrive>

        {/* Top right from lg, last on a phone. With nothing waiting, the amber "Find candidates" is already on screen. */}
        <Arrive index={1} className="grid gap-2 sm:grid-cols-2 lg:col-start-2 lg:row-start-1 lg:flex lg:justify-end">
          <ButtonLink href="/employer/projects/new" variant="outline" size="sm" className={FOCUS}>
            <FolderPlus className="size-4" aria-hidden />
            New project
          </ButtonLink>
          {busy ? (
            <ButtonLink href="/employer/candidates" variant="outline" size="sm" className={FOCUS}>
              <Search className="size-4" aria-hidden />
              Find candidates
            </ButtonLink>
          ) : null}
        </Arrive>
      </div>
    </HeroPanel>
  );
}
