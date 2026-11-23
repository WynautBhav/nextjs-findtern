import type { PgClient } from "../db/pg-tx.ts";
import { withPgTransaction } from "../db/pg-tx.ts";
import { cleanText, decisionOutcome, LEAVE_NOTE_MAX, LEAVE_REASON_MAX, requestProblem, type LeaveAction, type Problem } from "./leave-request.ts";

/**
 * Postgres wiring for leaving a college. The ONLY code that sets college_memberships.left_at is `endMembership`,
 * and the only callers are an approved request here (TPO or Findtern admin). Everything takes a client of an open
 * transaction so it can be tested with a fake client (see leave-request-db.test.ts).
 */

type Row = Record<string, unknown>;
const run = async (client: PgClient, sql: string, params: unknown[] = []) => {
  const r = await client.query(sql, params);
  return { rows: r.rows as Row[], rowCount: r.rowCount ?? 0 };
};

export type Actor = { type: "college_admin" | "admin"; id: string };

/** Exactly what an instant leave used to do: set left_at, drop presence, a college account becomes individual. */
export async function endMembership(client: PgClient, userId: string): Promise<void> {
  await run(client, "UPDATE college_memberships SET left_at = now() WHERE user_id = $1 AND left_at IS NULL", [userId]);
  await run(client, "DELETE FROM college_presence WHERE user_id = $1", [userId]);
  // Same closing a drive revoke does (closeDriveCalls): the student is no longer in any drive, so no request or call stays open for them. Nobody is notified.
  await run(client, "UPDATE college_drive_meetings SET status = 'cancelled', responded_at = now() WHERE user_id = $1 AND status IN ('requested', 'accepted')", [userId]);
  await run(
    client,
    "UPDATE intern_onboarding SET extra_data = extra_data || jsonb_build_object('accountType', 'individual') WHERE user_id = $1 AND extra_data->>'accountType' = 'college'",
    [userId],
  );
}

const AUDIT_SQL = "INSERT INTO college_audit_log (college_id, actor_type, actor_id, action, subject_user_id, meta) VALUES ($1,$2,$3,$4,$5,$6::jsonb)";

export type RequestResult = { ok: true; id: string; collegeId: string; collegeName: string } | ({ ok: false } & Problem);

/** The student files a request. One pending at a time (the partial unique index is the race-safe backstop). */
export async function createLeaveRequest(userId: string, rawReason: unknown): Promise<RequestResult> {
  const reason = cleanText(rawReason, LEAVE_REASON_MAX, "Reason");
  if (!reason.ok) return { ok: false, status: 400, code: "bad_reason", error: reason.error };
  try {
    return await withPgTransaction((client) => createLeaveRequestIn(client, userId, reason.value));
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, status: 409, code: "already_requested", error: "You already have a leave request waiting for your placement office." };
    throw e;
  }
}

export async function createLeaveRequestIn(client: PgClient, userId: string, reason: string | null): Promise<RequestResult> {
  const mem = (
    await run(
      client,
      "SELECT m.id, m.college_id, m.left_at, c.name AS college_name FROM college_memberships m JOIN colleges c ON c.id = m.college_id WHERE m.user_id = $1 AND m.left_at IS NULL FOR UPDATE OF m",
      [userId],
    )
  ).rows[0];
  const pending = (await run(client, "SELECT id FROM college_leave_requests WHERE user_id = $1 AND status = 'requested'", [userId])).rows.length > 0;
  const problem = requestProblem(mem ? { leftAt: null } : null, pending);
  if (problem) return { ok: false, ...problem };
  const ins = await run(
    client,
    "INSERT INTO college_leave_requests (user_id, college_id, membership_id, reason) VALUES ($1,$2,$3,$4) RETURNING id",
    [userId, mem!.college_id, mem!.id, reason],
  );
  const id = String(ins.rows[0].id);
  await run(client, AUDIT_SQL, [mem!.college_id, "intern", userId, "leave_request.requested", userId, JSON.stringify({ requestId: id })]);
  return { ok: true, id, collegeId: String(mem!.college_id), collegeName: String(mem!.college_name) };
}

/** The student withdraws their own pending request. False when there was nothing pending. */
export async function cancelLeaveRequest(userId: string): Promise<boolean> {
  return withPgTransaction(async (client) => {
    const r = await run(
      client,
      "UPDATE college_leave_requests SET status = 'cancelled', decided_at = now(), decided_by_type = 'student', decided_by_id = $1 WHERE user_id = $1 AND status = 'requested' RETURNING id, college_id",
      [userId],
    );
    if (r.rowCount === 0) return false;
    await run(client, AUDIT_SQL, [r.rows[0].college_id, "intern", userId, "leave_request.cancelled", userId, JSON.stringify({ requestId: r.rows[0].id })]);
    return true;
  });
}

