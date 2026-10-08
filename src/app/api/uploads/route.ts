import { NextResponse } from "next/server";
import { requireSession } from "@/lib/security/guards";
import { put, MAX_BYTES } from "@/lib/security/store";
import { signedUrl } from "@/lib/security/sign";
import { checkCsrf } from "@/lib/security/session";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

/**
 * Store an identity document and hand back a short-lived URL.
 *
 * Replaces the legacy flow, which wrote to the web-served uploads directory
 * and returned a permanent public URL (routes.ts:12502, server/index.ts:103).
 *
 * Request → store → return a URL that dies in five minutes, and that only
 * works for the person who uploaded it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function POST(req: Request): Promise<Response> {
  // 1. Who is this?
  const authed = requireSession(req.headers.get("cookie"));
  if (!authed.ok) {
    return NextResponse.json(
      { error: authed.error },
      { status: authed.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { session } = authed;

  // 2. Same-origin? A cross-site POST cannot forge this without reading it.
  if (!checkCsrf(req.headers.get("x-csrf-token"), req.headers.get("cookie"))) {
    return NextResponse.json({ error: "Bad CSRF token" }, { status: 403 });
  }

  // 3. Throttle. Keyed on IP+subject so one attacker cannot exhaust a known
  //    user's whole budget, and so a single IP cannot spray.
  const key = bucketKey(clientIp(req.headers), session.uid);
  if (!limiters.upload.take(key)) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limiters.upload.retryAfterSeconds(key)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // 4. Validate before reading the body into memory.
  const type = req.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!ALLOWED.has(type)) {
    return NextResponse.json(
      { error: `Unsupported type ${type}. Use JPEG, PNG, WebP or PDF.` },
      { status: 415 },
    );
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${Math.floor(MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  const declaredKind = req.headers.get("x-document-kind") ?? "document";
  if (!/^[a-z_]{2,24}$/.test(declaredKind)) {
    return NextResponse.json({ error: "Bad document kind" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read upload" }, { status: 400 });
  }
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    // Checked again after read, because content-length can lie or be absent.
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  // 5. Private write, 0600, outside public/.
  const stored = await put(session.uid, bytes, type);

  // 6. Five-minute URL bound to this subject.
  return NextResponse.json(
    {
      key: stored.key,
      bytes: stored.bytes,
      contentType: stored.contentType,
      url: signedUrl(
        `/api/uploads/${stored.key}`,
        { k: stored.key, s: session.uid, d: declaredKind },
        300,
      ),
      expiresIn: 300,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
