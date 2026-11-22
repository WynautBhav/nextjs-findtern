import type { PgClient } from "../db/pg-tx.ts";
import { withPgTransaction } from "../db/pg-tx.ts";
import { namesMatch } from "./identity-match.ts";
import { endMembership, type Actor } from "./leave-request-db.ts";
import { cleanText, LEAVE_NOTE_MAX, type Problem } from "./leave-request.ts";

/**
 * A placement officer (or a Findtern admin) accepting, denying and restoring students of ONE college.
 *
 * Who can be accepted is decided here, never by the caller: a student id from the browser is only a pointer into
 * the list this file computes for the officer's own college. The officer writes their own student list, so "the
 * email is on the list" proves nothing by itself: an officer could type a stranger's address. An account is
 * offered to the officer only when something the officer does not control agrees:
 *   requested      the student picked this college themselves and is still unverified;
 *   college_email  the student's verified email is on one of the college's domains (set by Findtern, not the officer);
 *   list           the list has the student's verified email AND the name on the list is the account's name
 *                  (namesMatch: the same rule the promo-code identity check uses).
 * Everything weaker goes to a Findtern admin (`reviewsIn`, accepted with `asAdmin`): a list email whose name differs,
 * and a phone number that belongs to an account under another email. Before a student is accepted the officer is
 * shown only what they typed themselves (list name, email) or the name on a college-domain / self-requested account:
 * never the account's phone, and nothing of an account still under review.
 *
 * A denial is a row in college_denials (drizzle/0050), not a state of the membership row: a student has one
 * membership row and a later join overwrites it. The trigger there refuses any live membership of a college that
 * denied the student, for every writer. Restore deletes the denial.
 * Everything takes a client of an open transaction; the SQL is tested against Postgres (approvals.test.ts).
 */

type Row = Record<string, unknown>;
const run = async (client: PgClient, sql: string, params: unknown[] = []) => {
  const r = await client.query(sql, params);
  return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0 };
};

const AUDIT_SQL = "INSERT INTO college_audit_log (college_id, actor_type, actor_id, action, subject_user_id, meta) VALUES ($1,$2,$3,$4,$5,$6::jsonb)";

export type CandidateSource = "requested" | "list" | "college_email";

export type Candidate = {
  userId: string;
  /** The name the officer typed for a list match; the account's name otherwise. */
  name: string;
  email: string;
  source: CandidateSource;
  rollNo: string | null;
  year: number | null;
  branch: string | null;
  /** When the Findtern account was made (ISO). */
  accountSince: string | null;
};

export const SOURCE_LABEL: Record<CandidateSource, string> = {
  requested: "Picked your college",
  list: "On your student list",
  college_email: "Uses a college email",
};

/** LIKE patterns for "address is on this domain or a subdomain of it". Wildcards inside a domain are escaped. */
export function domainPatterns(domains: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of domains) {
    const d = String(raw ?? "").trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) continue;
    const safe = d.replace(/[\\%_]/g, (c) => `\\${c}`);
    out.push(`%@${safe}`, `%.${safe}`);
  }
  return out;
}

/**
 * $1 college id, $2 domain LIKE patterns. Never offered: a student with a live membership anywhere, one who left
 * THIS college (leaving is a decision, not a gap to fill), and one this college denied.
 */
const CANDIDATE_SQL = `
  SELECT u.id AS user_id, u.first_name, u.last_name, u.email, (u.created_at AT TIME ZONE 'UTC') AS created_at,
    r.name AS list_name, r.roll_no, coalesce(r.year, m.year) AS year, coalesce(nullif(r.branch, ''), m.branch) AS branch,
    (lower(u.email) LIKE ANY($2::text[])) AS on_domain,
    CASE WHEN m.college_id = $1 AND m.left_at IS NULL THEN 'requested' WHEN r.id IS NOT NULL THEN 'list' ELSE 'college_email' END AS source
  FROM users u
  LEFT JOIN college_memberships m ON m.user_id = u.id
  LEFT JOIN college_roster r ON r.college_id = $1 AND r.email = lower(u.email)
  WHERE u.role = 'intern' AND u.is_active
    AND NOT EXISTS (SELECT 1 FROM college_denials d WHERE d.college_id = $1 AND d.user_id = u.id)
    AND (
      (m.college_id = $1 AND m.left_at IS NULL AND m.status = 'claimed')
      OR (
        (m.id IS NULL OR (m.left_at IS NOT NULL AND m.college_id <> $1))
        AND u.email_verified
        AND (r.id IS NOT NULL OR lower(u.email) LIKE ANY($2::text[]))
      )
    )`;

