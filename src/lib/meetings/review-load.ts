import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { NO_RECORDING_AFTER_HOURS, isFlagCode, type Flag, type ReviewFilter, type ReviewKind, type ReviewParty, type ReviewRowView, type ReviewState, type TranscriptLine } from "./review-types";
import { MEETING_MS } from "./slots";
import { MATCH_NOTE_TEXT } from "./transcript-match";

/** Admin-only reads for the Meeting reviews queue. Nothing here is imported by an employer, intern or college route. */

type Db = ReturnType<typeof getDb>;
const t = schema.meetingTranscripts;
const iv = schema.interviews;
const BOOKED_START_RAW = sql`(CASE ${iv.selectedSlot} WHEN 1 THEN ${iv.slot1} WHEN 2 THEN ${iv.slot2} WHEN 3 THEN ${iv.slot3} END)`;
/** The booked slot as a Date (mapWith decodes the raw timestamp the way Drizzle does for the column). */
const BOOKED_START = BOOKED_START_RAW.mapWith(iv.slot1);
const NO_REC_LOOKBACK_DAYS = 14;

type PartyMaps = { employers: Map<string, ReviewParty>; interns: Map<string, ReviewParty> };

/** Names (admin-only), confirmed violations (warnings + freezes) and frozen state for the parties of a batch of meetings. */
async function loadParties(db: Db, employerIds: string[], internIds: string[]): Promise<PartyMaps> {
  const out: PartyMaps = { employers: new Map(), interns: new Map() };
  const [emps, users] = await Promise.all([
    employerIds.length ? db.select({ id: schema.employers.id, name: schema.employers.name, company: schema.employers.companyName, frozenAt: schema.employers.frozenAt }).from(schema.employers).where(inArray(schema.employers.id, employerIds)) : [],
    internIds.length ? db.select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName, frozenAt: schema.users.frozenAt }).from(schema.users).where(inArray(schema.users.id, internIds)) : [],
  ]);
  const ids = [...employerIds, ...internIds];
  const strikes = ids.length
    ? await db
        .select({ type: schema.accountStrikes.userType, id: schema.accountStrikes.userId, n: sql<number>`count(*)::int` })
        .from(schema.accountStrikes)
        .where(and(inArray(schema.accountStrikes.userId, ids), inArray(schema.accountStrikes.kind, ["warning", "freeze"])))
        .groupBy(schema.accountStrikes.userType, schema.accountStrikes.userId)
    : [];
  const count = (type: string, id: string) => strikes.find((s) => s.type === type && s.id === id)?.n ?? 0;
  for (const e of emps) out.employers.set(e.id, { type: "employer", id: e.id, name: [e.company, e.name].filter(Boolean).join(" / ") || "Employer", violations: count("employer", e.id), frozen: Boolean(e.frozenAt) });
  for (const u of users) out.interns.set(u.id, { type: "intern", id: u.id, name: [u.first, u.last].filter(Boolean).join(" ") || "Candidate", violations: count("intern", u.id), frozen: Boolean(u.frozenAt) });
  return out;
}

type TranscriptRow = {
  id: string; firefliesId: string; interviewId: string | null; matchMethod: string | null; matchNote: string | null; status: string; attempts: number; lastError: string | null;
  title: string | null; startedAt: Date | null; durationMin: number | null; sourceUrl: string | null; summary: string | null; flags: Flag[] | null; flagsCount: number; maxSeverity: string | null;
  reviewState: string; reviewParty: string | null; reviewedBy: string | null; reviewedAt: Date | null; reviewNote: string | null; receivedAt: Date;
  textPurgedAt: Date | null; evidencePurgedAt: Date | null;
  employerId: string | null; internId: string | null; projectId: string | null; slotStart: Date | null;
};

