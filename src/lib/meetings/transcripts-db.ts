import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { planFailure } from "./backoff";
import { flagTranscript } from "./flags";
import { FirefliesError, getFireflies, type FirefliesClient, type FfTranscript } from "./fireflies";
import { expiries, purgeExpired, PURGE_BATCH, type PurgeCounts, type PurgeStore } from "./retention";
import { SEVERITY_RANK, type Flag } from "./review-types";
import { matchTranscript, meetCode, normalizeEventId, type MeetingCandidate } from "./transcript-match";

/**
 * Transcript ingestion. The `meeting_transcripts` row in status `queued` IS the queue (the outbox pattern): the webhook only
 * inserts it (idempotent on the Fireflies id) and answers; the sweeper (or `after()` right behind the response) claims it with a
 * lease (attempts+1, next_attempt_at pushed out), fetches OUTSIDE any transaction, then stores the result. A crash mid-fetch leaves
 * the lease to expire and the row is retried; errors back off (src/lib/meetings/backoff.ts) and end in `failed` after 6 tries.
 * Nothing here punishes anyone: a flagged, matched meeting becomes review_state `open` for an admin.
 */

type Db = ReturnType<typeof getDb>;
const t = schema.meetingTranscripts;

/** Idempotent: a replayed webhook for the same transcript changes nothing. Returns true when a NEW row was made. */
export async function enqueueTranscript(id: string, db: Db = getDb()): Promise<boolean> {
  // Clock values come from the app, not the column defaults: the database session zone must not decide whether a row is due.
  const now = new Date();
  const ins = await db.insert(t).values({ firefliesId: id, receivedAt: now, nextAttemptAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: t.firefliesId }).returning({ id: t.id });
  return ins.length > 0;
}

