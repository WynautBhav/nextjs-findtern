import { useSyncExternalStore } from "react";

/**
 * "One owl per screen": every marketing/app-state owl reports here while it is in view, and the chat
 * launcher avatar (MascotAvatar) reads it and shows its static poster meanwhile. A tiny module store
 * instead of context, so no provider and no edit to the chat widget are needed.
 */
const visible = new Set<string>();
const listeners = new Set<() => void>();

export function setPageOwlVisible(id: string, isVisible: boolean): void {
  const had = visible.size > 0;
  if (isVisible) visible.add(id);
  else visible.delete(id);
  if (had !== visible.size > 0) listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** True while at least one page owl is in view. */
export const usePageOwlVisible = (): boolean =>
  useSyncExternalStore(subscribe, () => visible.size > 0, () => false);
