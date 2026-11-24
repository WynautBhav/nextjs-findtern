import { bytesMatchType } from "./sniff.ts";
import type { SessionData } from "./session.ts";

/**
 * What each upload kind accepts, and how it is checked and re-encoded before
 * anything is stored. Kept free of route/DB imports so the rules can be tested
 * on their own (upload-rules.test.ts); /api/uploads is the only caller.
 */

export const MB = 1024 * 1024;
/**
 * Largest JPG/PNG/WebP any upload kind takes (B-21). The browser checks it before sending and then shrinks the
 * file under TRANSPORT_BYTES, because Vercel refuses a request body over 4.5 MB before our code runs.
 */
export const IMAGE_MAX = 5 * MB;
export const IMAGES = ["image/jpeg", "image/png", "image/webp"];
export const DOCS = [...IMAGES, "application/pdf"];
/** Intern marksheets and certificates: JPG or PNG only, so they can be resized to KB. No PDF, no WebP. */
export const INTERN_SCANS = ["image/jpeg", "image/png"];
export const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export type UploadKind = {
  roles: SessionData["role"][];
  types: string[];
  /** Limit for the kind's non-image files (PDF, video). Images are capped by IMAGE_MAX as well; see maxFor. */
  max: number;
  isPublic?: boolean;
  /** Replaces `types` for the intern role only (a kind shared with employers). */
  internTypes?: string[];
};

/**
 * What a file is for decides who may upload it, which types and sizes are
 * allowed, whether it's public, and which record it attaches to.
 */
export const KINDS: Record<string, UploadKind> = {
  profile_photo: { roles: ["intern"], types: IMAGES, max: IMAGE_MAX },
  // Identity cards: images only (never PDF). Always re-encoded to WebP below.
  aadhaar: { roles: ["intern"], types: IMAGES, max: IMAGE_MAX },
  pan: { roles: ["intern"], types: IMAGES, max: IMAGE_MAX },
  // Intern scans: JPG/PNG only (PDF removed). Files already stored as PDF still open: the read routes don't use these rules.
  marksheet: { roles: ["intern"], types: INTERN_SCANS, max: IMAGE_MAX },
  // Professional course / certification files. Stored only: the onboarding
  // save puts the key on its row (extra.academics …certificateUploads).
  certificate: { roles: ["intern"], types: INTERN_SCANS, max: IMAGE_MAX },
  employer_logo: { roles: ["employer"], types: IMAGES, max: IMAGE_MAX, isPublic: true },
  // A placement officer's college logo (shown on the drive page employers open). The route writes it to the officer's own college only.
  college_logo: { roles: ["college"], types: IMAGES, max: IMAGE_MAX, isPublic: true },
  // PDF, PNG or JPG, as legacy accepted (employer-orders full-time dialog).
  offer_letter: { roles: ["employer"], types: ["application/pdf", "image/png", "image/jpeg"], max: 10 * MB },
  cms_image: { roles: ["admin"], types: IMAGES, max: IMAGE_MAX, isPublic: true },
  // Shared: employers may still attach a PDF; interns may not.
  support: { roles: ["intern", "employer"], types: [...DOCS, ...VIDEO], internTypes: [...IMAGES, ...VIDEO], max: 10 * MB },
};

/** The declared kind for a header value; names like "constructor" or "__proto__" are not kinds. */
export function kindFor(name: string): UploadKind | undefined {
  return Object.hasOwn(KINDS, name) ? KINDS[name] : undefined;
}

/** The size limit for one upload: images are held to IMAGE_MAX whatever the kind's own max, PDFs and videos to the kind's. */
export function maxFor(kind: UploadKind, type: string): number {
  return IMAGES.includes(type) ? Math.min(kind.max, IMAGE_MAX) : kind.max;
}

/**
 * Every JPG/PNG/WebP is re-encoded to WebP before anything is stored: auto-rotated
 * from EXIF, EXIF/GPS stripped, capped in size. The original upload never
 * touches disk or the bucket (the one exception is KEEP_ORIGINAL_ON_FAILURE).
 * The rule is by kind, so it holds for the S3 bucket and the VPS disk alike,
 * because both are written through store.ts. PDFs and videos are kept as sent.
 * Documents keep more pixels than the face photo so ID numbers stay legible.
 */
