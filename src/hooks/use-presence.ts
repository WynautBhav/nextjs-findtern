"use client";

import { useEffect } from "react";

import { csrfFetch } from "@/lib/client-fetch";
import { claimBeat } from "@/lib/presence-gap";

const INTERVAL_MS = 30_000;

/** Heartbeat every 30 s while the tab is visible; never faster than MIN_GAP_MS across all tabs. */
export function usePresence(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      let storage: Storage | null = null;
      try {
        storage = window.localStorage;
      } catch {
        /* storage blocked */
      }
      if (!claimBeat(Date.now(), storage)) return;
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
