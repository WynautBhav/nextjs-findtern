import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import type { internOnboarding, users } from "../db/schema.ts";

/**
 * An intern can hold several `intern_onboarding` rows (a double submit). Everything that decides what the intern IS
 * (the hire gate, profile-complete, the admin list) reads the newest by `created_at`, so a join to the table must keep
 * only that row, or the intern is listed once per row.
 */
export function latestOnboardingJoin(o: typeof internOnboarding, userId: typeof users.id): SQL {
  return and(
    eq(o.userId, userId),
    sql`${o.id} = (SELECT x.id FROM intern_onboarding x WHERE x.user_id = ${userId} ORDER BY x.created_at DESC, x.id DESC LIMIT 1)`,
  ) as SQL;
}

/** The ORDER BY that picks the same row when a route reads one onboarding row for one user. */
export const latestOnboardingOrder = (o: typeof internOnboarding) => [desc(o.createdAt), desc(o.id)] as const;
