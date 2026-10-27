import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { origin } from "@/lib/emails";
import { requireCollegeMutation } from "@/lib/college/guard";
import { driveUrl } from "@/lib/college/drive-input";
import { driveForCollegeAdmin } from "@/lib/college/scope";
import { generateDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";

/**
 * POST: issue a fresh link (the old one stops working; the drive reopens if
 * it was revoked). Employers already inside keep their access.
 * DELETE: revoke. Every employer is locked out at once, including those inside.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:update");
  if (!g.ok) return g.response;
  const drive = await driveForCollegeAdmin(g.ctx, (await ctx.params).id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { token, hash } = generateDriveToken();
  await getDb()
    .update(schema.collegeDrives)
    .set({ tokenHash: hash, revokedAt: null, updatedAt: new Date() })
    .where(eq(schema.collegeDrives.id, drive.id));
  return NextResponse.json({ url: driveUrl(origin(), token) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:revoke");
  if (!g.ok) return g.response;
  const drive = await driveForCollegeAdmin(g.ctx, (await ctx.params).id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await getDb()
    .update(schema.collegeDrives)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.collegeDrives.id, drive.id));
  return NextResponse.json({ ok: true });
}
