import { and, asc, inArray, lte } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { purgeExpiredRosterImports, type RosterPurgeResult, type RosterPurgeStore } from "./roster-import-retention";

/** The audit trail needs an actor; a cron has no admin, so it writes under this fixed id. */
export const ROSTER_PURGE_ACTOR = "system:roster-import-purge";

function drizzleStore(): RosterPurgeStore {
  const t = schema.collegeRosterImports;
  return {
    transaction: (fn) =>
      getDb().transaction((tx) =>
        fn({
          async lockExpiredIds(now, limit) {
            const rows = await tx
              .select({ id: t.id })
              .from(t)
              .where(lte(t.expiresAt, now))
              .orderBy(asc(t.expiresAt))
              .limit(limit)
              // A concurrent purge skips what this one holds instead of waiting or double-deleting.
              .for("update", { skipLocked: true });
            return rows.map((r) => r.id);
          },
          async deleteIds(ids, now) {
            const gone = await tx.delete(t).where(and(inArray(t.id, ids), lte(t.expiresAt, now))).returning({ id: t.id });
            return gone.length;
          },
          // strict: the deletion rolls back if its audit row cannot be written.
          audit: (meta) =>
            recordAdminAudit(tx, { adminId: ROSTER_PURGE_ACTOR, action: "roster_import.purge", targetType: "college_roster_imports", meta }, { strict: true }),
        }),
      ),
  };
}

export function purgeRosterImports(opts: { now?: Date; batch?: number } = {}): Promise<RosterPurgeResult> {
  return purgeExpiredRosterImports(drizzleStore(), opts);
}
