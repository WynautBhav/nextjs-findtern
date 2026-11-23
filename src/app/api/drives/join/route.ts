import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { checkDriveInviteLink, checkDriveLink } from "@/lib/college/access";
import { inviteSigOk, isInvited } from "@/lib/college/drive-invite";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { hashDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";
import { logDriveActivity } from "@/lib/college/campus-lock";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

// The share link's token, or the signed invite a company got by email (lib/college/drive-invite.ts).
const bodySchema = z.union([
  z.object({ token: z.string().min(20).max(100) }),
  z.object({ driveId: z.string().uuid(), email: z.string().max(200), sig: z.string().min(20).max(100) }),
]);

/**
 * A signed-in employer enters a drive from its share link. From here on their
 * pass is the joined row, not the token, so the token never has to sit in a
 * URL they keep using (or in their browser history after this page).
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  if (!limiters.generic.take(bucketKey(clientIp(req.headers), `drive-join:${guard.session.uid}`))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });

  // One transaction, the drive row read FOR SHARE: a link reissue (QA-200)
  // waits for this join to finish, then its delete removes the new row, so a
  // join can't slip in between the reissue's swap and its delete.
  const cred = parsed.data;
  const outcome = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ drive: schema.collegeDrives, collegeActive: schema.colleges.isActive })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where("token" in cred ? eq(schema.collegeDrives.tokenHash, hashDriveToken(cred.token)) : eq(schema.collegeDrives.id, cred.driveId))
      .limit(1)
      .for("share", { of: schema.collegeDrives });
    if (!row) return { status: 404 as const };
    // An invite is good only while its address is still on the drive's list and the drive's link has not been reissued.
    // It is not tied to the signed-in account's email: the share link admits any signed-in company too, and both end in
    // the same window, college and role checks, so an invite grants nothing the share link does not.
    const access =
      "token" in cred
        ? checkDriveLink({ drive: row.drive, token: cred.token, session: guard.session, collegeActive: row.collegeActive })
        : checkDriveInviteLink({
            drive: row.drive,
            valid: isInvited(row.drive.invitedEmployers, cred.email) && inviteSigOk(driveCodeSecret(), row.drive.id, row.drive.tokenHash, cred.email, cred.sig),
            session: guard.session,
            collegeActive: row.collegeActive,
          });
    if (!access.ok) return { status: 403 as const, reason: access.reason };
    const [prior] = await tx
      .select({ status: schema.collegeDriveEmployers.status })
      .from(schema.collegeDriveEmployers)
      .where(and(eq(schema.collegeDriveEmployers.driveId, row.drive.id), eq(schema.collegeDriveEmployers.employerId, guard.session.uid)))
      .limit(1);
    // A company that left the drive early stays out: the link does not put it back under the campus lock.
    if (prior?.status === "exited") return { status: 403 as const, reason: "exited" };
    const [added] = await tx
      .insert(schema.collegeDriveEmployers)
      .values({ driveId: row.drive.id, employerId: guard.session.uid, via: "token" in cred ? "link" : "invite" })
      .onConflictDoNothing()
      .returning({ id: schema.collegeDriveEmployers.id });
    return { status: 200 as const, drive: row.drive, added: Boolean(added) };
  });
  if (outcome.status === 404) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });
  if (outcome.status === 403) {
    const msg: Record<string, string> = {
      revoked: "The college has closed this link.",
      not_started: "This drive hasn't opened yet.",
      ended: "This drive has ended.",
      exited: "You left this drive. Your offers and hires from it are still in your account.",
    };
    return NextResponse.json({ error: msg[outcome.reason] ?? "This link isn't valid", reason: outcome.reason }, { status: 403 });
  }
  const { drive } = outcome;
  // Logged after the commit: a failed log insert inside the transaction would roll the join back.
  if (outcome.added) await logDriveActivity(getDb(), { driveId: drive.id, collegeId: drive.collegeId, employerId: guard.session.uid, action: "joined_drive", metadata: { via: "token" in cred ? "link" : "invite" } });
  return NextResponse.json({ driveId: drive.id, redirect: `/employer/drives/${drive.id}` });
}
