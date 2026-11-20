import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

/** Reads for the leave-request screens. Timestamps are converted from `timestamp` to the instant (see scope.ts). */

export type MyLeaveRequest = {
  id: string;
  status: "requested" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

/** The student's latest request (any status), or null. */
export async function latestLeaveRequest(userId: string): Promise<MyLeaveRequest | null> {
  const res = await getDb().execute(sql`
    SELECT id, status, reason, decision_note, (requested_at AT TIME ZONE 'UTC') AS requested_at, (decided_at AT TIME ZONE 'UTC') AS decided_at
    FROM college_leave_requests WHERE user_id = ${userId} ORDER BY requested_at DESC, id LIMIT 1
  `);
  const r = (res.rows as Row[])[0];
  if (!r) return null;
  return {
    id: String(r.id),
    status: r.status as MyLeaveRequest["status"],
    reason: (r.reason as string | null) ?? null,
    decisionNote: (r.decision_note as string | null) ?? null,
    requestedAt: iso(r.requested_at)!,
    decidedAt: iso(r.decided_at),
  };
}

export type CollegeLeaveRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  year: number | null;
  branch: string | null;
  reason: string | null;
  status: "requested" | "approved" | "rejected" | "cancelled";
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedByType: string | null;
  /** Other requests this student has filed at this college (the history a TPO sees). */
  earlierRequests: number;
  earlierRejected: number;
};

/** Pending requests plus the 50 most recent closed ones, for one college only. */
export async function leaveRequestsForCollege(collegeId: string): Promise<CollegeLeaveRow[]> {
  const res = await getDb().execute(sql`
    SELECT * FROM (
      SELECT lr.id, lr.user_id, lr.status, lr.reason, lr.decision_note, lr.decided_by_type,
        (lr.requested_at AT TIME ZONE 'UTC') AS requested_at, (lr.decided_at AT TIME ZONE 'UTC') AS decided_at,
        trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name, u.email,
        m.year, m.branch,
        (SELECT count(*)::int FROM college_leave_requests o WHERE o.user_id = lr.user_id AND o.college_id = lr.college_id AND o.id <> lr.id) AS earlier_requests,
        (SELECT count(*)::int FROM college_leave_requests o WHERE o.user_id = lr.user_id AND o.college_id = lr.college_id AND o.id <> lr.id AND o.status = 'rejected') AS earlier_rejected,
        row_number() OVER (PARTITION BY (lr.status = 'requested') ORDER BY CASE WHEN lr.status = 'requested' THEN lr.requested_at END ASC, lr.decided_at DESC NULLS LAST, lr.requested_at DESC) AS rn
      FROM college_leave_requests lr
      JOIN users u ON u.id = lr.user_id
      LEFT JOIN college_memberships m ON m.user_id = lr.user_id
      WHERE lr.college_id = ${collegeId}
    ) t
    WHERE status = 'requested' OR rn <= 50
    ORDER BY (status = 'requested') DESC, CASE WHEN status = 'requested' THEN requested_at END ASC, decided_at DESC NULLS LAST, requested_at DESC
  `);
  return (res.rows as Row[]).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name || r.email),
    email: String(r.email),
    year: r.year === null || r.year === undefined ? null : Number(r.year),
    branch: (r.branch as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    status: r.status as CollegeLeaveRow["status"],
    requestedAt: iso(r.requested_at)!,
    decidedAt: iso(r.decided_at),
    decisionNote: (r.decision_note as string | null) ?? null,
    decidedByType: (r.decided_by_type as string | null) ?? null,
    earlierRequests: Number(r.earlier_requests ?? 0),
    earlierRejected: Number(r.earlier_rejected ?? 0),
  }));
}

export async function pendingLeaveCount(collegeId: string): Promise<number> {
  const res = await getDb().execute(sql`SELECT count(*)::int AS n FROM college_leave_requests WHERE college_id = ${collegeId} AND status = 'requested'`);
  return Number((res.rows as Row[])[0]?.n ?? 0);
}