const LIST_COLS = {
  id: t.id, firefliesId: t.firefliesId, interviewId: t.interviewId, matchMethod: t.matchMethod, matchNote: t.matchNote, status: t.status, attempts: t.attempts, lastError: t.lastError,
  title: t.title, startedAt: t.startedAt, durationMin: t.durationMin, sourceUrl: t.sourceUrl, summary: t.summary, flags: t.flags, flagsCount: t.flagsCount, maxSeverity: t.maxSeverity,
  reviewState: t.reviewState, reviewParty: t.reviewParty, reviewedBy: t.reviewedBy, reviewedAt: t.reviewedAt, reviewNote: t.reviewNote, receivedAt: t.receivedAt,
  textPurgedAt: t.textPurgedAt, evidencePurgedAt: t.evidencePurgedAt,
  employerId: iv.employerId, internId: iv.internId, projectId: iv.projectId, slotStart: BOOKED_START,
};

const validFlags = (v: unknown): Flag[] => (Array.isArray(v) ? (v as Flag[]).filter((f) => f && isFlagCode(f.rule)) : []);

async function adminNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const m = new Map<string, string>();
  if (!want.length) return m;
  for (const a of await db.select({ id: schema.admins.id, name: schema.admins.name, email: schema.admins.email }).from(schema.admins).where(inArray(schema.admins.id, want))) m.set(a.id, a.name?.trim() || a.email);
  return m;
}

async function projectNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const m = new Map<string, string>();
  if (!want.length) return m;
  for (const p of await db.select({ id: schema.projects.id, name: schema.projects.projectName }).from(schema.projects).where(inArray(schema.projects.id, want))) m.set(p.id, p.name);
  return m;
}

function kindOf(r: TranscriptRow): ReviewKind {
  if (r.status === "queued") return "pending_fetch";
  if (r.status === "failed") return "fetch_failed";
  return r.interviewId ? "reviewed" : "unmatched";
}

function toView(r: TranscriptRow, parties: PartyMaps, projects: Map<string, string>, admins: Map<string, string>): ReviewRowView {
  const flags = validFlags(r.flags);
  return {
    key: r.id,
    kind: kindOf(r),
    transcriptId: r.id,
    meetingId: r.interviewId,
    title: r.title ?? "Untitled recording",
    meetingAt: (r.slotStart ?? r.startedAt)?.toISOString() ?? null,
    durationMin: r.durationMin,
    employer: r.employerId ? (parties.employers.get(r.employerId) ?? null) : null,
    intern: r.internId ? (parties.interns.get(r.internId) ?? null) : null,
    project: r.projectId ? (projects.get(r.projectId) ?? null) : null,
    state: (r.reviewState as ReviewState) ?? "clean",
    flagsCount: r.flagsCount,
    maxSeverity: (r.maxSeverity as ReviewRowView["maxSeverity"]) ?? null,
    summary: r.textPurgedAt ? null : r.summary,
    flags,
    textPurged: Boolean(r.textPurgedAt),
    evidencePurged: Boolean(r.evidencePurgedAt),
    matchMethod: (r.matchMethod as ReviewRowView["matchMethod"]) ?? null,
    matchNote: r.matchNote && r.matchNote in MATCH_NOTE_TEXT ? MATCH_NOTE_TEXT[r.matchNote as keyof typeof MATCH_NOTE_TEXT] : r.matchNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByName: r.reviewedBy ? (admins.get(r.reviewedBy) ?? null) : null,
    reviewNote: r.reviewNote,
    reviewParty: (r.reviewParty as ReviewRowView["reviewParty"]) ?? null,
    lastError: r.lastError,
    attempts: r.attempts,
    sourceUrl: r.sourceUrl,
  };
}

async function hydrate(db: Db, rows: TranscriptRow[]): Promise<ReviewRowView[]> {
  const [parties, projects, admins] = await Promise.all([
    loadParties(db, rows.map((r) => r.employerId).filter((v): v is string => Boolean(v)), rows.map((r) => r.internId).filter((v): v is string => Boolean(v))),
    projectNames(db, rows.map((r) => r.projectId)),
    adminNames(db, rows.map((r) => r.reviewedBy)),
  ]);
  return rows.map((r) => toView(r, parties, projects, admins));
}

