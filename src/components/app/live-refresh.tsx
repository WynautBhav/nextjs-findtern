"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The last time any LiveRefresh on this tab re-read the server. Shared, so a layout copy and a page copy never double up. */
let lastRefreshAt = 0;
/** Never closer together than this, whoever asks (a tab flicking between windows must not hammer the server). */
const MIN_GAP_MS = 8_000;

/**
 * Re-reads the page's server data while the tab is open and visible, so a change made by someone else (a student's
 * request, an employer joining, an intern accepting, a new alert) shows up without a manual reload.
 *
 * - Every `everyMs` while the tab is visible, and straight away when the tab comes back or the window gets focus.
 * - Not while the tab is hidden or the device is offline.
 * - router.refresh() keeps what is typed in forms and open dialogs; only server data is replaced.
 */
export function LiveRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    lastRefreshAt = Math.max(lastRefreshAt, Date.now()); // the page was just read
    const run = (minGapMs: number) => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefreshAt < minGapMs) return;
      lastRefreshAt = now;
      router.refresh();
    };
    const timer = window.setInterval(() => run(everyMs - 1_000), everyMs);
    const onBack = () => run(MIN_GAP_MS);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [everyMs, router]);
  return null;
}
