import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { MAX_MARKSHEETS } from "@/lib/onboarding";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";
import type { SessionData } from "@/lib/security/session";
import { signedUrl } from "@/lib/security/sign";
import { bytesMatchType } from "@/lib/security/sniff";
import { put, type StoredFile } from "@/lib/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MB = 1024 * 1024;
const IMAGES = ["image/jpeg", "image/png", "image/webp"];
const DOCS = [...IMAGES, "application/pdf"];
const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

/**
 * What a file is for decides who may upload it, which types and sizes are
 * allowed, whether it's public, and which record it attaches to.
 */
const KINDS: Record<string, { roles: SessionData["role"][]; types: string[]; max: number; isPublic?: boolean }> = {
  profile_photo: { roles: ["intern"], types: IMAGES, max: 5 * MB },
  aadhaar: { roles: ["intern"], types: DOCS, max: 10 * MB },
  pan: { roles: ["intern"], types: DOCS, max: 10 * MB },
  intro_video: { roles: ["intern"], types: VIDEO, max: 50 * MB },
  marksheet: { roles: ["intern"], types: DOCS, max: 25 * MB },
  // Professional course / certification files. Stored only: the onboarding
  // save puts the key on its row (extra.academics …certificateUploads).
  certificate: { roles: ["intern"], types: DOCS, max: 10 * MB },
  employer_logo: { roles: ["employer"], types: IMAGES, max: 2 * MB, isPublic: true },
  // PDF, PNG or JPG, as legacy accepted (employer-orders full-time dialog).
  offer_letter: { roles: ["employer"], types: ["application/pdf", "image/png", "image/jpeg"], max: 10 * MB },
  cms_image: { roles: ["admin"], types: IMAGES, max: 5 * MB, isPublic: true },
  support: { roles: ["intern", "employer"], types: [...DOCS, ...VIDEO], max: 10 * MB },
};

/**
 * Photos and scanned documents are re-encoded to WebP before anything is
 * stored: auto-rotated from EXIF, EXIF/GPS stripped, capped in size. Only the
 * WebP is ever written - the original upload never touches disk or the
 * bucket. PDFs, videos, offer letters, logos and CMS images are kept as sent.
 * Documents keep more pixels than the face photo so ID numbers stay legible.
 */
const WEBP: Record<string, { maxPx: number; quality: number }> = {
  profile_photo: { maxPx: 1200, quality: 80 },
  aadhaar: { maxPx: 2000, quality: 85 },
  pan: { maxPx: 2000, quality: 85 },
  marksheet: { maxPx: 2000, quality: 85 },
  certificate: { maxPx: 2000, quality: 85 },
};

async function toWebp(bytes: Buffer, opts: { maxPx: number; quality: number }): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes, { failOn: "error", limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: opts.maxPx, height: opts.maxPx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality })
    .toBuffer();
}

const DOC_COLUMNS = {
  profile_photo: ["profilePhotoName", "profilePhotoType", "profilePhotoSize"],
  aadhaar: ["aadhaarImageName", "aadhaarImageType", "aadhaarImageSize"],
  pan: ["panImageName", "panImageType", "panImageSize"],
  intro_video: ["introVideoName", "introVideoType", "introVideoSize"],
} as const;

