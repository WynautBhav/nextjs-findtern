import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { concurrent, windowEnd, type Window } from "./drive-window";

export { concurrent, windowEnd, type Window };

/**
 * One drive at a time (owner, 24 Nov 2026): a company can't be inside two campus drives whose windows overlap, from any
 * college. Checked where a company enters a drive (the link, the email invite, the auto-join at sign-in), where an officer
 * invites one, and where an officer moves a drive's dates. Only the part of the overlap still to come counts: a drive
 * that already ended blocks nothing, even if its dates once overlapped.
 */

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type BusyDrive = { driveId: string; title: string; college: string; endsAt: Date };

/** The drive (other than `exceptDriveId`) a company is already inside that overlaps `w`, or null. */
export async function busyDriveFor(db: Db | Tx, employerId: string, w: Window, exceptDriveId: string | null, now = Date.now()): Promise<BusyDrive | null> {
  const d = schema.collegeDrives;
  const rows = await db
    .select({ id: d.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, revokedAt: d.revokedAt, college: schema.colleges.name })
    .from(schema.collegeDriveEmployers)
    .innerJoin(d, eq(d.id, schema.collegeDriveEmployers.driveId))
    .innerJoin(schema.colleges, eq(schema.colleges.id, d.collegeId))
    .where(
      and(
        eq(schema.collegeDriveEmployers.employerId, employerId),
        ne(schema.collegeDriveEmployers.status, "exited"),
        exceptDriveId ? ne(d.id, exceptDriveId) : undefined,
      ),
    );
  const hit = rows.find((r) => concurrent(r, w, now));
  return hit ? { driveId: hit.id, title: hit.title, college: hit.college, endsAt: windowEnd(hit) } : null;
}

/** Serialises every "enter a drive" for one company, so two joins at once can't both pass the check. */
export async function lockEmployerDrives(tx: Tx, employerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`employer-drives:${employerId}`}))`);
}

/**
 * Invited addresses the officer can't add to a drive with window `w`: the company (an account with that email) is inside
 * another overlapping drive, or this college already invited it to another of its own overlapping drives. The message
 * never names another college's drive.
 */
export async function blockedInvites(db: Db | Tx, input: { collegeId: string; driveId: string | null; w: Window; emails: string[] }, now = Date.now()): Promise<{ email: string; error: string }[]> {
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return [];
  const out: { email: string; error: string }[] = [];
  const d = schema.collegeDrives;
  // This college's own other drives that overlap and invite the same address.
  const ours = await db
    .select({ id: d.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, revokedAt: d.revokedAt, invited: d.invitedEmployers })
    .from(d)
    .where(and(eq(d.collegeId, input.collegeId), input.driveId ? ne(d.id, input.driveId) : undefined));
  // A company's account is its employers row (its own login, keyed by company email); the session id is employers.id.
  const accounts = await db
    .select({ id: schema.employers.id, company: sql<string>`lower(btrim(${schema.employers.companyEmail}))` })
    .from(schema.employers)
    .where(inArray(sql`lower(btrim(${schema.employers.companyEmail}))`, emails));
  for (const email of emails) {
    const own = ours.find((o) => concurrent(o, input.w, now) && (o.invited ?? []).some((i) => i.email.trim().toLowerCase() === email));
    if (own) {
      out.push({ email, error: `${email} is already invited to your drive "${own.title}" on overlapping dates. A company can be in one drive at a time.` });
      continue;
    }
    for (const a of accounts.filter((x) => x.company === email)) {
      if (await busyDriveFor(db, a.id, input.w, input.driveId, now)) {
        out.push({ email, error: `${email} is in another campus drive on these dates. A company can be in one drive at a time.` });
        break;
      }
    }
  }
  return out;
}
