import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { withLock } from "@/lib/advisory-lock";
import { requireCollegeMutation } from "@/lib/college/guard";
import { invitedEmployer } from "@/lib/college/drive-input";
import { inviteeAddProblem, type Invitee } from "@/lib/college/drive-invite";
import { sendDriveInvites } from "@/lib/college/drive-invite-send";
import { driveForCollegeAdmin } from "@/lib/college/scope";
import { driveDataOpen } from "@/lib/college/serialize";
import { schema } from "@/lib/db";

/**
 * POST: invite one more company to a running drive. Only that company is emailed its own invite; the drive link and
 * every employer already inside are untouched (issuing a new link is the way to let everyone out). The add is held under
 * a per-drive lock so two officers adding at once never overwrite each other's list.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireCollegeMutation(req, "drive:update");
  if (!g.ok) return g.response;
  const drive = await driveForCollegeAdmin(g.ctx, (await ctx.params).id);
  if (!drive) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!driveDataOpen(drive)) return NextResponse.json({ error: "This drive is over, so no one can be invited." }, { status: 409 });
  const parsed = invitedEmployer.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the company details" }, { status: 400 });
  const { company, email, name, phone } = parsed.data;
  const added: Invitee = { company, email, ...(name ? { name } : {}), ...(phone ? { phone } : {}) };

  const result = await withLock(`drive-invites:${drive.id}`, async (tx) => {
    const [row] = await tx.select({ list: schema.collegeDrives.invitedEmployers }).from(schema.collegeDrives).where(eq(schema.collegeDrives.id, drive.id)).limit(1);
    const list = row?.list ?? [];
    const problem = inviteeAddProblem(list, email);
    if (problem) return { error: problem } as const;
    const invites = await sendDriveInvites({ id: drive.id, title: drive.title, kind: drive.kind, startsAt: drive.startsAt, endsAt: drive.endsAt, revokedAt: drive.revokedAt, tokenHash: drive.tokenHash }, g.ctx.college.id, g.ctx.college.name, [added]);
    // Failed or held back by the daily cap: flagged unsent, so the next save or link reissue tries again. Neither (the
    // address was already emailed for this drive today, drive-invite-limit.ts) counts as reached.
    const reached = !invites.failed.includes(email) && !invites.limited.includes(email);
    await tx
      .update(schema.collegeDrives)
      .set({ invitedEmployers: [...list, reached ? added : { ...added, unsent: true as const }], updatedAt: new Date() })
      .where(eq(schema.collegeDrives.id, drive.id));
    return { invites } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, invites: result.invites });
}