export type DecideResult =
  | { ok: true; already: boolean; status: "approved" | "rejected"; userId: string; collegeId: string }
  | ({ ok: false } & Problem);

/**
 * Approve or reject one request, in one transaction. `collegeId` is set for a placement officer (their own college
 * only: another college's request is a plain 404) and null for a Findtern admin.
 */
export async function decideLeaveRequest(input: { actor: Actor; collegeId: string | null; requestId: string; action: LeaveAction; note?: unknown }): Promise<DecideResult> {
  const note = cleanText(input.note, LEAVE_NOTE_MAX, "Note");
  if (!note.ok) return { ok: false, status: 400, code: "bad_note", error: note.error };
  return withPgTransaction((client) => decideLeaveRequestIn(client, { ...input, note: note.value }));
}

export async function decideLeaveRequestIn(
  client: PgClient,
  input: { actor: Actor; collegeId: string | null; requestId: string; action: LeaveAction; note: string | null },
): Promise<DecideResult> {
  const { actor, collegeId, requestId, action, note } = input;
  const scope = collegeId === null ? "" : " AND college_id = $2";
  const req = (
    await run(
      client,
      `SELECT id, user_id, college_id, membership_id, status FROM college_leave_requests WHERE id = $1${scope} FOR UPDATE`,
      collegeId === null ? [requestId] : [requestId, collegeId],
    )
  ).rows[0];
  if (!req) return { ok: false, status: 404, code: "not_found", error: "Leave request not found" };
  const userId = String(req.user_id);
  const reqCollege = String(req.college_id);

  const outcome = decisionOutcome(String(req.status), action);
  if (outcome === "already") return { ok: true, already: true, status: action === "approve" ? "approved" : "rejected", userId, collegeId: reqCollege };
  if (outcome === "conflict") return { ok: false, status: 409, code: "already_decided", error: `This request was already ${String(req.status)}.` };

  const mem = (
    await run(client, "SELECT id, college_id, left_at FROM college_memberships WHERE user_id = $1 FOR UPDATE", [userId])
  ).rows[0];
  if (!mem || mem.left_at || String(mem.college_id) !== reqCollege) {
    // The student is no longer in this college: nothing to approve. Close the request as system-cancelled.
    await run(
      client,
      "UPDATE college_leave_requests SET status = 'cancelled', decided_at = now(), decided_by_type = 'system' WHERE id = $1",
      [requestId],
    );
    return { ok: false, status: 409, code: "not_member", error: "The student is no longer a member of this college." };
  }

  if (action === "approve") await endMembership(client, userId);
  const status = action === "approve" ? "approved" : "rejected";
  await run(
    client,
    "UPDATE college_leave_requests SET status = $2, decided_at = now(), decided_by_type = $3, decided_by_id = $4, decision_note = $5 WHERE id = $1",
    [requestId, status, actor.type, actor.id, note],
  );
  await run(client, AUDIT_SQL, [reqCollege, actor.type, actor.id, `leave_request.${status}`, userId, JSON.stringify({ requestId, hasNote: note !== null })]);
  return { ok: true, already: false, status, userId, collegeId: reqCollege };
}

/**
 * Findtern admin ends a live membership of this college by e-mail. Reuses the approve logic: a pending request is
 * approved, otherwise a request is filed on the student's behalf and approved in the same transaction.
 * Repeating it finds no live membership (404), so a double click cannot do anything twice.
 */
export async function adminEndMembership(input: { adminId: string; collegeId: string; email: string; note: unknown }): Promise<DecideResult & { requestId?: string }> {
  const note = cleanText(input.note, LEAVE_NOTE_MAX, "Note");
  if (!note.ok) return { ok: false, status: 400, code: "bad_note", error: note.error };
  return withPgTransaction(async (client) => {
    const mem = (
      await run(
        client,
        "SELECT m.id, m.user_id FROM college_memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = $1 AND m.left_at IS NULL AND lower(u.email) = lower($2) FOR UPDATE OF m",
        [input.collegeId, input.email.trim()],
      )
    ).rows[0];
    if (!mem) return { ok: false as const, status: 404, code: "not_member", error: "No student with that email is in this college." };
    let requestId = (await run(client, "SELECT id FROM college_leave_requests WHERE user_id = $1 AND college_id = $2 AND status = 'requested'", [mem.user_id, input.collegeId])).rows[0]?.id as string | undefined;
    if (!requestId) {
      const ins = await run(
        client,
        "INSERT INTO college_leave_requests (user_id, college_id, membership_id, reason) VALUES ($1,$2,$3,$4) RETURNING id",
        [mem.user_id, input.collegeId, mem.id, "Ended by Findtern admin"],
      );
      requestId = String(ins.rows[0].id);
    }
    const out = await decideLeaveRequestIn(client, { actor: { type: "admin", id: input.adminId }, collegeId: input.collegeId, requestId, action: "approve", note: note.value });
    return { ...out, requestId };
  });
}
