// Retention rules for college_roster_imports. Pure: no DB, no clock unless passed.
// `rows` holds the whole uploaded file (names, emails, phones), so every import expires.

/** How long an uploaded roster is kept. Matches the column default in migration 0026. */
export const ROSTER_IMPORT_RETENTION_DAYS = 30;
/** Most rows one purge run deletes; the cron runs daily and the remainder goes next run. */
export const ROSTER_PURGE_BATCH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `expires_at` to write on a new roster import. */
export function rosterImportExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ROSTER_IMPORT_RETENTION_DAYS * DAY_MS);
}

export function isRosterImportExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** What a purge run needs from storage; the Drizzle adapter lives in roster-import-purge.ts. */
export interface RosterPurgeTx {
  /** Ids of imports whose expires_at <= now, oldest first, locked, at most `limit`. */
  lockExpiredIds(now: Date, limit: number): Promise<string[]>;
  /** Deletes those ids (only if still expired); returns how many were removed. */
  deleteIds(ids: string[], now: Date): Promise<number>;
  audit(meta: Record<string, unknown>): Promise<void>;
}
export interface RosterPurgeStore {
  transaction<T>(fn: (tx: RosterPurgeTx) => Promise<T>): Promise<T>;
}

export interface RosterPurgeResult {
  deleted: number;
  /** True when a full batch was removed, so more may be waiting for the next run. */
  more: boolean;
}

/**
 * Deletes expired roster imports (row, uploaded personal data and the file-hash unique key, so the
 * same file can be uploaded again) in one transaction, at most `batch` per run. Rerunning with
 * nothing expired deletes nothing and writes no audit row. The audit meta holds counts only, never
 * names, emails or phones.
 */
export async function purgeExpiredRosterImports(
  store: RosterPurgeStore,
  opts: { now?: Date; batch?: number } = {},
): Promise<RosterPurgeResult> {
  const now = opts.now ?? new Date();
  const batch = Math.max(1, Math.floor(opts.batch ?? ROSTER_PURGE_BATCH));
  return store.transaction(async (tx) => {
    const ids = await tx.lockExpiredIds(now, batch);
    if (ids.length === 0) return { deleted: 0, more: false };
    const deleted = await tx.deleteIds(ids, now);
    if (deleted > 0) await tx.audit({ deleted, batch, retentionDays: ROSTER_IMPORT_RETENTION_DAYS, expiredBefore: now.toISOString() });
    return { deleted, more: deleted >= batch };
  });
}
