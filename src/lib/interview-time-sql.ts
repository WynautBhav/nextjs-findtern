import { sql, type SQL } from "drizzle-orm";

import { MEETING_MINUTES } from "./interview-lifecycle.ts";

/**
 * SQL twin of `interviewExpiredNow` (interview-lifecycle.ts) for table alias `t`: a picked slot ended, or an unpicked invite's
 * every slot has started (or its respond-by passed). The sweep (interview-expiry-db.ts) and the college counts both read it,
 * so a meeting whose time passed is counted the same everywhere. `nowIso` is a UTC instant; the columns are UTC `timestamp`s.
 * Relative imports only: the node tests load this file directly.
 */
export const timePassed = (t: string, nowIso: string): SQL => {
  const col = (c: string) => sql.raw(`${t}.${c}`);
  const mins = sql.raw(String(MEETING_MINUTES));
  const chosen = sql`(case ${col("selected_slot")} when 1 then ${col("slot1")} when 2 then ${col("slot2")} when 3 then ${col("slot3")} end)`;
  const last = sql`greatest(${col("slot1")}, ${col("slot2")}, ${col("slot3")})`;
  return sql`(
    (${chosen} is not null and ${chosen} + make_interval(mins => ${mins}) <= ${nowIso}::timestamp)
    or (${chosen} is null and ${last} is not null and ${last} < ${nowIso}::timestamp)
    or (${chosen} is null and ${col("respond_by")} is not null and ${col("respond_by")} <= ${nowIso}::timestamp and ${col("status")} in ('pending', 'waiting', 'proposed')))`;
};
