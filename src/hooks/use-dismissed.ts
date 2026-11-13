"use client";

import { useCallback, useSyncExternalStore } from "react";

type Store = "local" | "session";

const listeners = new Set<() => void>();
// Storage blocked (private mode): a dismissal still holds for this page view.
const memory = new Set<string>();

function area(store: Store): Storage {
  return store === "local" ? window.localStorage : window.sessionStorage;
}

function read(store: Store, key: string): boolean {
  if (memory.has(key)) return true;
  try {
    return area(store).getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether a banner was dismissed in this browser, and the function that dismisses it.
 *
 * The server cannot read storage, so it renders the banner as if not dismissed
 * (`getServerSnapshot`). On a client navigation this reads storage on the very
 * first render, so a dismissed banner is never mounted, and a visible one is
 * there from the first paint. After a hard load the same server HTML is
 * hydrated; the DismissedGuard script has already hidden a dismissed banner
 * before paint, so removing it here moves nothing. Nothing is written except
 * the same "1" under the same key as before.
 */
export function useDismissed(store: Store, key: string | null): [boolean, () => void] {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => (key ? read(store, key) : false),
    () => false,
  );
  const dismiss = useCallback(() => {
    if (!key) return;
    memory.add(key);
    try {
      area(store).setItem(key, "1");
    } catch {
      /* the in-memory copy above covers this view */
    }
    listeners.forEach((l) => l());
  }, [store, key]);
  return [dismissed, dismiss];
}
