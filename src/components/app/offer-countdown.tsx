"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

import { offerTimeLeft } from "@/lib/offer";

/** Re-reads the clock every 30 s, which is as fine as "45 min left" needs. */
function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 30_000);
  return () => window.clearInterval(id);
}

/**
 * "3 days left" until the offer closes (bug sheet 25 Oct). The server has no
 * way to know the viewer's clock, so it renders nothing and the browser fills
 * it in straight after hydration; a minute-old server render can never disagree
 * with the page it hydrates into.
 */
export function OfferCountdown({ startDate }: { startDate: string | null }) {
  const left = useSyncExternalStore(
    subscribe,
    () => offerTimeLeft(startDate),
    () => null,
  );
  if (!left) return null;
  return (
    <p className="nums flex items-center gap-1.5 text-sm font-semibold text-ink-900" data-testid="offer-countdown">
      <Clock className="size-4 text-brand-700" aria-hidden />
      {left} to answer
    </p>
  );
}