const accountName = (r: Row) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();

/** The officer may decide this row themselves. A list match needs the college's domain or the same name on both sides. */
function officerMayDecide(r: Row): boolean {
  if (r.source !== "list") return true;
  return Boolean(r.on_domain) || namesMatch(r.list_name, accountName(r));
}

function toCandidate(r: Row): Candidate {
  const source = r.source === "requested" || r.source === "list" ? r.source : "college_email";
  return {
    userId: String(r.user_id),
    name: source === "list" ? String(r.list_name ?? "").trim() || accountName(r) : accountName(r),
    email: String(r.email ?? ""),
    source,
    rollNo: (r.roll_no as string | null) ?? null,
    year: r.year === null || r.year === undefined ? null : Number(r.year),
    branch: (r.branch as string | null) || null,
    accountSince: r.created_at ? new Date(r.created_at as string).toISOString() : null,
  };
}

const CANDIDATE_LIMIT = 2000;

async function candidateRows(client: PgClient, collegeId: string, domains: readonly string[]): Promise<Row[]> {
  return (await run(client, `${CANDIDATE_SQL} ORDER BY u.first_name, u.last_name LIMIT ${CANDIDATE_LIMIT}`, [collegeId, domainPatterns(domains)])).rows;
}

/** The students the officer may accept or deny. */
export async function candidatesIn(client: PgClient, collegeId: string, domains: readonly string[]): Promise<Candidate[]> {
  return (await candidateRows(client, collegeId, domains)).filter(officerMayDecide).map(toCandidate);
}

/** A match only a Findtern admin may accept. `kind` says why the officer was not offered it. */
export type AdminReview = { userId: string; kind: "phone" | "name"; listName: string; listEmail: string; accountName: string; accountEmail: string; phoneLast4: string | null };

/**
 * Students on the college's list whose PHONE is a Findtern account's, under a different email, with no membership.
 * For a Findtern admin only: it returns the account's name and email, which the officer must not learn this way.
 */
const PHONE_MATCH_SQL = `
  SELECT u.id AS user_id, r.name AS list_name, r.email AS list_email, u.first_name, u.last_name, u.email, r.phone
  FROM college_roster r
  JOIN users u ON u.role = 'intern' AND u.is_active AND right(regexp_replace(u.phone_number, '\\D', '', 'g'), 10) = r.phone
    AND regexp_replace(u.country_code, '\\D', '', 'g') = '91' AND lower(u.email) <> r.email
  LEFT JOIN college_memberships m ON m.user_id = u.id
  WHERE r.college_id = $1 AND r.phone IS NOT NULL
    AND (m.id IS NULL OR (m.left_at IS NOT NULL AND m.college_id <> $1))
    AND NOT EXISTS (SELECT 1 FROM college_denials d WHERE d.college_id = $1 AND d.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM users u2 WHERE lower(u2.email) = r.email)`;

/** Everything waiting on a Findtern admin for this college: phone-only matches, and list emails whose name differs. */
export async function reviewsIn(client: PgClient, collegeId: string, domains: readonly string[]): Promise<AdminReview[]> {
  const phone = (await run(client, `${PHONE_MATCH_SQL} ORDER BY r.name LIMIT 500`, [collegeId])).rows.map((r): AdminReview => ({
    userId: String(r.user_id),
    kind: "phone",
    listName: String(r.list_name ?? ""),
    listEmail: String(r.list_email ?? ""),
    accountName: accountName(r),
    accountEmail: String(r.email ?? ""),
    phoneLast4: String(r.phone ?? "").slice(-4),
  }));
  const name = (await candidateRows(client, collegeId, domains)).filter((r) => !officerMayDecide(r)).map((r): AdminReview => ({
    userId: String(r.user_id),
    kind: "name",
    listName: String(r.list_name ?? ""),
    listEmail: String(r.email ?? ""),
    accountName: accountName(r),
    accountEmail: String(r.email ?? ""),
    phoneLast4: null,
  }));
  return [...name, ...phone];
}

export type RemovedStudent = { userId: string; name: string; email: string; decidedAt: string | null; note: string | null };

