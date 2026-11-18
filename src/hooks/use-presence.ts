"use client";

import { useEffect } from "react";

import { csrfFetch } from "@/lib/client-fetch";

const INTERVAL_MS = 30_000;
/** The server allows 6 beats a minute per person. Every full page load, tab and tab-switch beats, so the
 *  last beat's time is shared across tabs (localStorage) and a beat closer than this to it is skipped. */
const MIN_GAP_MS = 20_000;
const KEY = "ft_hb_at";

/** Heartbeat every 30 s while the tab is visible; never faster than MIN_GAP_MS across all tabs, and silent on a refusal. */
export function usePresence(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      const now = Date.now();
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0);
        if (now - last < MIN_GAP_MS) return;
        localStorage.setItem(KEY, String(now));
      } catch {
        /* storage blocked: the interval alone keeps it under the limit */
      }
      void csrfFetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [enabled]);
}
