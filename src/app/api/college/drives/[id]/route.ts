import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireCollegeMutation } from "@/lib/college/guard";
import { driveInput } from "@/lib/college/drive-input";
import { driveForCollegeAdmin } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";

/** Edit dates, eligibility and the include/exclude lists. The link is unchanged. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:update");
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const drive = await driveForCollegeAdmin(g.ctx, id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = driveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the drive details" }, { status: 400 });
  }
  await getDb()
    .update(schema.collegeDrives)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.collegeDrives.id, drive.id));
  return NextResponse.json({ ok: true });
}
