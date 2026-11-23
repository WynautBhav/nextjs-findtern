import { sql, type SQL } from "drizzle-orm";

/**
 * Join condition that keeps only a user's NEWEST intern_onboarding row (same order as intern-data.ts: created_at desc).
 * Some users hold several rows (historic double saves); a plain `LEFT JOIN intern_onboarding ON user_id = ...` lists
 * such a user once per row and inflates every count. AND it onto the join: `ON o.user_id = u.id AND <this>`.
 * `alias` is the join's name for the table (default: the table itself).
 */
export function isNewestOnboarding(alias = "intern_onboarding"): SQL {
  const a = sql.identifier(alias);
  return sql`${a}."id" = (SELECT "n"."id" FROM "intern_onboarding" "n" WHERE "n"."user_id" = ${a}."user_id" ORDER BY "n"."created_at" DESC NULLS LAST, "n"."id" DESC LIMIT 1)`;
}
