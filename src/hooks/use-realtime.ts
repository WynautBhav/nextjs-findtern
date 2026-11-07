"use client";

import { useEffect, useRef } from "react";

import { backoffMs } from "@/lib/realtime/events";

export type RealtimeMessage = { type: string; data: unknown; id: string };

const TYPES = ["message.new", "message.read", "proposal.updated", "notification.new", "presence.changed"];

/** Subscribes to /api/realtime/stream. EventSource resends Last-Event-ID itself on its own retries; if the browser gives up (CLOSED) we reopen with backoff. */
export function useRealtime(handler: (e: RealtimeMessage) => void, enabled = true): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      es = new EventSource("/api/realtime/stream");
      es.onopen = () => {
        attempt = 0;
      };
      for (const type of TYPES) {
        es.addEventListener(type, (ev) => {
          const m = ev as MessageEvent;
          let data: unknown = null;
          try {
            data = JSON.parse(m.data);
          } catch {}
          ref.current({ type, data, id: m.lastEventId });
        });
      }
      es.onerror = () => {
        // CLOSED means the browser gave up (e.g. 401): retry with backoff. Otherwise it reconnects itself with Last-Event-ID.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          timer = setTimeout(open, backoffMs(attempt++));
        }
      };
    };
    open();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [enabled]);
}
