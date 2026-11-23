import { NextResponse } from "next/server";

import { tryPublicOrigin } from "@/lib/origin";
import { requireCollegeMutation } from "@/lib/college/guard";
import { driveInput, driveShareUrl } from "@/lib/college/drive-input";
import { generateDriveToken } from "@/lib/college/tokens";
import { newInvitees } from "@/lib/college/drive-invite";
import { sendDriveInvites } from "@/lib/college/drive-invite-send";
import { getDb, schema } from "@/lib/db";

/** Create a drive. The link's token is returned once and never stored. */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "drive:create");
  if (!g.ok) return g.response;
  const parsed = driveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the drive details" }, { status: 400 });
  }
  const { token, hash } = generateDriveToken();
  const [drive] = await getDb()
    .insert(schema.collegeDrives)
    .values({ ...parsed.data, collegeId: g.ctx.college.id, tokenHash: hash, createdBy: g.ctx.admin.id })
    .returning({ id: schema.collegeDrives.id });
  // After the commit: each invited company is emailed (and alerted in its app if it has an account).
  const { title, kind, startsAt, endsAt } = parsed.data;
  const invites = await sendDriveInvites({ id: drive.id, title, kind, startsAt, endsAt, tokenHash: hash }, g.ctx.college.name, newInvitees([], parsed.data.invitedEmployers));
  return NextResponse.json({ id: drive.id, url: driveShareUrl(tryPublicOrigin(), token), invites }, { status: 201 });
}
