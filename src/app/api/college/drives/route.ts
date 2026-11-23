import { NextResponse } from "next/server";

import { tryPublicOrigin } from "@/lib/origin";
import { requireCollegeMutation } from "@/lib/college/guard";
import { driveInput, drivePastDateProblem, driveShareUrl } from "@/lib/college/drive-input";
import { generateDriveToken } from "@/lib/college/tokens";
import { invitesToSend, withUnsent } from "@/lib/college/drive-invite";
import { sendAndRecordInvites } from "@/lib/college/drive-invite-send";
import { getDb, schema } from "@/lib/db";

/** Create a drive. The link's token is returned once and never stored. */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "drive:create");
  if (!g.ok) return g.response;
  const parsed = driveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the drive details" }, { status: 400 });
  }
  const past = drivePastDateProblem(parsed.data);
  if (past) return NextResponse.json({ error: past.error, field: past.path }, { status: 400 });
  const { token, hash } = generateDriveToken();
  // Every invited company is unsent until its mail goes out (recorded below), so a held-back one is retried on a later save.
  const list = parsed.data.invitedEmployers ?? [];
  const toSend = invitesToSend([], list);
  const [drive] = await getDb()
    .insert(schema.collegeDrives)
    .values({ ...parsed.data, invitedEmployers: withUnsent(list, toSend.map((i) => i.email)), collegeId: g.ctx.college.id, tokenHash: hash, createdBy: g.ctx.admin.id })
    .returning({ id: schema.collegeDrives.id });
  // After the commit: each invited company is emailed (and alerted in its app if it has an account).
  const { title, startsAt, endsAt } = parsed.data;
  const kind = parsed.data.kind ?? "internship";
  const invites = await sendAndRecordInvites({ id: drive.id, title, kind, startsAt, endsAt, tokenHash: hash }, g.ctx.college.id, g.ctx.college.name, list, toSend);
  return NextResponse.json({ id: drive.id, url: driveShareUrl(tryPublicOrigin(), token), invites }, { status: 201 });
}
