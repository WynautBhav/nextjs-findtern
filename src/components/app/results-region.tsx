"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Wrapper around a list that updates in place (pairs with `useInstantQuery`).
 *
 *   <ResultsRegion pending={q.pending} error={q.error} onRetry={q.refetch} count={q.data.total} updateKey={q.qs}
 *                  noun="candidates" nounSingular="candidate">
 *     ...results...
 *   </ResultsRegion>
 *
 *   - `data-results` marks the region (tests and measurement hook onto it); `aria-busy` follows `pending`.
 *   - While `pending`, old content stays and dims (opacity) only after 150 ms, so a fast update never flickers.
 *     Under prefers-reduced-motion the dim has no fade but keeps the same delay.
 *   - A visually hidden polite live region says "Loading <noun>" once the delay passes and
 *     "Updated, N <noun>" after each settle (including cache hits). Silent on first paint. Focus never moves.
 *   - An error shows a banner with Retry above the last good content.
 */

export const DIM_DELAY_MS = 150;

interface Props {
  children: ReactNode;
  pending: boolean;
  error?: { message: string; offline?: boolean } | null;
  onRetry?: () => void;
  /** Number of results now shown, for the announcement. */
  count: number;
  /** Changes whenever the shown results change (e.g. the query string) so a same-count update is still announced. */
  updateKey?: string | number;
  noun?: string;
  nounSingular?: string;
  className?: string;
}

/** True once `on` has been true for `delayMs`; false immediately when `on` goes false. */
export function useDelayedFlag(on: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      const reset = setTimeout(() => setShown(false), 0);
      return () => clearTimeout(reset);
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [on, delayMs]);
  return on && shown;
}

export function ResultsRegion({
  children,
  pending,
  error,
  onRetry,
  count,
  updateKey,
  noun = "results",
  nounSingular = "result",
  className,
}: Props) {
  const dimmed = useDelayedFlag(pending, DIM_DELAY_MS);

  // Announce after a settle. Derived during render (no effect), so the first paint stays silent.
  const key = updateKey ?? count;
  const [last, setLast] = useState({ pending, key });
  const [done, setDone] = useState("");
  if (last.pending !== pending || last.key !== key) {
    setLast({ pending, key });
    setDone(pending ? "" : `Updated, ${count} ${count === 1 ? nounSingular : noun}`);
  }
  const live = dimmed ? `Loading ${noun}` : done;

  return (
    <div data-results="" data-pending={pending ? "" : undefined} aria-busy={pending} className={className}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          <span>{error.message}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={dimmed ? "opacity-60 transition-opacity duration-150 motion-reduce:transition-none" : "transition-opacity duration-150 motion-reduce:transition-none"}>
        {children}
      </div>
    </div>
  );
}
