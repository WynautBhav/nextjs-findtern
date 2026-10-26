import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { signedUrl } from "@/lib/security/sign";
import { certificateFiles } from "@/lib/onboarding";
import { legacyPath } from "@/lib/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open one of the signed-in intern's documents.
 *
 * The documents page links here instead of embedding signed URLs, because a
 * signed URL is single-use and dies in five minutes: a page left open, or a
 * second click, would 401. This mints a fresh one per click, after checking the
 * key belongs to this intern.
 */
export async function GET(req: Request): Promise<Response> {
  const noStore = { "Cache-Control": "no-store, private, max-age=0" };
  const url = new URL(req.url);
  const session = await getSession();
  if (!session || session.role !== "intern") {
    return NextResponse.redirect(new URL("/login", url), { headers: noStore });
  }

  const key = url.searchParams.get("key") ?? "";
  if (!key || !(await ownsKey(session.uid, key))) {
    return NextResponse.json({ error: "Document not found" }, { status: 404, headers: noStore });
  }

  if (legacyPath(key)) {
    return NextResponse.redirect(new URL(`/uploads/${key.replace(/^\/?uploads\//, "")}`, url), { headers: noStore });
  }
  return NextResponse.redirect(
    new URL(signedUrl(`/api/uploads/${key}`, { k: key, s: session.uid, d: "document" }, 300), url),
    { headers: noStore },
  );
}

async function ownsKey(uid: string, key: string): Promise<boolean> {
  const db = getDb();
  const docs = await db.select().from(schema.internDocuments).where(eq(schema.internDocuments.userId, uid));
  for (const d of docs) {
    if ([d.profilePhotoName, d.introVideoName, d.aadhaarImageName, d.panImageName].includes(key)) return true;
  }
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, uid))
    .limit(1);
  const academics = ((onboarding?.extra ?? {}) as Record<string, unknown>).academics as Record<string, unknown> | undefined;
  const sheets = Array.isArray(academics?.marksheetUploads) ? (academics.marksheetUploads as Record<string, unknown>[]) : [];
  if (sheets.some((m) => String(m.name ?? "") === key)) return true;
  return certificateFiles(academics).some((c) => c.name === key);
}
