import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { ensureGateToken } from "@/lib/meetings/service";

/** Every "Join meeting" button points here: the signed-in party of the interview is sent on to its /meet/<token> gate (a token is minted for older meetings). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || (session.role !== "employer" && session.role !== "intern")) return NextResponse.redirect(new URL(session ? "/" : "/login", req.url));
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!iv || (session.role === "employer" ? iv.employerId : iv.internId) !== session.uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = await ensureGateToken(db, iv);
  return NextResponse.redirect(new URL(`/meet/${encodeURIComponent(token)}`, req.url));
}
