"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/app/toast";
import type { LiveCounts } from "@/lib/live-counts";

/** Fired on `window` when a message may have arrived; an open thread fetches what is new. `threadId` is null when the poll could not say which. */
export const MESSAGE_EVENT = "findtern:message";

const POLL_MS = 15_000;
const ERRORS_BEFORE_POLLING = 3;
const REOPEN_MS = 30_000;

/**
 * Keeps the header badges, lists and toasts current without a reload.
 *
 * Opens one EventSource on /api/live. A `counts` event that differs from what
 * the page was rendered with refreshes the server components (so every badge
 * comes from the same query as the first paint) and, when a new unread alert
 * arrived, shows a toast. If the stream fails three times in a row it falls
 * back to polling /api/live?once=1 every 15 s while the tab is visible, and
 * goes back to the stream as soon as that opens. Renders nothing.
 */
export function LiveProvider({ initial }: { initial: LiveCounts }) {
  const router = useRouter();
  const toast = useToast();
  const known = useRef({
    notifications: initial.notifications,
    messages: initial.messages,
    latestId: initial.latest?.id ?? null,
    lastMessageAt: initial.lastMessageAt,
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let errors = 0;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const apply = (c: LiveCounts, polled: boolean) => {
      const k = known.current;
      const latestId = c.latest?.id ?? null;
      const countsChanged = c.notifications !== k.notifications || c.messages !== k.messages || latestId !== k.latestId;
      // A new unread alert: the count went up and the newest one is not what the page knew. Not for the thread already open.
      if (c.latest && c.notifications > k.notifications && latestId !== k.latestId && c.latest.href !== window.location.pathname) {
        toast.show({ title: c.latest.title, href: c.latest.href ?? undefined });
      }
      // The stream sends its own `message` event; the poll can only say "something changed".
      if (polled && c.lastMessageAt !== k.lastMessageAt) window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: { threadId: null } }));
      known.current = { notifications: c.notifications, messages: c.messages, latestId, lastMessageAt: c.lastMessageAt };
      if (countsChanged) router.refresh();
    };

    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = undefined;
    };
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        try {
          const res = await fetch("/api/live?once=1", { cache: "no-store" });
          if (res.ok) apply((await res.json()) as LiveCounts, true);
        } catch {
          // Offline: the next tick retries.
        }
      }, POLL_MS);
    };

    const open = () => {
      if (disposed || typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      source = new EventSource("/api/live");
      source.onopen = () => {
        errors = 0;
        stopPolling();
      };
      source.addEventListener("counts", (e) => apply(JSON.parse((e as MessageEvent<string>).data) as LiveCounts, false));
      source.addEventListener("message", (e) => {
        try {
          window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: JSON.parse((e as MessageEvent<string>).data) }));
        } catch {
          // A malformed event is ignored.
        }
      });
      // The browser reconnects by itself (retry: 3000); count consecutive failures only.
      source.onerror = () => {
        // CLOSED means the browser gave up (401/403, a proxy error page) and will not retry: poll, and try the stream again later.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          startPolling();
          if (!disposed) reopen = setTimeout(open, REOPEN_MS);
          return;
        }
        errors += 1;
        if (errors >= ERRORS_BEFORE_POLLING) startPolling();
      };
    };
    open();

    return () => {
      disposed = true;
      if (reopen) clearTimeout(reopen);
      source?.close();
      stopPolling();
    };
  }, [router, toast]);

  return null;
}
