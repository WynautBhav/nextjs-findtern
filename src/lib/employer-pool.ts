import { eq, inArray, isNotNull, and, not, or, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "./db";
import type { CandidateProfile } from "./employer-candidates";
import { LIVE_STATUSES } from "./employer-offer-status";
import { feePaidSql } from "./fee-paid-sql";
import { heldElsewhereSql, hiredProposalSql } from "./employer-visibility";

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
    sql`${numericJson(sql`${schema.internOnboarding.extraData}->'ratings'->'interview'`)} > 0`,
    // Only interns staff have approved. A live score approves automatically
    // (lib/admin/score-live.ts); Rejected and Pending stay out. A row with no
    // approval status at all was scored in the legacy admin, which never
    // wrote one: the score is its approval there (EMB-02), so it counts.
    sql`COALESCE(${schema.internOnboarding.extraData}->>'approvalStatus', 'Approved') = 'Approved'`,
    // The score only follows the paid AI interview; a scored but unpaid intern stays hidden.
    feePaidSql(schema.users.id, schema.internOnboarding.extraData),
  ];
}

/**
 * A jsonb value as a float, 0 when it is neither a number nor a numeric
 * string. Legacy wrote `findternScore` either way and read it with Number()
 * (EMB-02). One CASE, so Postgres never casts a non-numeric string.
 */
function numericJson(value: SQL): SQL {
  return sql`(CASE WHEN jsonb_typeof(${value}) = 'number' THEN (${value} #>> '{}')::float8 WHEN jsonb_typeof(${value}) = 'string' AND btrim(${value} #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' THEN btrim(${value} #>> '{}')::float8 ELSE 0 END)`;
}

/**
 * `extra_data.findternScore` as a number, 0 when absent. A numeric string
 * (legacy) counts; any other string is 0 rather than failing the cast for the
 * whole query.
 */
export function scoreExpr(): SQL {
  return numericJson(sql`${schema.internOnboarding.extraData}->'findternScore'`);
}

/**
 * Of `internIds`, the ones this employer may open: in the pool today and not held by another company's offer or hire
 * (candidate-hold.ts: one offer at a time), or committed to this employer (offer accepted, being paid for, or hired).
 * That exception keeps an intern who switches off open-to-work once placed
 * reachable for checkout and the engagement (timesheets, full-time offer).
 * A sent, declined or withdrawn offer or a meeting is not enough: an intern
 * who hides their profile disappears for those employers, as on legacy.
 * `keepRelationships` (the profile page and photo only): a held intern stays reachable for a company that already has an
 * offer out to them, shortlisted them or has an interview with them.
 */
export async function visibleInternIds(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internIds: string[],
  opts: { keepRelationships?: boolean } = {},
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const [pool, committed] = await Promise.all([
    db
      .select({ id: schema.users.id, held: sql<boolean>`${heldElsewhereSql(employerId)}` })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(inArray(schema.users.id, ids), ...candidatePoolClauses())),
    db
      .select({ id: schema.proposals.internId })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.employerId, employerId),
          inArray(schema.proposals.internId, ids),
          or(inArray(schema.proposals.status, ["accepted", "processing"]), hiredProposalSql()),
        ),
      ),
  ]);
  const visible = new Set(pool.filter((r) => !r.held).map((r) => r.id));
  const heldIds = pool.filter((r) => r.held).map((r) => r.id);
  if (opts.keepRelationships && heldIds.length > 0) {
    const [offers, shortlisted, interviews] = await Promise.all([
      db
        .select({ id: schema.proposals.internId })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, employerId), inArray(schema.proposals.internId, heldIds), inArray(schema.proposals.status, LIVE_STATUSES))),
      db
        .select({ id: schema.employerCartItems.internId })
        .from(schema.employerCartItems)
        .where(and(eq(schema.employerCartItems.employerId, employerId), inArray(schema.employerCartItems.internId, heldIds))),
      db
        .select({ id: schema.interviews.internId })
        .from(schema.interviews)
        .where(and(eq(schema.interviews.employerId, employerId), inArray(schema.interviews.internId, heldIds))),
    ]);
    for (const r of [...offers, ...shortlisted, ...interviews]) visible.add(r.id);
  }
  return new Set([...visible, ...committed.map((r) => r.id)]);
}

/** Single-intern form of `visibleInternIds`. */
export async function canEmployerSeeIntern(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internId: string,
  opts: { keepRelationships?: boolean } = {},
): Promise<boolean> {
  return (await visibleInternIds(db, employerId, [internId], opts)).has(internId);
}

/**
 * Of `internIds`, the ones held by ANOTHER company's accepted-unpaid offer or running hire (candidate-hold.ts). The sender
 * routes answer these with 409 `candidate_unavailable` before anything else, so they never reveal who or when.
 */
export async function heldElsewhereIds(
  db: ReturnType<typeof getDb>,
  employerId: string,
  internIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, ids), heldElsewhereSql(employerId)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Of `internIds`, those in the pool right now - no relationship exception.
 * For actions that start something new (shortlist, first proposal, interview).
 * Pass `employerId` to also leave out anyone held by another company (candidate-hold.ts).
 */
export async function poolInternIds(
  db: ReturnType<typeof getDb>,
  internIds: string[],
  employerId?: string,
): Promise<Set<string>> {
  const ids = [...new Set(internIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
    .where(and(inArray(schema.users.id, ids), ...candidatePoolClauses(), employerId ? not(heldElsewhereSql(employerId)) : undefined));
  return new Set(rows.map((r) => r.id));
}

/**
 * Point `photoUrl` at the avatar route for every candidate with an uploaded
 * photo. Callers pass only candidates this employer may see; photos show
 * before hire (owner call, 6 Nov), names stay initials until hire. One query.
 */
export async function attachPhotos(
  db: ReturnType<typeof getDb>,
  profiles: CandidateProfile[],
): Promise<void> {
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