export const WEBP: Record<string, { maxPx: number; quality: number }> = {
  profile_photo: { maxPx: 1200, quality: 80 },
  aadhaar: { maxPx: 2000, quality: 85 },
  pan: { maxPx: 2000, quality: 85 },
  marksheet: { maxPx: 2000, quality: 85 },
  certificate: { maxPx: 2000, quality: 85 },
  employer_logo: { maxPx: 1200, quality: 85 },
  college_logo: { maxPx: 1200, quality: 85 },
  cms_image: { maxPx: 2400, quality: 82 },
  // Shared kinds: only their image files are converted; a PDF or video skips this (see prepareUpload).
  offer_letter: { maxPx: 2000, quality: 85 },
  support: { maxPx: 2000, quality: 80 },
};

/**
 * Public kinds whose image is stored as sent when the conversion fails, because a logo that sharp cannot parse
 * is still a valid picture for a browser. Everything else (ID documents above all) fails the upload instead:
 * an unconverted file would keep its EXIF/GPS and its full size.
 */
export const KEEP_ORIGINAL_ON_FAILURE = new Set(["employer_logo"]);

/** True when the kind accepts nothing but JPG/PNG/WebP images. */
export function isImagesOnly(kind: Pick<UploadKind, "types">): boolean {
  return kind.types.every((t) => IMAGES.includes(t));
}

export async function toWebp(bytes: Buffer, opts: { maxPx: number; quality: number }): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes, { failOn: "error", limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: opts.maxPx, height: opts.maxPx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality })
    .toBuffer();
}

export type Rejection = { ok: false; status: 415; error: string };

/** The types a role may send for a kind (interns get `internTypes` when the kind has one). */
export function typesFor(kind: UploadKind, role?: SessionData["role"]): string[] {
  return role === "intern" && kind.internTypes ? kind.internTypes : kind.types;
}

/** Header check: is this content type allowed for the kind (and role)? */
export function checkType(kind: UploadKind, type: string, role?: SessionData["role"]): Rejection | null {
  const types = typesFor(kind, role);
  if (types.includes(type)) return null;
  const NAMES: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };
  const names = Object.keys(NAMES).filter((t) => types.includes(t)).map((t) => NAMES[t]);
  const imageList = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
  return {
    ok: false,
    status: 415,
    error: imageList && !types.includes("application/pdf") ? `Upload a ${imageList} image. PDFs aren't accepted for this file.` : "That file type isn't accepted here",
  };
}

/**
 * Body check and re-encode. Verifies the bytes are what the header claims,
 * then converts to WebP when the kind requires it. A conversion failure is a
 * rejection, except for the kinds in KEEP_ORIGINAL_ON_FAILURE (logos).
 */
export async function prepareUpload(
  kindName: string,
  kind: UploadKind,
  type: string,
  bytes: Buffer,
  fileName: string,
): Promise<Rejection | { ok: true; bytes: Buffer; contentType: string; fileName: string }> {
  const imagesOnly = isImagesOnly(kind);
  if (!bytesMatchType(type, bytes)) {
    return {
      ok: false,
      status: 415,
      error: imagesOnly
        ? "That file is not what its name says. Upload the original JPG, PNG or WebP image."
        : "That file is not what its name says. Upload the original PDF, JPG or PNG.",
    };
  }
  let out = bytes;
  let contentType = type;
  let name = fileName;
  const webp = WEBP[kindName];
  if (webp && IMAGES.includes(type)) {
    try {
      out = await toWebp(bytes, webp);
      contentType = "image/webp";
      name = fileName ? `${fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.webp` : fileName;
    } catch {
      if (!KEEP_ORIGINAL_ON_FAILURE.has(kindName)) {
        return { ok: false, status: 415, error: "That image could not be read. Try a JPG, PNG or WebP." };
      }
    }
  }
  // Belt and braces: an images-only kind with a WebP rule must never leave here unconverted (but for the logo fallback).
  if (webp && imagesOnly && contentType !== "image/webp" && !KEEP_ORIGINAL_ON_FAILURE.has(kindName)) {
    return { ok: false, status: 415, error: "That image could not be read. Try a JPG, PNG or WebP." };
  }
  return { ok: true, bytes: out, contentType, fileName: name };
}

/**
 * Reads a request body, giving up as soon as it passes `max` bytes. `req.arrayBuffer()` buffers the whole body, and a
 * chunked upload sends no Content-Length to refuse early, so without this one request could hold unbounded memory.
 * Returns null when the body is larger than `max`.
 */
export async function readBodyCapped(req: { body: ReadableStream<Uint8Array<ArrayBufferLike>> | null }, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}
