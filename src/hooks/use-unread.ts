"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { csrfFetch } from "@/lib/client-fetch";
import { applyThreadEvent, markThreadRead, totalUnread, type ThreadRow } from "@/lib/messaging/ui-logic";
import { useRealtime, type RealtimeMessage } from "@/hooks/use-realtime";

type State = { threads: ThreadRow[]; loaded: boolean; error: boolean };

// One shared store per tab: the layout feeds it from the single event stream, pages read it.
let state: State = { threads: [], loaded: false, error: false };
let openThreadId: string | null = null;
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: RealtimeMessage) => void>();
let inflight: Promise<void> | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function refreshThreads(): Promise<void> {
  if (inflight) return inflight;
  inflight = csrfFetch("/api/threads", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { threads: ThreadRow[] };
      set({ threads: j.threads, loaded: true, error: false });
    })
    .catch(() => set({ loaded: true, error: true }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function setOpenThread(id: string | null) {
  openThreadId = id;
  if (id) set({ threads: markThreadRead(state.threads, id) });
}

export function subscribeMessageEvents(fn: (e: RealtimeMessage) => void): () => void {
  eventListeners.add(fn);
  return () => {
    eventListeners.delete(fn);
  };
}

function handle(e: RealtimeMessage) {
  if (e.type === "message.new" || e.type === "message.read" || e.type === "presence.changed") {
    eventListeners.forEach((l) => l(e));
  }
  if (e.type === "message.new") {
    const r = applyThreadEvent(state.threads, e, openThreadId);
    if (r.threads !== state.threads) set({ threads: r.threads });
    if (r.refetch) void refreshThreads();
  } else if (e.type === "presence.changed") {
    void refreshThreads();
  }
}

/** Mounted once per layout: owns the event stream and the initial load. */
export function useUnreadFeed(): void {
  useRealtime(handle);
  useEffect(() => {
    void refreshThreads();
    const again = () => {
      if (document.visibilityState === "visible") void refreshThreads();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
  }, []);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const SERVER: State = { threads: [], loaded: false, error: false };

export function useThreads() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  const reload = useCallback(() => refreshThreads(), []);
  return { ...s, reload };
}

export function useUnread(): number {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  return totalUnread(s.threads);
}
