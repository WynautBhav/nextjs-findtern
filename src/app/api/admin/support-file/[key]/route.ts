import { NextResponse } from "next/server";

import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";
import { readAny } from "@/lib/security/store";

export const runtime = "nodejs";

/** Support attachments, for admins only. The proxy decides which permission; this refuses anyone who is not an admin even if the proxy rule changes. */
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { key } = await ctx.params;
  try {
    const file = await readAny(key);
    return new Response(new Uint8Array(file.bytes), {
      headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
