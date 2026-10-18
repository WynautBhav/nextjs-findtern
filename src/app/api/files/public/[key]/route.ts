import { NextResponse } from "next/server";

import { contentTypeFor, read } from "@/lib/security/store";

export const runtime = "nodejs";

/** Logos and CMS images: stored under the "public" subject, safe to cache. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!key.startsWith("public.")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const bytes = await read(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeFor(key),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
