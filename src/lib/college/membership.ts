import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { CODE_VERIFIED_BY, isCodeVerifiedMembership } from "@/lib/intern-account";
import { codesEqual, parseCollegeCode } from "./code";
import { COLLEGE_CODE_CONSENT_NOTICE, COLLEGE_CODE_CONSENT_VERSION } from "./code-consent";
import { branchProblem } from "./join-input";

/**
 * A student joining or leaving a college. Joining takes the college's own code
 * (never a name or an id, and no list of colleges is ever sent to a browser):
 * the code verifies the membership, and the college's officer then sees them.
 * Leaving drops them from every dashboard and drive at once.
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
};

export async function membershipOf(userId: string): Promise<MyCollege | null> {
  const [row] = await getDb()
    .select({ m: schema.collegeMemberships, c: schema.colleges })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeMemberships.collegeId))
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
  };
}

/** One answer for every code that does not open a college: wrong, malformed, switched off, not a partner. */
export const BAD_COLLEGE_CODE = "That code doesn't match a college. Check it with your college's placement office.";

/**
 * The active partner college that holds this code, or null. Only the code can find a college: nothing here
 * takes a name or an id. The stored value is compared in constant time, and a college that is switched off
 * or not a partner answers exactly like a code nobody holds.
 */
export async function findCollegeByCode(typed: unknown) {
  const code = parseCollegeCode(typed);
  if (!code) return null;
  const [college] = await getDb().select().from(schema.colleges).where(eq(schema.colleges.code, code)).limit(1);
  return college && codesEqual(code, college.code) && college.isActive && college.isPartner ? college : null;
}

/**
 * Join a college by its code. The code is the proof, so the membership is verified (`college_code`), an 18+
 * consent row is written, and the candidate's account becomes a college account. Callers must have
 * spent an attempt (code-throttle.ts) first. Failures never say whether the college or the code exists.
 */
export async function joinCollegeByCode(input: {
  userId: string;
  code: unknown;
  year: number | null;
  branch: string;
  declaredAdult: boolean;
}): Promise<{ ok: true; college: MyCollege } | { ok: false; error: string; status: number; reason: "adult" | "branch" | "code" | "account" }> {
  if (!input.declaredAdult) {
    return {
      ok: false,
      status: 400,
      reason: "adult",
      error: "Students under 18 need a parent's consent. Ask your placement office to add you.",
    };
  }
  const bad = branchProblem(input.branch);
  if (bad) return { ok: false, status: 400, reason: "branch", error: bad };
  const college = await findCollegeByCode(input.code);
  if (!college) return { ok: false, status: 400, reason: "code", error: BAD_COLLEGE_CODE };
  const db = getDb();
  const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!user) return { ok: false, status: 404, reason: "account", error: "Account not found" };

  const [roster] = await db
    .select({ year: schema.collegeRoster.year, branch: schema.collegeRoster.branch })
    .from(schema.collegeRoster)
    .where(and(eq(schema.collegeRoster.collegeId, college.id), eq(schema.collegeRoster.email, user.email.trim().toLowerCase())))
    .limit(1);

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.collegeMemberships).where(eq(schema.collegeMemberships.userId, input.userId)).limit(1);
    const [consent] = await tx
      .insert(schema.collegeConsents)
      .values({
        userId: input.userId,
        collegeId: college.id,
        noticeVersion: COLLEGE_CODE_CONSENT_VERSION,
        noticeHash: createHash("sha256").update(COLLEGE_CODE_CONSENT_NOTICE).digest("hex"),
        purposes: ["college_code_verification"],
        declaredAdult: true,
      })
      .returning({ id: schema.collegeConsents.id });
    const same = existing !== undefined && existing.collegeId === college.id && existing.leftAt === null;
    const values = {
      collegeId: college.id,
      status: "verified" as const,
      // The code is the proof, so it wins over any claim on another college; a proof already held on this one is kept.
      verifiedBy: same && existing.status === "verified" && existing.verifiedBy && CODE_VERIFIED_BY.includes(existing.verifiedBy) ? existing.verifiedBy : "college_code",
      // The college's roster is the source of truth for year and branch.
      year: roster?.year ?? input.year ?? (same ? existing.year : null),
      branch: roster?.branch || input.branch,
      consentId: consent.id,
      leftAt: null,
    };
    await tx
      .insert(schema.collegeMemberships)
      .values({ userId: input.userId, ...values })
      .onConflictDoUpdate({ target: schema.collegeMemberships.userId, set: { ...values, joinedAt: sql`now()` } });
    await tx.delete(schema.collegePresence).where(eq(schema.collegePresence.userId, input.userId));
    // Update only: a candidate with no profile row yet picks "college" up again on the first save, which re-checks the membership.
    await tx
      .update(schema.internOnboarding)
      .set({ extraData: sql`coalesce(${schema.internOnboarding.extraData}, '{}'::jsonb) || jsonb_build_object('accountType', 'college')` })
      .where(eq(schema.internOnboarding.userId, input.userId));
  });

  const mine = await membershipOf(input.userId);
  return mine ? { ok: true, college: mine } : { ok: false, status: 500, reason: "account", error: "Could not save" };
}

/** The candidate's live membership is one a college code backs. */
export async function hasCodeVerifiedMembership(userId: string): Promise<boolean> {
  const [m] = await getDb()
    .select({ status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt })
    .from(schema.collegeMemberships)
    .where(eq(schema.collegeMemberships.userId, userId))
    .limit(1);
  return isCodeVerifiedMembership(m);
}

export async function leaveCollege(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.collegeMemberships)
      .set({ leftAt: sql`now()` })
      .where(and(eq(schema.collegeMemberships.userId, userId), isNull(schema.collegeMemberships.leftAt)));
    await tx.delete(schema.collegePresence).where(eq(schema.collegePresence.userId, userId));
    // A college account with no college is an individual account.
    await tx
      .update(schema.internOnboarding)
      .set({ extraData: sql`${schema.internOnboarding.extraData} || jsonb_build_object('accountType', 'individual')` })
      .where(and(eq(schema.internOnboarding.userId, userId), sql`${schema.internOnboarding.extraData}->>'accountType' = 'college'`));
  });
}

/**
 * After a roster import: members on the roster pick up its year and branch.
 * The roster no longer verifies (the college code or college email does), so
 * nobody is newly verified here and this returns 0.
 */
export async function verifyFromRoster(collegeId: string): Promise<number> {
  await getDb().execute(sql`
    UPDATE ${schema.collegeMemberships} m SET
      year = coalesce(r.year, m.year), branch = coalesce(nullif(r.branch, ''), m.branch)
    FROM ${schema.users} u, ${schema.collegeRoster} r
    WHERE m.user_id = u.id AND m.college_id = ${collegeId} AND m.left_at IS NULL
      AND r.college_id = ${collegeId} AND r.email = lower(u.email)
  `);
  return 0;
}
