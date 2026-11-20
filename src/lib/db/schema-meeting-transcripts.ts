import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import type { Flag, TranscriptLine } from "../meetings/review-types.ts";

/**
 * Fireflies transcripts of Findtern meetings (migration 0045). ADMIN-ONLY: no employer/intern/college route reads this.
 * `interviewId` null = unmatched. `transcript` + `summary` are deleted after 90 days, `flags` after 1 year (src/lib/meetings/retention.ts).
 */
export const meetingTranscripts = pgTable("meeting_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firefliesId: text("fireflies_id").notNull(),
  interviewId: varchar("interview_id"),
  matchMethod: text("match_method"),
  matchNote: text("match_note"),
  status: text("status").notNull().default("queued"), // queued | ready | failed
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
  lastError: text("last_error"),
  title: text("title"),
  startedAt: timestamp("started_at"),
  durationMin: integer("duration_min"),
  sourceUrl: text("source_url"),
  summary: text("summary"),
  transcript: jsonb("transcript").$type<TranscriptLine[] | null>(),
  flags: jsonb("flags").$type<Flag[] | null>(),
  flagsCount: integer("flags_count").notNull().default(0),
  maxSeverity: text("max_severity"),
  reviewState: text("review_state").notNull().default("clean"), // open | clean | dismissed | warned | frozen
  reviewParty: text("review_party"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  strikeId: varchar("strike_id"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  fetchedAt: timestamp("fetched_at"),
  textExpiresAt: timestamp("text_expires_at"),
  evidenceExpiresAt: timestamp("evidence_expires_at"),
  textPurgedAt: timestamp("text_purged_at"),
  evidencePurgedAt: timestamp("evidence_purged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  statusCk: check("meeting_transcripts_status_check", sql`${t.status} IN ('queued','ready','failed')`),
  reviewStateCk: check("meeting_transcripts_review_state_check", sql`${t.reviewState} IN ('open','clean','dismissed','warned','frozen')`),
  firefliesUniq: uniqueIndex("meeting_transcripts_fireflies_uniq").on(t.firefliesId),
  interviewUniq: uniqueIndex("meeting_transcripts_interview_uniq").on(t.interviewId).where(sql`${t.interviewId} IS NOT NULL`),
  queueIdx: index("meeting_transcripts_queue_idx").on(t.status, t.nextAttemptAt).where(sql`${t.status} = 'queued'`),
  reviewIdx: index("meeting_transcripts_review_idx").on(t.reviewState, t.receivedAt),
}));

export type MeetingTranscript = typeof meetingTranscripts.$inferSelect;
