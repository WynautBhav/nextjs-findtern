import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { legacyContentType, legacyPath, readLegacy } from "@/lib/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Files the legacy app uploaded, reached through the old `/uploads/...` URLs
 * (rewritten here in next.config). Logos and CMS images are public; identity
 * documents, marksheets, offer letters and support attachments are shown
 * only to their owner, the employer on that proposal, or an admin.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const legacy = legacyPath((await ctx.params).path.join("/"));
  if (!legacy) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canRead(legacy.path, legacy.folder);
  if (allowed !== true) return NextResponse.json({ error: allowed }, { status: allowed === "Sign in" ? 401 : 403 });

  try {
    const bytes = await readLegacy(legacy.path);
    const isPublic = legacy.folder === "company-logos";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": legacyContentType(legacy.path),
        "Content-Disposition": "inline",
        "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

async function canRead(path: string, folder: string | null): Promise<true | string> {
  if (folder === "company-logos") return true;
  const name = path.split("/").pop()!;
  const like = `%${name}%`;
  const db = getDb();

  const cms = await db.execute(sql`
    SELECT 1 FROM website_slider WHERE image_url LIKE ${like}
    UNION ALL SELECT 1 FROM website_blog_posts WHERE cover_image_url LIKE ${like} OR banner_image_url LIKE ${like} OR body LIKE ${like}
    UNION ALL SELECT 1 FROM website_happy_faces WHERE avatar_url LIKE ${like}
    UNION ALL SELECT 1 FROM website_partners WHERE logo_url LIKE ${like}
    UNION ALL SELECT 1 FROM employers WHERE logo_url LIKE ${like}
    LIMIT 1`);
  if (cms.rows.length) return true;

  const session = await getSession();
  if (!session) return "Sign in";
  if (session.role === "admin") return true;
  if (folder === "support") return "Forbidden";
  // Placement officers read student data through src/lib/college only.
  if (session.role === "college") return "Forbidden";

  const uid = session.uid;
  const owned =
    session.role === "intern"
      ? await db.execute(sql`
          SELECT 1 FROM intern_document WHERE user_id = ${uid}
            AND ${name} IN (profile_photo_name, aadhaar_image_name, pan_image_name, intro_video_name)
          UNION ALL SELECT 1 FROM intern_onboarding WHERE user_id = ${uid} AND extra_data::text LIKE ${like}
          UNION ALL SELECT 1 FROM proposals WHERE intern_id = ${uid} AND offer_details::text LIKE ${like}
          LIMIT 1`)
      : await db.execute(sql`
          SELECT 1 FROM proposals WHERE employer_id = ${uid} AND offer_details::text LIKE ${like}
          UNION ALL SELECT 1 FROM intern_document WHERE profile_photo_name = ${name}
          LIMIT 1`);
  return owned.rows.length ? true : "Forbidden";
}
