import { sql } from "drizzle-orm";

import { getDb, hasDb } from "@/lib/db";

/**
 * How many interns are waiting for Findtern to check their CGPA: the admin nav badge. One read-only count over
 * `intern_onboarding.extra_data.cgpaVerification.status = 'pending'`. 0 on any error (no database, unreachable,
 * a failing query), so the admin layout never breaks on it.
 */
export async function pendingCgpaCount(): Promise<number> {
  if (!hasDb()) return 0;
  try {
    const res = await getDb().execute<{ value: number | string | null }>(
      sql`select count(*)::int as value from intern_onboarding where extra_data->'cgpaVerification'->>'status' = 'pending'`,
    );
    const n = Number(res.rows[0]?.value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