export async function removedIn(client: PgClient, collegeId: string): Promise<RemovedStudent[]> {
  const res = await run(
    client,
    `SELECT u.id AS user_id, u.first_name, u.last_name, u.email, (d.created_at AT TIME ZONE 'UTC') AS decided_at, d.note
     FROM college_denials d JOIN users u ON u.id = d.user_id
     WHERE d.college_id = $1 ORDER BY d.created_at DESC LIMIT 1000`,
    [collegeId],
  );
  return res.rows.map((r) => ({
    userId: String(r.user_id),
    name: accountName(r),
    email: String(r.email ?? ""),
    decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : null,
    note: (r.note as string | null) ?? null,
  }));
}

export type ApprovalAction = "accept" | "deny" | "restore";
export type ApprovalResult = { ok: true; action: ApprovalAction; userId: string; already: boolean } | ({ ok: false } & Problem);

const NOT_FOUND: { ok: false } & Problem = { ok: false, status: 404, code: "not_found", error: "That student is not on your list." };

const MOVED: { ok: false } & Problem = { ok: false, status: 409, code: "elsewhere", error: "That student has joined another college since this list was made." };

/**
 * Create or revive the membership as verified. The WHERE on the upsert is the race guard: a student who joined
 * another college between the check and this statement keeps that live membership (0 rows, reported as MOVED).
 */
const VERIFY_UPSERT_SQL = `INSERT INTO college_memberships (user_id, college_id, status, verified_by, year, branch, decided_at, decided_by_type, decided_by_id)
  VALUES ($1,$2,'verified','tpo',$3,$4,now(),$5,$6)
  ON CONFLICT (user_id) DO UPDATE SET college_id = EXCLUDED.college_id, status = 'verified', verified_by = 'tpo',
    year = coalesce(EXCLUDED.year, CASE WHEN college_memberships.college_id = EXCLUDED.college_id THEN college_memberships.year END),
    branch = coalesce(EXCLUDED.branch, CASE WHEN college_memberships.college_id = EXCLUDED.college_id THEN college_memberships.branch END),
    left_at = NULL, joined_at = now(), decided_at = now(), decided_by_type = EXCLUDED.decided_by_type, decided_by_id = EXCLUDED.decided_by_id
  WHERE college_memberships.left_at IS NOT NULL OR college_memberships.college_id = EXCLUDED.college_id`;

/** The row that makes this student decidable for this college, or null. `asAdmin` also admits the admin-only matches. */
async function decidable(client: PgClient, input: { collegeId: string; domains: readonly string[]; userId: string; asAdmin?: boolean }): Promise<{ source: string } | null> {
  const hit = (await run(client, `${CANDIDATE_SQL} AND u.id = $3`, [input.collegeId, domainPatterns(input.domains), input.userId])).rows[0];
  if (hit) return officerMayDecide(hit) ? { source: String(hit.source) } : input.asAdmin ? { source: "name_review" } : null;
  if (!input.asAdmin) return null;
  const phone = (await run(client, `${PHONE_MATCH_SQL} AND u.id = $2`, [input.collegeId, input.userId])).rows[0];
  return phone ? { source: "phone_match" } : null;
}

async function verify(client: PgClient, collegeId: string, userId: string, actor: Actor, byPhone: boolean): Promise<boolean> {
  const roster = (
    await run(client, "SELECT r.year, r.branch FROM college_roster r JOIN users u ON u.id = $2 WHERE r.college_id = $1 AND (r.email = lower(u.email) OR ($3 AND r.phone = right(regexp_replace(u.phone_number, '\\D', '', 'g'), 10))) LIMIT 1", [collegeId, userId, byPhone])
  ).rows[0];
  const res = await run(client, VERIFY_UPSERT_SQL, [userId, collegeId, roster?.year ?? null, roster?.branch || null, actor.type, actor.id]);
  if (res.rowCount === 0) return false;
  await run(client, "DELETE FROM college_presence WHERE user_id = $1", [userId]);
  return true;
}

async function acceptIn(client: PgClient, input: { collegeId: string; domains: readonly string[]; userId: string; actor: Actor; asAdmin?: boolean }): Promise<ApprovalResult> {
  const { collegeId, userId, actor } = input;
  const mem = (await run(client, "SELECT college_id, status, left_at FROM college_memberships WHERE user_id = $1 FOR UPDATE", [userId])).rows[0];
  if (mem && String(mem.college_id) === collegeId && !mem.left_at && mem.status === "verified") return { ok: true, action: "accept", userId, already: true };
  // Re-read under the lock: the list the officer saw may be stale, and the id came from a browser.
  const hit = await decidable(client, input);
  if (!hit) return NOT_FOUND;
  if (!(await verify(client, collegeId, userId, actor, hit.source === "phone_match"))) return MOVED;
  await run(client, AUDIT_SQL, [collegeId, actor.type, actor.id, "student.accepted", userId, JSON.stringify({ source: hit.source })]);
  return { ok: true, action: "accept", userId, already: false };
}

