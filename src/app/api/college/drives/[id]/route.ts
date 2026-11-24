import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireCollegeMutation } from "@/lib/college/guard";
import { driveInput, drivePastDateProblem } from "@/lib/college/drive-input";
import { invitesToSend, prepareInvited, withUnsent } from "@/lib/college/drive-invite";
import { sendAndRecordInvites } from "@/lib/college/drive-invite-send";
import { driveForCollegeAdmin } from "@/lib/college/scope";
import { driveDataOpen } from "@/lib/college/serialize";
import { getDb, schema } from "@/lib/db";

/** Edit dates, eligibility and the include/exclude lists. The link is unchanged. Companies newly added to the invited list, or never reached by an earlier mail, are emailed. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:update");
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const drive = await driveForCollegeAdmin(g.ctx, id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // C12: once a drive has ended or been revoked it is closed. Editing dates would reopen its student data.
  if (!driveDataOpen(drive)) {
    return NextResponse.json({ error: "This drive is over, so it can no longer be edited." }, { status: 409 });
  }
  const parsed = driveInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the drive details" }, { status: 400 });
  }
  const past = drivePastDateProblem(parsed.data, { savedStartsAt: drive.startsAt });
  if (past) return NextResponse.json({ error: past.error, field: past.path }, { status: 400 });
  // Companies never reached by a mail (new, or held back by the daily cap or a failed send before) are flagged unsent until it goes out.
  const submitted = parsed.data.invitedEmployers ? prepareInvited(parsed.data.invitedEmployers, drive.invitedEmployers) : undefined;
  const toSend = invitesToSend(drive.invitedEmployers, submitted);
  await getDb()
    .update(schema.collegeDrives)
    .set({ ...parsed.data, ...(submitted ? { invitedEmployers: withUnsent(submitted, toSend.map((i) => i.email)) } : {}), updatedAt: new Date() })
    .where(eq(schema.collegeDrives.id, drive.id));
  const { title, startsAt, endsAt } = parsed.data;
  const kind = parsed.data.kind ?? drive.kind;
  const invites = await sendAndRecordInvites({ id: drive.id, title, kind, startsAt, endsAt, tokenHash: drive.tokenHash }, g.ctx.college.id, g.ctx.college.name, submitted ?? [], toSend);
  return NextResponse.json({ ok: true, invites });
}
