import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [sheet] = await db
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.internId, guard.session.uid)))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sheet.status !== "draft" && sheet.status !== "rejected") {
    return NextResponse.json({ error: "Only draft or rejected timesheets can be submitted" }, { status: 400 });
  }
  await db
    .update(schema.timesheets)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(schema.timesheets.id, id));
  return NextResponse.json({ ok: true });
}
