import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { tryPublicOrigin } from "@/lib/origin";
import { requireCollegeMutation } from "@/lib/college/guard";
import { driveShareUrl } from "@/lib/college/drive-input";
import { driveForCollegeAdmin } from "@/lib/college/scope";
import { generateDriveToken } from "@/lib/college/tokens";
import { reissueDriveLink } from "@/lib/college/link";
import { sendAndRecordInvites } from "@/lib/college/drive-invite-send";
import { invitesToSend } from "@/lib/college/drive-invite";
import { closeDriveCalls } from "@/lib/college/meetings";
import { driveDataOpen } from "@/lib/college/serialize";
import { getDb, schema } from "@/lib/db";

/**
 * POST: issue a fresh link for a running drive (the old one stops working). A closed or ended drive is final and is
 * refused: it is never reopened (owner, 24 Nov). Employers already inside are let out too and come back
 * through the new link, so a leaked link can really be rotated (QA-200).
 * Emailed invites are signed over the old token hash, so they die with it: every
 * invited company is mailed a fresh one (the daily cap still applies; any held
 * back stay unsent and go out on the next save).
 * DELETE: close the drive for good. Every employer is locked out at once, including those inside.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:update");
  if (!g.ok) return g.response;
  const drive = await driveForCollegeAdmin(g.ctx, (await ctx.params).id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!driveDataOpen(drive)) return NextResponse.json({ error: "This drive has ended and can't be reopened." }, { status: 409 });
  const { token, hash } = generateDriveToken();
  await reissueDriveLink(getDb(), drive.id, hash);
  const { id, title, kind, startsAt, endsAt } = drive;
  const list = drive.invitedEmployers ?? [];
  const invites = await sendAndRecordInvites({ id, title, kind, startsAt, endsAt, tokenHash: hash }, g.ctx.college.id, g.ctx.college.name, list, invitesToSend([], list), { resend: true });
  return NextResponse.json({ url: driveShareUrl(tryPublicOrigin(), token), invites });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:revoke");
  if (!g.ok) return g.response;
  const drive = await driveForCollegeAdmin(g.ctx, (await ctx.params).id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // One transaction: the drive goes off and its open calls close with it, so no student accepts one afterwards.
  await getDb().transaction(async (tx) => {
    await tx
      .update(schema.collegeDrives)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.collegeDrives.id, drive.id));
    await closeDriveCalls(tx, drive.id);
  });
  return NextResponse.json({ ok: true });
}
