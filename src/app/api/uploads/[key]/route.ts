import { NextResponse } from "next/server";
import { readSession, readCookie } from "@/lib/security/session";
import { canAccess } from "@/lib/security/guards";
import { verify, replayGuard, TokenError } from "@/lib/security/sign";
import { read, contentTypeFor } from "@/lib/security/store";

/**
 * Redeem a signed upload URL.
 *
 * The only way to read a stored document. Three independent checks have to
 * pass, and it is worth being explicit about why each is needed rather than
 * relying on the signature alone:
 *
 *   1. the signature is valid  → the URL was issued by us and is unexpired
 *   2. the subject matches     → the token was minted for *this* session
 *   3. the nonce is unseen     → a copied URL dies after one use
 *
 * The signature proves authenticity. On its own it would still let intern 7
 * read intern 2's Aadhaar if intern 2's URL leaked, because the signature would
 * be perfectly valid. Check 2 is the ownership check, and it is the one that
 * closes the legacy IDOR.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");

  const noStore = { "Cache-Control": "no-store, private, max-age=0" };

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401, headers: noStore });
  }

  // 1. Signature and expiry.
  let payload;
  try {
    payload = verify(token);
  } catch (e) {
    const expired = e instanceof TokenError && e.reason === "expired";
    return NextResponse.json(
      { error: expired ? "Link expired - request a new one" : "Invalid link" },
      // An expired link is a 410: the client can tell it apart from a forged
      // one and re-request. A forged link is a flat 401.
      { status: expired ? 410 : 401, headers: noStore },
    );
  }

  // The path must match the token. Without this a valid token for file A would
  // read file B, because the route's dynamic segment is attacker-controlled.
  if (payload.k !== key) {
    return NextResponse.json({ error: "Invalid link" }, { status: 401, headers: noStore });
  }

  // 2. Ownership. Admins pass; everyone else must be the subject.
  const session = readSession(readCookie(req.headers.get("cookie")));
  if (!session) {
    return NextResponse.json({ error: "Sign in to view this document" }, { status: 401, headers: noStore });
  }
  if (!canAccess(session, payload.s)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  }

  // 3. Single use.
  if (!replayGuard.check(payload.n)) {
    return NextResponse.json(
      { error: "Link already used - request a new one" },
      { status: 410, headers: noStore },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await read(payload.k);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(payload.k),
      // Force a download rather than an inline render. An identity document
      // should never be interpreted by the browser or executed as a document.
      "Content-Disposition": `attachment; filename="document${payload.k.slice(payload.k.lastIndexOf("."))}"`,
      "Content-Length": String(bytes.length),
      // no-store matters most here: a cached copy of an Aadhaar image would
      // outlive the token that authorised it.
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