export async function POST(req: Request): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" };
  // CSRF, session and View-as read-only are all enforced here; which roles may
  // upload which kind is checked per kind below.
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const rl = bucketKey(clientIp(req.headers), session.uid);
  if (!limiters.upload.take(rl)) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(limiters.upload.retryAfterSeconds(rl)), ...noStore } },
    );
  }

  const kindName = req.headers.get("x-document-kind") ?? "";
  const kind = KINDS[kindName];
  if (!kind || !kind.roles.includes(session.role)) {
    return NextResponse.json({ error: "You can't upload that here" }, { status: 400 });
  }
  const type = req.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!kind.types.includes(type)) {
    return NextResponse.json({ error: "That file type isn't accepted here" }, { status: 415 });
  }
  const limitMb = Math.round(kind.max / MB);
  if (Number(req.headers.get("content-length") ?? "0") > kind.max) {
    return NextResponse.json({ error: `The file must be under ${limitMb} MB` }, { status: 413 });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read upload" }, { status: 400 });
  }
  if (bytes.length === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (bytes.length > kind.max) return NextResponse.json({ error: `The file must be under ${limitMb} MB` }, { status: 413 });
  if (!bytesMatchType(type, bytes)) {
    return NextResponse.json({ error: "That file is not what its name says. Upload the original PDF, JPG or PNG." }, { status: 415 });
  }
  // The onboarding save refuses more than this, so a ninth file would block every later save.
  if (kindName === "marksheet" && (await marksheetCount(session.uid)) >= MAX_MARKSHEETS) {
    return NextResponse.json({ error: `You can keep at most ${MAX_MARKSHEETS} marksheets. Remove one and save your draft, then upload again.` }, { status: 409 });
  }

  let contentType = type;
  let fileName = decodeFileName(req.headers.get("x-file-name") ?? "").slice(0, 120);
  const webp = WEBP[kindName];
  if (webp && IMAGES.includes(type)) {
    try {
      bytes = await toWebp(bytes, webp);
    } catch {
      return NextResponse.json({ error: "That image could not be read. Try a JPG or PNG." }, { status: 415 });
    }
    contentType = "image/webp";
    fileName = fileName ? `${fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.webp` : fileName;
  }

  const stored = await put(kind.isPublic ? "public" : session.uid, bytes, contentType, kind.max);
  await attach(kindName, session, stored, fileName);

  return NextResponse.json(
    {
      key: stored.key,
      bytes: stored.bytes,
      contentType: stored.contentType,
      url: kind.isPublic
        ? `/api/files/public/${stored.key}`
        : signedUrl(`/api/uploads/${stored.key}`, { k: stored.key, s: session.uid, d: kindName }, 300),
    },
    { status: 201, headers: noStore },
  );
}

async function marksheetCount(uid: string): Promise<number> {
  const [row] = await getDb()
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, uid))
    .limit(1);
  const list = ((row?.extra as { academics?: { marksheetUploads?: unknown } } | undefined)?.academics?.marksheetUploads);
  return Array.isArray(list) ? list.length : 0;
}

/** The client percent-encodes the name so non-ASCII survives the header. */
function decodeFileName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Link the stored file to its record. */
async function attach(kind: string, session: SessionData, f: StoredFile, fileName: string) {
  const db = getDb();
  if (kind in DOC_COLUMNS) {
    const [name, type, size] = DOC_COLUMNS[kind as keyof typeof DOC_COLUMNS];
    const values = { [name]: f.key, [type]: f.contentType, [size]: f.bytes, updatedAt: new Date() };
    const [doc] = await db
      .select({ id: schema.internDocuments.id })
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session.uid))
      .limit(1);
    if (doc) await db.update(schema.internDocuments).set(values).where(eq(schema.internDocuments.id, doc.id));
    else await db.insert(schema.internDocuments).values({ userId: session.uid, ...values });
    return;
  }
  if (kind === "marksheet") {
    // Same list the legacy form keeps: extra.academics.marksheetUploads.
    const [row] = await db
      .select({ id: schema.internOnboarding.id, extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, session.uid))
      .limit(1);
    const extra = (row?.extra ?? {}) as Record<string, unknown>;
    const academics = (extra.academics ?? {}) as Record<string, unknown>;
    const list = Array.isArray(academics.marksheetUploads) ? academics.marksheetUploads : [];
    const extraData = {
      ...extra,
      // `originalName` is the legacy key (INT-23); `label` is what the documents page reads.
      academics: { ...academics, marksheetUploads: [...list, { name: f.key, originalName: fileName, label: fileName, type: f.contentType, size: f.bytes }] },
    };
    if (row) await db.update(schema.internOnboarding).set({ extraData }).where(eq(schema.internOnboarding.id, row.id));
    else await db.insert(schema.internOnboarding).values({ userId: session.uid, extraData });
    return;
  }
  if (kind === "employer_logo") {
    await db.update(schema.employers).set({ logoUrl: `/api/files/public/${f.key}` }).where(eq(schema.employers.id, session.uid));
  }
}
