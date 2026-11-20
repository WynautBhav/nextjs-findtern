import { EVIDENCE_RETENTION_DAYS, TRANSCRIPT_RETENTION_DAYS, type Flag } from "./review-types.ts";

/**
 * Retention (Vaibhav's decision): transcript text and summary are kept 90 days; the flags (the evidence snippets) of a flagged
 * transcript 1 year; a transcript with no flags keeps nothing past the 90 days. Afterwards only minimal metadata stays on the row
 * (ids, counts, severity, review outcome, timestamps). Pure: no clock except what is passed in.
 */
const DAY = 86_400_000;

export function expiries(fetchedAt: Date, flags: readonly Flag[]): { textExpiresAt: Date; evidenceExpiresAt: Date } {
  const textExpiresAt = new Date(fetchedAt.getTime() + TRANSCRIPT_RETENTION_DAYS * DAY);
  const evidenceExpiresAt = flags.length > 0 ? new Date(fetchedAt.getTime() + EVIDENCE_RETENTION_DAYS * DAY) : textExpiresAt;
  return { textExpiresAt, evidenceExpiresAt };
}

export type PurgeCounts = { text: number; evidence: number };

/** What the purge needs from storage; the Drizzle adapter is in transcripts-db.ts, a fake in the tests. */
export interface PurgeStore {
  /** Nulls `transcript` and `summary` (sets text_purged_at) on rows with text_expires_at <= now and text not yet purged; returns the count. */
  purgeText(now: Date, limit: number): Promise<number>;
  /** Nulls `flags` (sets evidence_purged_at) on rows with evidence_expires_at <= now and evidence not yet purged; returns the count. */
  purgeEvidence(now: Date, limit: number): Promise<number>;
}

export const PURGE_BATCH = 500;

/** Idempotent: a second run with the same clock deletes nothing. Evidence never outlives the text it came from by less than the text (1 y >= 90 d). */
export async function purgeExpired(store: PurgeStore, now: Date, batch = PURGE_BATCH): Promise<PurgeCounts> {
  return { text: await store.purgeText(now, batch), evidence: await store.purgeEvidence(now, batch) };
}
