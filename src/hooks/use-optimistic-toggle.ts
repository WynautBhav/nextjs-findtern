"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";

/**
 * An on/off control that flips the moment it is pressed and rolls back if the
 * save does not go through (React 19 `useOptimistic` inside a transition).
 *
 *   - `value` is what to draw: the pressed state while a save is in flight,
 *     the last confirmed state otherwise.
 *   - `commit(next)` does the request and answers `true` only when the server
 *     accepted it. `false` leaves the confirmed state alone, so
 *     React drops the optimistic value and the control returns to the truth.
 *     The caller shows its own error from `commit`.
 *   - A second press while one is in flight is ignored (`pending` is for
 *     aria-busy/aria-disabled; the control stays focusable).
 *
 * Only for a setting where showing the new state for a moment, if the save then
 * fails, cannot mislead anyone: not money, offers, applications or visibility.
 */
export function useOptimisticToggle(initial: boolean) {
  const [confirmed, setConfirmed] = useState(initial);
  const [value, setOptimistic] = useOptimistic(confirmed);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function toggle(commit: (next: boolean) => Promise<boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = !confirmed;
    startTransition(async () => {
      setOptimistic(next);
      try {
        // Confirm before the transition ends so the control never blinks back to the old value.
        if (await commit(next)) setConfirmed(next);
      } catch {
        // A throw from an async transition would reach the error boundary; the caller reports its own failures.
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { value, pending, toggle };
}
