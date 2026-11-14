/**
 * Pure helpers for the upload progress bar (file-upload.tsx).
 *
 * The percent is the share of the request body the browser has handed to the network
 * (XMLHttpRequest `upload.onprogress`). It is not a prediction: once every byte is sent the server
 * still re-encodes and stores the file, which the component says in words rather than in a number.
 */

/** A wait shorter than this needs no indicator; the bar appears only if the upload is still running. */
export const PROGRESS_DELAY_MS = 1000;

/**
 * Whole percent sent, rounded down so 100 means every byte is out, never "nearly".
 * `null` when the browser cannot say (no total), so the caller shows no number instead of a made-up one.
 */
export function uploadPercent(loaded: number, total: number): number | null {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)));
}

/** The next value to show: never goes backwards, and keeps the old value when the event carries no total. */
export function nextPercent(previous: number, loaded: number, total: number): number {
  const p = uploadPercent(loaded, total);
  return p === null ? previous : Math.max(previous, p);
}
