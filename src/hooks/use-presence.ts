"use client";

import { useEffect } from "react";

import { csrfFetch } from "@/lib/client-fetch";

const INTERVAL_MS = 30_000;

/** Heartbeat every 30 s while the tab is visible. */
export function usePresence(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void csrfFetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [enabled]);
}