/** A late summary: re-fetch a ready row whose summary was empty when first read. */
export async function requeueForSummary(id: string, db: Db = getDb()): Promise<void> {
  await db
    .update(t)
    .set({ status: "queued", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(and(eq(t.firefliesId, id), eq(t.status, "ready"), isNull(t.summary), isNull(t.textPurgedAt)));
}

const maxSeverity = (flags: Flag[]): Flag["severity"] | null => flags.reduce<Flag["severity"] | null>((m, f) => (m === null || SEVERITY_RANK[f.severity] > SEVERITY_RANK[m] ? f.severity : m), null);

const BOOKED_START = sql`(CASE ${schema.interviews.selectedSlot} WHEN 1 THEN ${schema.interviews.slot1} WHEN 2 THEN ${schema.interviews.slot2} WHEN 3 THEN ${schema.interviews.slot3} END)`;

async function loadCandidates(db: Db, ff: FfTranscript): Promise<MeetingCandidate[]> {
  const cal = normalizeEventId(ff.calId);
  const code = meetCode(ff.meetingLink);
  const near = ff.startedAt
    ? sql`${BOOKED_START} BETWEEN ${new Date(ff.startedAt.getTime() - 24 * 3_600_000).toISOString()}::timestamp AND ${new Date(ff.startedAt.getTime() + 24 * 3_600_000).toISOString()}::timestamp`
    : sql`false`;
  const by = [near, ...(cal ? [sql`lower(${schema.interviews.calendarEventId}) = ${cal}`] : []), ...(code ? [sql`${schema.interviews.meetingLink} ILIKE ${`%${code}%`}`] : [])];
  const rows = await db
    .select({ id: schema.interviews.id, calendarEventId: schema.interviews.calendarEventId, meetingLink: schema.interviews.meetingLink, slotStart: sql<Date | null>`${BOOKED_START}`.mapWith(schema.interviews.slot1) })
    .from(schema.interviews)
    .where(and(inArray(schema.interviews.status, ["scheduled", "completed"]), or(...by)))
    .limit(200);
  return rows.map((r) => ({
    interviewId: r.id,
    calendarEventId: r.calendarEventId,
    meetingLink: r.meetingLink,
    slotStart: r.slotStart ?? null,
    eventTitle: `Findtern meeting ${r.id.slice(0, 8)}`,
  }));
}

export type ProcessResult = "ready" | "retry" | "failed" | "skipped";

/** Claims, fetches, matches, flags and stores one queued transcript. Never throws. */
export async function processTranscript(firefliesId: string, client: FirefliesClient | null = getFireflies(), now: Date = new Date()): Promise<ProcessResult> {
  try {
    if (!client) return "skipped"; // FIREFLIES_API_KEY not set: the row waits
    const db = getDb();
    const [claim] = await db
      .update(t)
      .set({ attempts: sql`${t.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + 10 * 60_000), updatedAt: now })
      .where(and(eq(t.firefliesId, firefliesId), eq(t.status, "queued"), lte(t.nextAttemptAt, now)))
      .returning({ id: t.id, attempts: t.attempts, fetchedAt: t.fetchedAt });
    if (!claim) return "skipped";

    let ff: FfTranscript | null;
    try {
      ff = await client.getTranscript(firefliesId);
      if (!ff) throw new FirefliesError("Fireflies has no transcript with this id yet", true);
    } catch (e) {
      const err = e instanceof FirefliesError ? e : new FirefliesError("Unexpected error reading the transcript", true);
      const plan = planFailure(claim.attempts, err.retryable, err.retryAfterMs, now);
      await db.update(t).set({ status: plan.status, nextAttemptAt: plan.nextAttemptAt ?? now, lastError: err.message.slice(0, 300), updatedAt: now }).where(eq(t.id, claim.id));
      console.error("[transcripts] fetch failed", firefliesId, err.message);
      return plan.status === "failed" ? "failed" : "retry";
    }

    // A re-fetch of an already stored transcript (late summary) only fills the summary: never re-matches or resets a review.
    if (claim.fetchedAt) {
      await db.update(t).set({ status: "ready", summary: ff.summary, lastError: null, updatedAt: now }).where(eq(t.id, claim.id));
      return "ready";
    }

    const candidates = await loadCandidates(db, ff);
    const taken = candidates.length ? await db.select({ id: t.interviewId }).from(t).where(and(isNotNull(t.interviewId), inArray(t.interviewId, candidates.map((c) => c.interviewId)))) : [];
    const match = matchTranscript(ff, candidates, new Set(taken.map((r) => r.id as string)));
    const flags = flagTranscript(ff.lines);
    const exp = expiries(now, flags);
    const base = {
      status: "ready",
      title: ff.title,
      startedAt: ff.startedAt,
      durationMin: ff.durationMin,
      sourceUrl: ff.sourceUrl,
      summary: ff.summary,
      transcript: ff.lines,
      flags,
      flagsCount: flags.length,
      maxSeverity: maxSeverity(flags),
      fetchedAt: now,
      textExpiresAt: exp.textExpiresAt,
      evidenceExpiresAt: exp.evidenceExpiresAt,
      lastError: null,
      updatedAt: now,
    };
    const fields = (m: typeof match) => ({
      ...base,
      interviewId: m.interviewId,
      matchMethod: "method" in m ? m.method : null,
      matchNote: "note" in m ? m.note : null,
      // Only a transcript tied to a meeting can be actioned; an unmatched one is shown in its own bucket for an admin to read.
      reviewState: "method" in m && flags.length > 0 ? "open" : "clean",
    });
    try {
      await db.update(t).set(fields(match)).where(eq(t.id, claim.id));
    } catch (e) {
      if ((e as { code?: string }).code !== "23505" || !match.interviewId) throw e;
      await db.update(t).set(fields({ interviewId: null, note: "duplicate_meeting" })).where(eq(t.id, claim.id)); // lost a race for the same meeting
    }
    return "ready";
  } catch (e) {
    console.error("[transcripts] process failed", firefliesId, e instanceof Error ? e.message : "error");
    return "retry";
  }
}

const drizzlePurge: PurgeStore = {
  async purgeText(now, limit) {
    const db = getDb();
    const ids = await db.select({ id: t.id }).from(t).where(and(lte(t.textExpiresAt, now), isNull(t.textPurgedAt))).orderBy(asc(t.textExpiresAt)).limit(limit);
    if (!ids.length) return 0;
    const done = await db.update(t).set({ transcript: null, summary: null, textPurgedAt: now, updatedAt: now }).where(and(inArray(t.id, ids.map((r) => r.id)), isNull(t.textPurgedAt))).returning({ id: t.id });
    return done.length;
  },
  async purgeEvidence(now, limit) {
    const db = getDb();
    const ids = await db.select({ id: t.id }).from(t).where(and(lte(t.evidenceExpiresAt, now), isNull(t.evidencePurgedAt))).orderBy(asc(t.evidenceExpiresAt)).limit(limit);
    if (!ids.length) return 0;
    const done = await db.update(t).set({ flags: null, evidencePurgedAt: now, updatedAt: now }).where(and(inArray(t.id, ids.map((r) => r.id)), isNull(t.evidencePurgedAt))).returning({ id: t.id });
    return done.length;
  },
};

export const purgeTranscripts = (now: Date = new Date(), batch = PURGE_BATCH): Promise<PurgeCounts> => purgeExpired(drizzlePurge, now, batch);

export type SweepResult = { processed: number; polled: number; purged: PurgeCounts | null };

/**
 * One idempotent pass: (1) fetch due queued transcripts, (2) the polling fallback (a webhook that never arrived): list recent
 * transcripts and queue the unknown ones, (3) purge expired text and evidence. Each part is isolated: nothing here throws.
 * `poll` is true about once an hour (Fireflies API calls are rate limited).
 */
export async function sweepTranscripts(opts: { now?: Date; poll?: boolean; client?: FirefliesClient | null } = {}): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const client = opts.client === undefined ? getFireflies() : opts.client;
  const out: SweepResult = { processed: 0, polled: 0, purged: null };
  try {
    if (client && opts.poll) {
      try {
        for (const m of await client.listRecent(new Date(now.getTime() - 3 * 86_400_000), 50)) if (await enqueueTranscript(m.id)) out.polled++;
      } catch (e) {
        console.error("[transcripts] poll failed", e instanceof Error ? e.message : "error");
      }
    }
    const due = await getDb().select({ id: t.firefliesId }).from(t).where(and(eq(t.status, "queued"), lte(t.nextAttemptAt, now))).orderBy(asc(t.nextAttemptAt)).limit(10);
    for (const r of due) if ((await processTranscript(r.id, client, now)) === "ready") out.processed++;
  } catch (e) {
    console.error("[transcripts] sweep failed", e instanceof Error ? e.message : "error");
  }
  try {
    out.purged = await purgeTranscripts(now);
  } catch (e) {
    console.error("[transcripts] purge failed", e instanceof Error ? e.message : "error");
  }
  return out;
}
