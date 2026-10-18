import { NextResponse } from "next/server";

import { getBlogImage } from "@/lib/content";
import { cmsImageResponse } from "@/lib/content/image-response";

export const runtime = "nodejs";

/** Blog cover or banner (banner falls back to cover), stored inline in the CMS. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await ctx.params;
  if (kind !== "cover" && kind !== "banner") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return cmsImageResponse(await getBlogImage(slug, kind), req);
}
