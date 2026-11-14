import { bytesMatchType } from "./sniff.ts";
import type { SessionData } from "./session.ts";

/**
 * What each upload kind accepts, and how it is checked and re-encoded before
 * anything is stored. Kept free of route/DB imports so the rules can be tested
 * on their own (upload-rules.test.ts); /api/uploads is the only caller.
 */

export const MB = 1024 * 1024;
export const IMAGES = ["image/jpeg", "image/png", "image/webp"];
export const DOCS = [...IMAGES, "application/pdf"];
/** Intern marksheets and certificates: JPG or PNG only, so they can be resized to KB. No PDF, no WebP. */
export const INTERN_SCANS = ["image/jpeg", "image/png"];
export const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export type UploadKind = {
  roles: SessionData["role"][];
  types: string[];
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
  profile_photo: { roles: ["intern"], types: IMAGES, max: 5 * MB },
  // Identity cards: images only (never PDF). Always re-encoded to WebP below.
  aadhaar: { roles: ["intern"], types: IMAGES, max: 10 * MB },
  pan: { roles: ["intern"], types: IMAGES, max: 10 * MB },
  // Intern scans: JPG/PNG only (PDF removed). Files already stored as PDF still open: the read routes don't use these rules.
  marksheet: { roles: ["intern"], types: INTERN_SCANS, max: 25 * MB },
  // Professional course / certification files. Stored only: the onboarding
  // save puts the key on its row (extra.academics …certificateUploads).
  certificate: { roles: ["intern"], types: INTERN_SCANS, max: 10 * MB },
  employer_logo: { roles: ["employer"], types: IMAGES, max: 2 * MB, isPublic: true },
  // PDF, PNG or JPG, as legacy accepted (employer-orders full-time dialog).
  offer_letter: { roles: ["employer"], types: ["application/pdf", "image/png", "image/jpeg"], max: 10 * MB },
  cms_image: { roles: ["admin"], types: IMAGES, max: 5 * MB, isPublic: true },
  // Shared: employers may still attach a PDF; interns may not.
  support: { roles: ["intern", "employer"], types: [...DOCS, ...VIDEO], internTypes: [...IMAGES, ...VIDEO], max: 10 * MB },
};

/**
 * Photos and scanned documents are re-encoded to WebP before anything is
 * stored: auto-rotated from EXIF, EXIF/GPS stripped, capped in size. Only the
 * WebP is ever written - the original upload never touches disk or the
 * bucket. PDFs, videos, offer letters, logos and CMS images are kept as sent.
 * Documents keep more pixels than the face photo so ID numbers stay legible.
 */
export const WEBP: Record<string, { maxPx: number; quality: number }> = {
  profile_photo: { maxPx: 1200, quality: 80 },
  aadhaar: { maxPx: 2000, quality: 85 },
  pan: { maxPx: 2000, quality: 85 },
  marksheet: { maxPx: 2000, quality: 85 },
  certificate: { maxPx: 2000, quality: 85 },
};

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
 * rejection: the unconverted original is never returned for an images-only kind.
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
    } catch {
      return { ok: false, status: 415, error: "That image could not be read. Try a JPG, PNG or WebP." };
    }
    contentType = "image/webp";
    name = fileName ? `${fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.webp` : fileName;
  }
  // Belt and braces: an images-only kind with a WebP rule must never leave here unconverted.
  if (webp && imagesOnly && contentType !== "image/webp") {
    return { ok: false, status: 415, error: "That image could not be read. Try a JPG, PNG or WebP." };
  }
  return { ok: true, bytes: out, contentType, fileName: name };
}