/** Confirmed meetings that ended more than NO_RECORDING_AFTER_HOURS ago with a Meet booked and no transcript row at all. */
async function loadNoRecording(db: Db, now: Date): Promise<ReviewRowView[]> {
  const endedBy = new Date(now.getTime() - NO_RECORDING_AFTER_HOURS * 3_600_000 - MEETING_MS);
  const since = new Date(now.getTime() - NO_REC_LOOKBACK_DAYS * 86_400_000);
  const rows = await db
    .select({ id: iv.id, employerId: iv.employerId, internId: iv.internId, projectId: iv.projectId, slotStart: BOOKED_START })
    .from(iv)
    .leftJoin(t, eq(t.interviewId, iv.id))
    .where(and(inArray(iv.status, ["scheduled", "completed"]), isNotNull(iv.calendarEventId), isNull(t.id), sql`${BOOKED_START} <= ${endedBy.toISOString()}::timestamp`, sql`${BOOKED_START} >= ${since.toISOString()}::timestamp`))
    .orderBy(desc(BOOKED_START))
    .limit(100);
  const [parties, projects] = await Promise.all([loadParties(db, rows.map((r) => r.employerId), rows.map((r) => r.internId)), projectNames(db, rows.map((r) => r.projectId))]);
  return rows.map((r) => ({
    key: `iv:${r.id}`, kind: "no_recording", transcriptId: null, meetingId: r.id, title: `Findtern meeting ${r.id.slice(0, 8)}`, meetingAt: r.slotStart ? r.slotStart.toISOString() : null,
    durationMin: null, employer: parties.employers.get(r.employerId) ?? null, intern: parties.interns.get(r.internId) ?? null, project: r.projectId ? (projects.get(r.projectId) ?? null) : null,
    state: "clean", flagsCount: 0, maxSeverity: null, summary: null, flags: [], textPurged: false, evidencePurged: false, matchMethod: null, matchNote: null, reviewedAt: null, reviewedByName: null,
    reviewNote: null, reviewParty: null, lastError: null, attempts: 0, sourceUrl: null,
  }));
}

const base = (db: Db) => db.select(LIST_COLS).from(t).leftJoin(iv, eq(iv.id, t.interviewId));

export async function loadReviewQueue(filter: ReviewFilter, now: Date = new Date()): Promise<{ rows: ReviewRowView[]; counts: Record<ReviewFilter, number> }> {
  const db = getDb();
  const [open, all, unmatched, failed, noRec] = await Promise.all([
    base(db).where(and(eq(t.status, "ready"), eq(t.reviewState, "open"))).orderBy(desc(t.receivedAt)).limit(200),
    base(db).where(or(isNotNull(t.interviewId), ne(t.status, "ready"))).orderBy(desc(t.receivedAt)).limit(200),
    base(db).where(and(eq(t.status, "ready"), isNull(t.interviewId))).orderBy(desc(t.receivedAt)).limit(200),
    base(db).where(eq(t.status, "failed")).orderBy(desc(t.receivedAt)).limit(100),
    loadNoRecording(db, now),
  ]);
  const pick = filter === "open" ? open : filter === "unmatched" ? unmatched : filter === "no_recording" ? failed : all;
  const views = await hydrate(db, pick as TranscriptRow[]);
  const rows = filter === "no_recording" ? [...noRec, ...views] : views;
  return { rows, counts: { open: open.length, all: all.length + noRec.length, unmatched: unmatched.length, no_recording: noRec.length + failed.length } };
}

/** Sidebar badge: transcripts waiting for an admin. */
export async function pendingMeetingReviewsCount(): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(t).where(and(eq(t.status, "ready"), eq(t.reviewState, "open")));
  return r?.n ?? 0;
}

/** One transcript with its full text. Every call writes an audit row (`meeting.transcript_view`): the text is sensitive. */
export async function loadReviewDetail(id: string, adminId: string): Promise<{ row: ReviewRowView; lines: TranscriptLine[] | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const [r] = await db.select({ ...LIST_COLS, transcript: t.transcript }).from(t).leftJoin(iv, eq(iv.id, t.interviewId)).where(eq(t.id, id)).limit(1);
  if (!r) return null;
  await recordAdminAudit(db, { adminId, action: "meeting.transcript_view", targetType: "meeting_transcript", targetId: r.id, meta: { transcriptId: r.id, interviewId: r.interviewId } });
  const [row] = await hydrate(db, [r as TranscriptRow]);
  const lines = r.textPurgedAt || !Array.isArray(r.transcript) ? null : (r.transcript as TranscriptLine[]);
  return { row, lines };
}
