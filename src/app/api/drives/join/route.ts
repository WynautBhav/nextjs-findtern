import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { checkDriveLink } from "@/lib/college/access";
import { hashDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({ token: z.string().min(20).max(100) });

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
  const outcome = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ drive: schema.collegeDrives, collegeActive: schema.colleges.isActive })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDrives.tokenHash, hashDriveToken(parsed.data.token)))
      .limit(1)
      .for("share", { of: schema.collegeDrives });
    if (!row) return { status: 404 as const };
    const access = checkDriveLink({ drive: row.drive, token: parsed.data.token, session: guard.session, collegeActive: row.collegeActive });
    if (!access.ok) return { status: 403 as const, reason: access.reason };
    await tx
      .insert(schema.collegeDriveEmployers)
      .values({ driveId: row.drive.id, employerId: guard.session.uid })
      .onConflictDoNothing();
    return { status: 200 as const, drive: row.drive };
  });
  if (outcome.status === 404) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });
  if (outcome.status === 403) {
    const msg: Record<string, string> = {
      revoked: "The college has closed this link.",
      not_started: "This drive hasn't opened yet.",
      ended: "This drive has ended.",
    };
    return NextResponse.json({ error: msg[outcome.reason] ?? "This link isn't valid", reason: outcome.reason }, { status: 403 });
  }
  const { drive } = outcome;
  return NextResponse.json({ driveId: drive.id, redirect: `/employer/drives/${drive.id}` });
}
