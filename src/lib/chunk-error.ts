/**
 * Recovery from a stale-deploy chunk failure.
 *
 * After a deploy, a tab opened on the old build asks for JS chunks whose hashed
 * names no longer exist; the dynamic import rejects with a ChunkLoadError and
 * the error boundary shows "Something went wrong" until the user happens to do
 * a hard refresh. A plain `retry()` cannot help: the page still holds the old
 * build's manifest and asks for the same missing file. A full reload fetches
 * the new HTML and manifest.
 */

/** Messages across bundlers/browsers for "a lazily loaded chunk could not be fetched". */
const CHUNK_MESSAGE =
  /loading (?:css )?chunk [\w-]+ failed|failed to load chunk|chunkloaderror|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError") return true;
  return typeof e.message === "string" && CHUNK_MESSAGE.test(e.message);
}

export const CHUNK_RELOAD_KEY = "ft:chunk-reload-at";
/** One automatic reload per tab per window; a second failure inside it is shown, not retried, so it can never loop. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;

/** True the first time in each window (and records it). False when storage is unavailable: no guard, no automatic reload. */
export function claimChunkReload(storage: Store | null, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function tabStorage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Call from an error boundary's effect: reloads once if `error` is a chunk failure. Returns whether it did. */
export function recoverFromChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error) || !claimChunkReload(tabStorage())) return false;
  window.location.reload();
  return true;
}

/** The boundary's "Try again": a hard reload for chunk failures (retry would re-ask for the missing file), `retry` otherwise. */
export function retryOrReload(error: unknown, retry: () => void): void {
  if (isChunkLoadError(error)) window.location.reload();
  else retry();
}
