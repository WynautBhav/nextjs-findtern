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

  const db = getDb();
  const [row] = await db
    .select({ drive: schema.collegeDrives, collegeActive: schema.colleges.isActive })
    .from(schema.collegeDrives)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
    .where(eq(schema.collegeDrives.tokenHash, hashDriveToken(parsed.data.token)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "This link isn't valid" }, { status: 404 });
  const { drive } = row;

  const access = checkDriveLink({ drive, token: parsed.data.token, session: guard.session, collegeActive: row.collegeActive });
  if (!access.ok) {
    const msg: Record<string, string> = {
      revoked: "The college has closed this link.",
      not_started: "This drive hasn't opened yet.",
      ended: "This drive has ended.",
    };
    return NextResponse.json({ error: msg[access.reason] ?? "This link isn't valid", reason: access.reason }, { status: 403 });
  }
  await db
    .insert(schema.collegeDriveEmployers)
    .values({ driveId: drive.id, employerId: guard.session.uid })
    .onConflictDoNothing();
  return NextResponse.json({ driveId: drive.id, redirect: `/employer/drives/${drive.id}` });
}
