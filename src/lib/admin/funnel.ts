import { sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { realEmployerId } from "@/lib/admin/scope";
import { funnelSteps, type FunnelStage } from "@/lib/admin/dashboard";

/**
 * The hiring funnel, in one place. The dashboard and Reports each had their
 * own and they disagreed: Reports counted events (interviews, offers), so a
 * later step could be wider than the one before it (30 interviews, 44 offers),
 * while the dashboard counted people. Now there is one definition, people at
 * the furthest step they reached in the window, so a step can never exceed
 * the one above it. Reports shows it; the dashboard links there.
 */

export const FUNNEL_LABELS = ["Viewed by an employer", "Shortlisted", "Interviewed", "Sent an offer", "Hired (employer paid)"];

export async function hiringFunnel(since: Date | null, until: Date | null): Promise<FunnelStage[]> {
  const db = getDb();
  const win = (col: ReturnType<typeof sql>) =>
    sql`${since ? sql`${col} >= ${since}` : sql`true`} AND ${until ? sql`${col} < ${until}` : sql`true`}`;
  const rows = await db
    .execute<{ stage: number; value: number }>(
      sql`
      WITH ev AS (
        SELECT intern_id, 1 AS s FROM ${schema.profileViews}
         WHERE ${win(sql`created_at`)} AND ${realEmployerId(sql`employer_id`)}
        UNION ALL
        SELECT intern_id, 2 FROM ${schema.employerCartItems}
         WHERE ${win(sql`created_at`)} AND ${realEmployerId(sql`employer_id`)}
        UNION ALL
        SELECT intern_id, 3 FROM ${schema.interviews}
         WHERE ${win(sql`created_at`)} AND ${realEmployerId(sql`employer_id`)}
           AND lower(status) NOT IN ('cancelled', 'pending')
        UNION ALL
        SELECT intern_id, 4 FROM ${schema.proposals}
         WHERE ${win(sql`created_at`)} AND ${realEmployerId(sql`employer_id`)}
        UNION ALL
        SELECT intern_id, 5 FROM ${schema.proposals}
         WHERE lower(status) = 'hired' AND ${win(sql`coalesce(hired_at, updated_at)`)}
           AND ${realEmployerId(sql`employer_id`)}
      )
      SELECT s AS stage, count(*)::int AS value
        FROM (SELECT intern_id, max(s) AS s FROM ev GROUP BY intern_id) t
       GROUP BY s`,
    )
    .then((r) => r.rows);
  return funnelSteps(
    FUNNEL_LABELS,
    rows.map((r) => ({ stage: Number(r.stage), value: Number(r.value) })),
  );
}
