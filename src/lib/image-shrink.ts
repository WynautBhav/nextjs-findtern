/**
 * Shrink a phone photo or scan in the browser before it is uploaded, so the
 * client size cap stops refusing a 4 MB camera JPEG. Canvas only, no
 * dependency. The server stays the authority: it sniffs the bytes, enforces
 * its own limits and re-encodes to WebP; this only makes the upload small.
 *
 * Split in two so the part that decides things is testable without a browser:
 * `shrinkPlan` / `shrinkWith` are pure, `shrinkImage` supplies the canvas.
 */

/** Longest side after shrinking. The server caps documents at 2000px too. */
export const SHRINK_MAX_PX = 2000;
/** Size to aim for. A scan this size stays legible; a phone photo drops by ~90%. */
export const SHRINK_TARGET_BYTES = 500 * 1024;
/** Never go below this on the long side: ID numbers must stay readable. */
const MIN_PX = 1000;
const QUALITIES = [0.85, 0.75, 0.65, 0.55];
const SCALES = [1, 0.8, 0.65, 0.5];

export type Attempt = { width: number; height: number; quality: number };

/** Dimensions that fit inside `maxPx` on the long side, aspect kept, never enlarged. */
export function fitWithin(width: number, height: number, maxPx: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxPx) return { width, height };
  const k = maxPx / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * The encodes to try, best quality first: every quality at full size, then
 * the same ladder at smaller sizes. Sizes stop at MIN_PX on the long side.
 */
export function shrinkPlan(width: number, height: number, maxPx = SHRINK_MAX_PX): Attempt[] {
  const base = fitWithin(width, height, maxPx);
  const plan: Attempt[] = [];
  for (const scale of SCALES) {
    const w = Math.max(1, Math.round(base.width * scale));
    const h = Math.max(1, Math.round(base.height * scale));
    if (scale < 1 && Math.max(w, h) < MIN_PX) break;
    for (const quality of QUALITIES) plan.push({ width: w, height: h, quality });
  }
  return plan;
}

export type Encoded = { size: number };

/**
 * Walk the plan until an encode is at or under `target`. When none is, the
 * smallest one is returned (`underTarget: false`) and the caller decides.
 */
export async function shrinkWith<T extends Encoded>(
  width: number,
  height: number,
  encode: (a: Attempt) => Promise<T>,
  target = SHRINK_TARGET_BYTES,
): Promise<{ result: T; attempt: Attempt; underTarget: boolean }> {
  const plan = shrinkPlan(width, height);
  let best: { result: T; attempt: Attempt } | null = null;
  for (const attempt of plan) {
    const result = await encode(attempt);
    if (!best || result.size < best.result.size) best = { result, attempt };
    if (result.size <= target) return { result, attempt, underTarget: true };
  }
  return { ...(best as { result: T; attempt: Attempt }), underTarget: false };
}

/** Thrown when the browser cannot decode the file as an image. */
export class UnreadableImageError extends Error {
  constructor() {
    super("That image could not be read. Try a different JPG or PNG.");
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

/**
 * Decode with the camera's EXIF orientation applied, so a sideways phone photo
 * is drawn upright. Re-encoding drops the EXIF, so the rotation is baked in.
 */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img>, which also honours EXIF orientation in current browsers
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new UnreadableImageError();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new UnreadableImageError())), "image/jpeg", quality);
  });
}

export type Shrunk = { file: File; shrunk: boolean; underTarget: boolean };

/**
 * Returns a JPEG under `target` bytes (≤2000px, EXIF applied and stripped),
 * or the original when it is already small enough. PNG scans become JPEG on a
 * white background. Throws UnreadableImageError for a corrupt or non-image file.
 */
export async function shrinkImage(file: File, target = SHRINK_TARGET_BYTES): Promise<Shrunk> {
  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) throw new UnreadableImageError();
    // Small enough in bytes and pixels: send as picked, nothing is lost.
    if (file.size <= target && Math.max(decoded.width, decoded.height) <= SHRINK_MAX_PX) {
      return { file, shrunk: false, underTarget: true };
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new UnreadableImageError();
    const { result, underTarget } = await shrinkWith(
      decoded.width,
      decoded.height,
      async ({ width, height, quality }) => {
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(decoded.source, 0, 0, width, height);
        const blob = await toBlob(canvas, quality);
        return { size: blob.size, blob };
      },
      target,
    );
    const base = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "image";
    return { file: new File([result.blob], `${base}.jpg`, { type: "image/jpeg" }), shrunk: true, underTarget };
  } finally {
    decoded.close();
  }
}
