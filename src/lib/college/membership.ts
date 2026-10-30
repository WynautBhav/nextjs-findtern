import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { membershipFor } from "./access";
import { NOTICE_HASH, NOTICE_VERSION, parsePurposes, type ConsentPurpose } from "./consent";

/**
 * A student joining or leaving a college. Joining records a fresh consent
 * row (the notice hash pins what they saw) and works out whether the
 * membership is verified. Leaving withdraws consent and drops them from every
 * dashboard and drive at once.
 */

export type MyCollege = {
  collegeId: string;
  name: string;
  city: string | null;
  isPartner: boolean;
  status: "claimed" | "verified";
  verifiedBy: string | null;
  year: number | null;
  branch: string | null;
  purposes: ConsentPurpose[];
};

export async function membershipOf(userId: string): Promise<MyCollege | null> {
  const [row] = await getDb()
    .select({ m: schema.collegeMemberships, c: schema.colleges, consent: schema.collegeConsents })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeMemberships.collegeId))
    .leftJoin(
      schema.collegeConsents,
      and(eq(schema.collegeConsents.id, schema.collegeMemberships.consentId), isNull(schema.collegeConsents.withdrawnAt)),
    )
    .where(and(eq(schema.collegeMemberships.userId, userId), isNull(schema.collegeMemberships.leftAt)))
    .limit(1);
  if (!row) return null;
  return {
    collegeId: row.c.id,
    name: row.c.name,
    city: row.c.city,
    isPartner: row.c.isPartner,
    status: row.m.status === "verified" ? "verified" : "claimed",
    verifiedBy: row.m.verifiedBy,
    year: row.m.year,
    branch: row.m.branch,
    purposes: parsePurposes(row.consent?.purposes),
  };
}

export async function joinCollege(input: {
  userId: string;
  collegeId: string;
  year: number | null;
  branch: string | null;
  purposes: ConsentPurpose[];
  declaredAdult: boolean;
  userAgent: string | null;
}): Promise<{ ok: true; college: MyCollege } | { ok: false; error: string; status: number }> {
  if (!input.declaredAdult) {
    return {
      ok: false,
      status: 400,
      error: "Students under 18 need a parent's consent. Ask your placement office to add you.",
    };
  }
  const db = getDb();
  const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.id, input.collegeId)).limit(1);
  if (!college || !college.isActive) return { ok: false, status: 404, error: "College not found" };
  const [user] = await db
    .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .limit(1);
  if (!user) return { ok: false, status: 404, error: "Account not found" };

  const email = user.email.trim().toLowerCase();
  const [roster] = await db
    .select({ year: schema.collegeRoster.year, branch: schema.collegeRoster.branch })
    .from(schema.collegeRoster)
    .where(and(eq(schema.collegeRoster.collegeId, college.id), eq(schema.collegeRoster.email, email)))
    .limit(1);
  const proof = membershipFor({
    email,
    emailVerified: user.emailVerified,
    domains: college.emailDomains ?? [],
    onRoster: Boolean(roster),
  });

  await db.transaction(async (tx) => {
    // A new college (or new choices) is a new consent; the old one is closed, not edited.
    await tx
      .update(schema.collegeConsents)
      .set({ withdrawnAt: sql`now()` })
      .where(and(eq(schema.collegeConsents.userId, input.userId), isNull(schema.collegeConsents.withdrawnAt)));
    const [consent] = await tx
      .insert(schema.collegeConsents)
      .values({
        userId: input.userId,
        collegeId: college.id,
        noticeVersion: NOTICE_VERSION,
        noticeHash: NOTICE_HASH,
        purposes: input.purposes,
        declaredAdult: true,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      })
      .returning({ id: schema.collegeConsents.id });
    const values = {
      collegeId: college.id,
      status: proof.status,
      verifiedBy: proof.verifiedBy,
      // The college's roster is the source of truth for year and branch.
      year: roster?.year ?? input.year,
      branch: roster?.branch || input.branch,
      consentId: consent.id,
      leftAt: null,
    };
    await tx
      .insert(schema.collegeMemberships)
      .values({ userId: input.userId, ...values })
      .onConflictDoUpdate({ target: schema.collegeMemberships.userId, set: { ...values, joinedAt: sql`now()` } });
    await tx.delete(schema.collegePresence).where(eq(schema.collegePresence.userId, input.userId));
  });

  const mine = await membershipOf(input.userId);
  return mine ? { ok: true, college: mine } : { ok: false, status: 500, error: "Could not save" };
}

