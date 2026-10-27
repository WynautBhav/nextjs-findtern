import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { CMS_TYPES, type CmsType } from "@/lib/admin/cms-collections";
import { CMS_TABLES, cmsImageColumn } from "@/lib/admin/cms-tables";
import { getDb } from "@/lib/db";

/**
 * Serves one stored CMS image to the admin editor. Legacy rows keep images
 * inline as `data:` URIs; the list sends a short token instead and the
 * thumbnails load from here. Read-only (proxy.ts also gates /api/admin on
 * cms:read). Only allow-listed image columns can be read.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") as CmsType | null;
  const id = url.searchParams.get("id");
  const field = url.searchParams.get("field") ?? "";
  if (!type || !CMS_TYPES.includes(type) || !id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const column = cmsImageColumn(type, field);
  if (!column) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const table = CMS_TABLES[type];
  const [row] = await getDb()
    .select({ value: column })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  const value = typeof row?.value === "string" ? row.value : "";
  if (!value) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const m = /^data:(image\/(?:png|jpe?g|webp|gif|svg\+xml|avif));base64,([\s\S]*)$/i.exec(value);
  // Plain URLs are loaded by the browser directly (cmsImageSrc); this route
  // only decodes inline images, so it can never act as a redirector.
  if (!m) return NextResponse.json({ error: "Not an inline image" }, { status: 404 });
  const bytes = Buffer.from(m[2], "base64");
  const contentType = m[1].toLowerCase();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // SVGs can carry script; never let one run in our origin.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
