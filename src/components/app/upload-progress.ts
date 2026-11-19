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

const MB = 1024 * 1024;

/** The most any JPG/PNG upload may be (mirrors IMAGE_MAX in security/upload-rules.ts; this module stays free of server imports). */
export const IMAGE_LIMIT_BYTES = 5 * MB;
/**
 * Vercel refuses a request body over 4.5 MB before our code runs and answers with a non-JSON 413, so anything
 * past this is shrunk in the browser first. Under the 5 MB limit, over this, is the band that needs it.
 */
export const TRANSPORT_LIMIT_BYTES = 4 * MB;
/** What the transport shrink aims for: well under the platform limit, so the request headers fit too. */
export const TRANSPORT_TARGET_BYTES = 3.5 * MB;

/** One decimal, like the rest of the app's size text. */
function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Shown before anything is sent, e.g. "This image is 12.0 MB. The limit is 5 MB." */
export function imageTooLargeMessage(size: number): string {
  return `This image is ${megabytes(size)}. The limit is ${IMAGE_LIMIT_BYTES / MB} MB.`;
}

/** True when a picked image must be re-encoded smaller before it is sent. */
export function needsTransportShrink(size: number): boolean {
  return size > TRANSPORT_LIMIT_BYTES;
}

/**
 * The message for an HTTP 413 that came back without our JSON error (the platform's own refusal), naming the limit
 * so it never degrades to "Upload failed". Images are shrunk first, so for them it is the 5 MB rule.
 */
export function tooLargeStatusMessage(isImage: boolean): string {
  return isImage
    ? `That image is too large. The limit is ${IMAGE_LIMIT_BYTES / MB} MB.`
    : `That file is too large. Files up to ${TRANSPORT_LIMIT_BYTES / MB} MB can be uploaded here.`;
}
