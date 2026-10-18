import { NextResponse } from "next/server";

import { readAny } from "@/lib/security/store";

export const runtime = "nodejs";

/** Support attachments, for admins only (proxy enforces contact:*:read). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
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
