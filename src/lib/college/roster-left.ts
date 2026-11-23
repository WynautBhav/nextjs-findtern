import { sql, type SQL } from "drizzle-orm";

/**
 * True for a roster row whose student has LEFT this college (an ended membership here and no live one). Leavers vanish from every
 * count and list the officer sees, so "Not joined yet" and "On your list" skip them. Plain table names: no schema import, so it
 * runs under node:test.
 */
export function rosterRowLeftSql(rosterEmail: SQL, collegeId: string): SQL<boolean> {
  return sql<boolean>`(EXISTS (
      SELECT 1 FROM users lu JOIN college_memberships lm ON lm.user_id = lu.id
      WHERE lower(lu.email) = ${rosterEmail} AND lm.college_id = ${collegeId} AND lm.left_at IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM users lv JOIN college_memberships lk ON lk.user_id = lv.id
      WHERE lower(lv.email) = ${rosterEmail} AND lk.college_id = ${collegeId} AND lk.left_at IS NULL))`;
}
