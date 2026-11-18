/**
 * The server allows 6 heartbeats a minute per person (heartbeat-limit.ts). Every full page load, tab and tab-switch
 * beats, so the time of the last beat is shared across tabs (localStorage) and a beat closer than MIN_GAP_MS to it is
 * skipped. Pure and storage-injected so it can be tested without a browser.
 */
export const MIN_GAP_MS = 20_000;
export const BEAT_KEY = "ft_hb_at";

type Store = Pick<Storage, "getItem" | "setItem">;

/** True when this tab may send a beat now (and records it). Unreadable storage never blocks: the interval alone stays under the limit. */
export function claimBeat(now: number, storage: Store | null): boolean {
  if (!storage) return true;
  try {
    const last = Number(storage.getItem(BEAT_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < MIN_GAP_MS) return false;
    storage.setItem(BEAT_KEY, String(now));
  } catch {
    /* storage blocked */
  }
  return true;
}
