import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { readAny } from "@/lib/security/store";
import { canEmployerSeeIntern } from "@/lib/employer-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Intern can read their own avatar; admins or employers can read candidate's avatar if id is passed in searchParams
  const url = new URL(req.url);
  const targetId = url.searchParams.get("id") || session.uid;

  if (targetId !== session.uid && session.role !== "admin" && session.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  // An employer gets the photo of a pool candidate or someone they already
  // proposed to / interviewed - the same reach as the detail page.
  if (
    targetId !== session.uid &&
    session.role === "employer" &&
    !session.impersonator &&
    !(await canEmployerSeeIntern(db, session.uid, targetId))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [doc] = await db
    .select({
      profilePhotoName: schema.internDocuments.profilePhotoName,
      type: schema.internDocuments.profilePhotoType,
    })
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, targetId))
    .limit(1);

  // Only photos uploaded to Findtern are served. This used to redirect to any
  // http(s) URL an intern saved as their photo, which made this an open
  // redirect on our own domain.
  if (!doc?.profilePhotoName) {
    return NextResponse.json({ error: "No avatar uploaded" }, { status: 404 });
  }

  try {
    const file = await readAny(doc.profilePhotoName);
    const bytes = file.bytes;
    const contentType = doc.type || file.contentType;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
