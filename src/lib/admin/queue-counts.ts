import { and, count, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AI_INTERVIEW_EMAIL, realEmployerId, TEST_EMPLOYER_ID } from "@/lib/admin/scope";
import { settleCount } from "@/lib/admin/queue-badge";

/**
 * Counts for the rail's live queue (Payouts, Candidates, Proposal pipeline).
 * The definitions are the dashboard's "Needs you today" ones
 * (app/admin/dashboard/page.tsx); keep them in step. One cheap query each. A
 * failed query is `null`, which the rail shows as nothing, never as 0.
 * Callers pass only what the signed-in admin may open, so a role without
 * Payouts never runs the payouts query.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The selected slot of an interview, in SQL. */
const SELECTED_SLOT = sql`(CASE ${schema.interviews.selectedSlot} WHEN 1 THEN ${schema.interviews.slot1} WHEN 2 THEN ${schema.interviews.slot2} WHEN 3 THEN ${schema.interviews.slot3} END)`;

/** An AI-interview row (the internal "admin" employer or the AI employer). */
const AI_INTERVIEW = sql`(i.employer_id = ${TEST_EMPLOYER_ID} OR i.employer_id IN (SELECT id FROM ${schema.employers} WHERE lower(company_email) = ${AI_INTERVIEW_EMAIL}))`;

export type QueueWant = { payouts: boolean; candidates: boolean; pipeline: boolean; collegePayouts?: boolean };
export type QueueCounts = { payouts: number | null; candidates: number | null; pipeline: number | null; collegePayouts: number | null };

/** Stipend payouts due now or within 3 days with no bank reference yet. */
function payoutsDue(): Promise<number | null> {
  const soon = new Date(Date.now() + 3 * DAY_MS).toISOString().slice(0, 10);
  return settleCount(async () => {
    const [row] = await getDb()
      .select({ value: count() })
      .from(schema.internPayouts)
      .where(
        and(
          eq(schema.internPayouts.status, "pending"),
          sql`coalesce(nullif(${schema.internPayouts.raw}->>'scheduledFor', ''), '0000-01-01') <= ${soon}`,
        ),
      );
    return row?.value ?? 0;
  });
}

/** Interns whose latest AI interview is completed but who have no Findtern Score. */
function candidatesAwaitingScore(): Promise<number | null> {
  return settleCount(async () => {
    const res = await getDb().execute<{ value: number }>(sql`
      SELECT count(*)::int AS value
        FROM ${schema.users} u
        LEFT JOIN ${schema.internOnboarding} o ON o.user_id = u.id
        JOIN LATERAL (
          SELECT lower(i.status) AS status FROM ${schema.interviews} i
           WHERE i.intern_id = u.id AND ${AI_INTERVIEW}
           ORDER BY i.created_at DESC NULLS LAST LIMIT 1
        ) latest ON true
       WHERE u.role = 'intern' AND latest.status = 'completed'
         AND coalesce(jsonb_typeof(o.extra_data->'findternScore'), '') <> 'number'`);
    return res.rows[0]?.value ?? 0;
  });
}

/** Upcoming employer interviews with no meeting link, plus accepted offers waiting on payment. */
function pipelineNeedingAction(): Promise<number | null> {
  return settleCount(async () => {
    const res = await getDb().execute<{ value: number }>(sql`
      SELECT (
        SELECT count(*) FROM ${schema.interviews}
         WHERE ${schema.interviews.status} = 'scheduled'
           AND ${realEmployerId(schema.interviews.employerId)}
           AND ${SELECTED_SLOT} > now()
           AND coalesce(trim(${schema.interviews.meetingLink}), '') = ''
      ) + (
        SELECT count(*) FROM ${schema.proposals}
         WHERE ${schema.proposals.status} = 'accepted'
           AND ${realEmployerId(schema.proposals.employerId)}
      ) AS value`);
    return res.rows[0]?.value ?? 0;
  });
}

/** College withdrawals waiting for an admin to pay them. */
function collegePayoutsOpen(): Promise<number | null> {
  return settleCount(async () => {
    const [row] = await getDb().select({ value: count() }).from(schema.collegePayouts).where(eq(schema.collegePayouts.status, "requested"));
    return row?.value ?? 0;
  });
}

export async function loadQueueCounts(want: QueueWant): Promise<QueueCounts> {
  const [payouts, candidates, pipeline, collegePayouts] = await Promise.all([
    want.payouts ? payoutsDue() : null,
    want.candidates ? candidatesAwaitingScore() : null,
    want.pipeline ? pipelineNeedingAction() : null,
    want.collegePayouts ? collegePayoutsOpen() : null,
  ]);
  return { payouts, candidates, pipeline, collegePayouts };
}