export async function leaveCollege(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.collegeConsents)
      .set({ withdrawnAt: sql`now()` })
      .where(and(eq(schema.collegeConsents.userId, userId), isNull(schema.collegeConsents.withdrawnAt)));
    await tx
      .update(schema.collegeMemberships)
      .set({ leftAt: sql`now()` })
      .where(and(eq(schema.collegeMemberships.userId, userId), isNull(schema.collegeMemberships.leftAt)));
    await tx.delete(schema.collegePresence).where(eq(schema.collegePresence.userId, userId));
  });
}

/**
 * After a roster import: members whose email is now on the roster become
 * verified (roster is the stronger proof, so domain-verified members are
 * relabelled too, and pick up the roster's year and branch). Returns how many
 * were *newly* verified: relabelling someone already verified by college email
 * isn't news to the officer, and counting it said "60 now verified" when none were.
 */
export async function verifyFromRoster(collegeId: string): Promise<number> {
  const match = sql`m.user_id = u.id AND m.college_id = ${collegeId} AND m.left_at IS NULL
      AND r.college_id = ${collegeId} AND r.email = lower(u.email)`;
  const db = getDb();
  const before = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${schema.collegeMemberships} m, ${schema.users} u, ${schema.collegeRoster} r
    WHERE ${match} AND m.status <> 'verified'
  `);
  await db.execute(sql`
    UPDATE ${schema.collegeMemberships} m SET status = 'verified', verified_by = 'roster',
      year = coalesce(r.year, m.year), branch = coalesce(nullif(r.branch, ''), m.branch)
    FROM ${schema.users} u, ${schema.collegeRoster} r
    WHERE ${match}
      AND (m.status <> 'verified' OR m.verified_by IS DISTINCT FROM 'roster')
  `);
  return Number((before.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/**
 * Search the college list for the student picker (~70k AISHE institutions).
 * Every word must appear in the name or the city, so "jecrc jaipur" works;
 * an exact AISHE code or slug ("jklu") also matches. The trigram indexes (drizzle/0008) serve
 * the ILIKE '%word%' tests. Order: partners, names that start with the whole
 * query, names that contain it, then A-Z.
 */
export async function searchColleges(q: string, limit = 12) {
  const c = schema.colleges;
  const pick = { id: c.id, name: c.name, city: c.city, state: c.state, isPartner: c.isPartner };
  const esc = (t: string) => t.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  const term = q.trim().replace(/\s+/g, " ");
  if (term.length < 2) {
    return getDb()
      .select(pick)
      .from(c)
      .where(and(eq(c.isActive, true), eq(c.isPartner, true)))
      .orderBy(c.sortOrder, c.name)
      .limit(limit);
  }
  const words = term.split(" ").slice(0, 4).map((w) => `%${esc(w)}%`);
  const everyWord = and(...words.map((w) => sql`(${c.name} ILIKE ${w} OR ${c.city} ILIKE ${w})`));
  return getDb()
    .select(pick)
    .from(c)
    .where(and(eq(c.isActive, true), sql`(${everyWord} OR ${c.aisheCode} = ${term.toUpperCase()} OR ${c.slug} = ${term.toLowerCase()})`))
    .orderBy(
      sql`${c.isPartner} DESC`,
      sql`(${c.name} ILIKE ${esc(term) + "%"}) DESC`,
      sql`(${c.name} ILIKE ${"%" + esc(term) + "%"}) DESC`,
      c.name,
    )
    .limit(limit);
}
