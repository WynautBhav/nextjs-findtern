import { eq, inArray, isNotNull, and, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "./db";
import type { CandidateProfile } from "./employer-candidates";

/**
 * Who an employer is allowed to browse.
 *
 * The port of the legacy pool rule (`openToWork === true && findternScore > 0`)
 * plus the admin visibility switch: an active intern account, listed `live`,
 * not hidden by the intern, scored - a score only exists once the AI
 * interview has been taken, so an intern who has not interviewed yet stays out -
 * and approved by staff.
 *
 * Expects `intern_onboarding` to be joined (inner or left) onto `users`.
 */
export function candidatePoolClauses(): SQL[] {
  return [
    eq(schema.users.isActive, true),
    eq(schema.users.role, "intern"),
    eq(schema.users.profileVisibility, "live"),
    sql`COALESCE((${schema.internOnboarding.extraData}->>'openToWork'), 'true') <> 'false'`,
    sql`${scoreExpr()} > 0`,
    // Stricter than legacy: the score alone is not proof, because an admin
    // can save a coding or aptitude rating on its own and that produces a
    // score. Only an intern with an AI interview rating has interviewed.
    // One CASE, not two ANDed clauses: Postgres may evaluate the cast before
    // the type check, and a stray string would fail the whole query.
    sql`(CASE WHEN jsonb_typeof(${schema.internOnboarding.extraData}->'ratings'->'interview') = 'number' THEN (${schema.internOnboarding.extraData}->'ratings'->>'interview')::float8 ELSE 0 END) > 0`,
    // Only interns staff have approved. A live score approves automatically
    // (lib/admin/score-live.ts); Rejected and Pending stay out.
    sql`${schema.internOnboarding.extraData}->>'approvalStatus' = 'Approved'`,
  ];
}

/**
 * `extra_data.findternScore` as a number, 0 when absent. Guarded on the jsonb
 * type so a stray string in one row cannot fail the cast for the whole query.
 */
export function scoreExpr(): SQL {
  return sql`(CASE WHEN jsonb_typeof(${schema.internOnboarding.extraData}->'findternScore') = 'number' THEN (${schema.internOnboarding.extraData}->>'findternScore')::float8 ELSE 0 END)`;
}

/**
 * Of `internIds`, the ones this employer may open: in the pool today, or
 * already in a relationship with them (any proposal or interview). The
 * relationship exception keeps a hired intern who later hides their profile
 * reachable on the screens that manage that engagement.
 */
export async function visibleInternIds(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const [pool, proposed, interviewed] = await Promise.all([
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(inArray(schema.users.id, ids), ...candidatePoolClauses())),
    db
      .select({ id: schema.proposals.internId })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.internId, ids))),
    db
      .select({ id: schema.interviews.internId })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.employerId, employerId), inArray(schema.interviews.internId, ids))),
  ]);
  return new Set([...pool, ...proposed, ...interviewed].map((r) => r.id));
}

/** Single-intern form of `visibleInternIds`. */
export async function canEmployerSeeIntern(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internId: string,
): Promise<boolean> {
  return (await visibleInternIds(db, employerId, [internId])).has(internId);
}

/**
 * Of `internIds`, those in the pool right now - no relationship exception.
 * For actions that start something new (shortlist, first proposal, interview).
 */
export async function poolInternIds(
  db: ReturnType<typeof getDb>,
  internIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
    .where(and(inArray(schema.users.id, ids), ...candidatePoolClauses()));
  return new Set(rows.map((r) => r.id));
}

/**
 * Point `photoUrl` at the avatar route for every candidate with an uploaded
 * photo - but only for those in `unlocked` (hired by this employer, the same
 * set that reveals the name; see `hiredInternIds`). Everyone else keeps the
 * initials avatar. One query for the whole list.
 */
export async function attachPhotos(
  db: ReturnType<typeof getDb>,
  profiles: CandidateProfile[],
  unlocked: { has(id: string): boolean },
): Promise<void> {
  profiles = profiles.filter((p) => unlocked.has(p.id));
  if (profiles.length === 0) return;
  const rows = await db
    .select({ userId: schema.internDocuments.userId })
    .from(schema.internDocuments)
    .where(
      and(
        inArray(
          schema.internDocuments.userId,
          profiles.map((p) => p.id),
        ),
        isNotNull(schema.internDocuments.profilePhotoName),
      ),
    );
  const uploaded = new Set(rows.map((r) => r.userId));
  for (const profile of profiles) {
    if (uploaded.has(profile.id)) profile.photoUrl = avatarUrl(profile.id);
  }
}

export function avatarUrl(internId: string): string {
  return `/api/intern/avatar?id=${encodeURIComponent(internId)}`;
}
