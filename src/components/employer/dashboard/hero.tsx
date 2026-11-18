import Link from "next/link";
import { ArrowRight, FolderPlus, Search } from "lucide-react";

import { Arrive } from "@/components/admin/motion/arrive";
import { CountUp } from "@/components/app/count-up";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One row of the queue. */
export type HeroQueueItem = {
  count: number;
  label: string;
  detail: string;
  /** Longer explanation kept behind "How it works". */
  more?: string;
  href: string;
  cta: string;
};

/** One row of "waiting on candidates": the same shape, never counted in the headline. */
export type WaitingItem = { count: number; label: string; detail: string; href: string; cta: string };

export type HeroProps = {
  companyName: string;
  /** "Monday 9 November" in the employer's timezone, computed on the server. */
  dateLabel: string;
  /** Sum of `queue` counts: the lead figure. 0 means nothing needs the employer. */
  total: number;
  /** Things waiting on the employer, most urgent first, already filtered to count > 0. Show the first 3. */
  queue: HeroQueueItem[];
  /** Things waiting on candidates (meeting times to pick). Empty when none. */
  waiting: WaitingItem[];
  /** True when the employer has sent at least one proposal: picks "Nothing needs you right now" over "Make your first hire". */
  hasProposals: boolean;
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
const MAX_ROWS = 3;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The masthead strip: company and date on the left, the two creation shortcuts on the right. */
export function Masthead({ companyName, dateLabel, showFind }: { companyName: string; dateLabel: string; showFind: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ink-200 pb-4">
      <p className="text-sm text-ink-700">
        <span className="font-medium text-ink-900">{companyName}</span>
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        {dateLabel}
      </p>
      <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
        <ButtonLink href="/employer/projects/new" variant="outline" size="sm" className={FOCUS}>
          <FolderPlus className="size-4" aria-hidden />
          New project
        </ButtonLink>
        {showFind ? (
          <ButtonLink href="/employer/candidates" variant="outline" size="sm" className={FOCUS}>
            <Search className="size-4" aria-hidden />
            Find candidates
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What is waiting on you, as the page's statement: one oversized figure, then a ruled ledger of
 * the things behind it, each with the one button that opens it (the first is the page's one
 * primary). What is waiting on the candidates is the second, quieter ledger underneath: same
 * rows, grey numerals, an action of its own, never counted in the headline.
 */
export function Queue({ total, queue, waiting, hasProposals }: Omit<HeroProps, "companyName" | "dateLabel">) {
  const rows = queue.slice(0, MAX_ROWS);
  const busy = total > 0 && rows.length > 0;
  return (
    <section aria-labelledby="queue-h">
      {busy ? (
        <>
          <Arrive index={0}>
            <h1 id="queue-h" className="flex items-baseline gap-x-4">
              <span className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900">
                <span aria-hidden>
                  <CountUp value={total} />
                </span>
                <span className="sr-only">{total}</span>
              </span>
              <span className="text-xl font-medium text-ink-900">{total === 1 ? "thing needs you" : "things need you"}</span>
            </h1>
          </Arrive>
          <ul className="mt-4 border-t border-ink-200">
            {rows.map((r, i) => (
              <Arrive as="li" key={r.href} index={i + 1} className={cn("grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-ink-200 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center")}>
                <span className="nums font-display text-2xl font-semibold leading-none tracking-[-0.02em] text-signal">{r.count}</span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink-900">{cap(r.label)}</p>
                  <p className="mt-0.5 max-w-[60ch] text-sm text-ink-700">{r.detail}</p>
                  {r.more ? (
                    <details className="max-w-[60ch] text-sm text-ink-700">
                      <summary
                        className={cn(
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
                <ButtonLink href={r.href} variant={i === 0 ? "primary" : "outline"} size="sm" className={cn("col-start-2 max-sm:w-full sm:col-start-auto sm:w-44 sm:justify-self-end", FOCUS)}>
                  {r.cta}
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </Arrive>
            ))}
          </ul>
        </>
      ) : (
        <Arrive index={0}>
          <h1 id="queue-h" className="text-balance font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink-900">
            {hasProposals ? "Nothing needs you right now" : "Make your first hire"}
          </h1>
          <p className="mt-3 max-w-[52ch] text-base text-ink-700">
            {hasProposals ? "No payments, timesheets or shortlists are waiting on you." : "Shortlist candidates ranked by their Findtern Score, meet them, and send a proposal."}
          </p>
          {hasProposals ? null : (
            <ButtonLink href="/employer/candidates" variant="primary" size="sm" className={cn("mt-5 max-sm:w-full sm:w-44", FOCUS)}>
              Find candidates
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          )}
        </Arrive>
      )}

      {waiting.length ? (
        <Arrive index={5} className="mt-8">
          <h2 className="text-base font-semibold text-ink-900">
            Waiting on candidates
            <span className="ml-2 text-sm font-normal text-ink-600">not on your list</span>
          </h2>
          <ul className="mt-2 border-t border-ink-200">
            {waiting.map((w) => (
              <li key={w.href} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-ink-200 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
                <span className="nums font-display text-2xl font-semibold leading-none tracking-[-0.02em] text-ink-600">{w.count}</span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink-900">{cap(w.label)}</p>
                  <p className="mt-0.5 max-w-[60ch] text-sm text-ink-700">{w.detail}</p>
                </div>
                <Link
                  href={w.href}
                  className={cn("col-start-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-ink-300 px-4 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100 max-sm:w-full sm:col-start-auto sm:w-44 sm:justify-self-end", FOCUS)}
                >
                  {w.cta}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Arrive>
      ) : null}
    </section>
  );
}
