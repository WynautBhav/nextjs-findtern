import { NextResponse } from "next/server";

import { getCmsImage } from "@/lib/content";
import { cmsImageResponse } from "@/lib/content/image-response";

export const runtime = "nodejs";

/** Partner logo or happy-face avatar, stored inline in the CMS. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  if (kind !== "partner" && kind !== "face") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return cmsImageResponse(await getCmsImage(kind, id), req);
}