async function denyIn(client: PgClient, input: { collegeId: string; domains: readonly string[]; userId: string; actor: Actor; note: string | null; asAdmin?: boolean }): Promise<ApprovalResult> {
  const { collegeId, userId, actor, note } = input;
  if ((await run(client, "SELECT 1 FROM college_denials WHERE college_id = $1 AND user_id = $2", [collegeId, userId])).rows[0]) return { ok: true, action: "deny", userId, already: true };
  const mem = (await run(client, "SELECT college_id, left_at FROM college_memberships WHERE user_id = $1 FOR UPDATE", [userId])).rows[0];
  const member = Boolean(mem && String(mem.college_id) === collegeId && !mem.left_at);
  if (member) {
    // A member (verified or still unverified): end it the way an approved leave does. Another college's row is never touched.
    await endMembership(client, userId);
    await run(client, "UPDATE college_leave_requests SET status = 'cancelled', decided_at = now(), decided_by_type = 'system' WHERE user_id = $1 AND college_id = $2 AND status = 'requested'", [userId, collegeId]);
  } else if (!(await decidable(client, input))) {
    return NOT_FOUND;
  }
  await run(client, "INSERT INTO college_denials (college_id, user_id, decided_by_type, decided_by_id, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (college_id, user_id) DO NOTHING", [collegeId, userId, actor.type, actor.id, note]);
  await run(client, AUDIT_SQL, [collegeId, actor.type, actor.id, "student.denied", userId, JSON.stringify({ wasMember: member, hasNote: note !== null })]);
  return { ok: true, action: "deny", userId, already: false };
}

/** Lift the denial and put the student back. If they have joined another college meanwhile, only the denial goes. */
async function restoreIn(client: PgClient, input: { collegeId: string; userId: string; actor: Actor }): Promise<ApprovalResult> {
  const { collegeId, userId, actor } = input;
  const gone = await run(client, "DELETE FROM college_denials WHERE college_id = $1 AND user_id = $2", [collegeId, userId]);
  if (gone.rowCount === 0) return NOT_FOUND;
  await run(client, "SELECT 1 FROM college_memberships WHERE user_id = $1 FOR UPDATE", [userId]);
  const back = await verify(client, collegeId, userId, actor, false);
  await run(client, AUDIT_SQL, [collegeId, actor.type, actor.id, "student.restored", userId, JSON.stringify({ rejoined: back })]);
  return { ok: true, action: "restore", userId, already: false };
}

export type DecideInput = { collegeId: string; domains: readonly string[]; userId: string; action: ApprovalAction; actor: Actor; note?: unknown; asAdmin?: boolean };

export async function decideStudentIn(client: PgClient, input: DecideInput & { note: string | null }): Promise<ApprovalResult> {
  if (input.action === "accept") return acceptIn(client, input);
  if (input.action === "deny") return denyIn(client, input);
  return restoreIn(client, input);
}

/** One decision, one transaction. */
export async function decideStudent(input: DecideInput): Promise<ApprovalResult> {
  const note = cleanText(input.note, LEAVE_NOTE_MAX, "Note");
  if (!note.ok) return { ok: false, status: 400, code: "bad_note", error: note.error };
  return withPgTransaction((client) => decideStudentIn(client, { ...input, note: note.value }));
}

/** Everything the Approvals screen shows, read in one connection. The officer's page uses `reviews.length` only. */
export async function approvalsFor(collegeId: string, domains: readonly string[]) {
  return withPgTransaction(async (client) => ({
    candidates: await candidatesIn(client, collegeId, domains),
    reviews: await reviewsIn(client, collegeId, domains),
    removed: await removedIn(client, collegeId),
  }));
}

/** The students the officer can decide right now (the Approvals list, the dashboard tile and "Waiting for you" on Students). */
export async function candidatesFor(collegeId: string, domains: readonly string[]) {
  return withPgTransaction((client) => candidatesIn(client, collegeId, domains));
}

/** The officer's badge: how many students they can decide right now. */
export async function pendingApprovalCount(collegeId: string, domains: readonly string[]): Promise<number> {
  return (await candidatesFor(collegeId, domains)).length;
}
