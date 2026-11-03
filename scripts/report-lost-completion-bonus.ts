/**
 * READ-ONLY report: interns who may have lost a completion bonus.
 *
 * Before the "applied" counter existed, a bonus granted while the intern had
 * no score was never added when their first score arrived. Those interns have
 * `extra_data.completionBonusCount > 0`, no `completionBonusApplied`, and a
 * proposal whose `completion_bonus_at` is EARLIER than their first score
 * evidence (the `ai_interview_scores_live:<id>` notification, sent once when a
 * score first goes live).
 *
 * This script only SELECTs (inside a READ ONLY transaction) and prints. It
 * repairs nothing: fixing a score is a decision for the admin, per intern.
 *
 * Usage: DATABASE_URL=postgresql://... node --experimental-strip-types scripts/report-lost-completion-bonus.ts
 */
import pg from "pg";

const QUERY = `
  SELECT u.id                                   AS intern_id,
         u.email                                AS email,
         (o.extra_data->>'completionBonusCount')::int AS bonus_count,
         o.extra_data->>'findternScore'         AS score,
         p.id                                   AS proposal_id,
         p.completion_bonus_at                  AS bonus_at,
         n.created_at                           AS first_score_at
    FROM intern_onboarding o
    JOIN users u ON u.id = o.user_id
    JOIN proposals p ON p.intern_id = o.user_id AND p.completion_bonus_at IS NOT NULL
    JOIN LATERAL (
           SELECT min(created_at) AS created_at
             FROM notifications
            WHERE recipient_type = 'intern'
              AND recipient_id = o.user_id
              AND dedupe_key = 'ai_interview_scores_live:' || o.user_id
         ) n ON n.created_at IS NOT NULL
   WHERE (o.extra_data->>'completionBonusCount') ~ '^[0-9]+$'
     AND (o.extra_data->>'completionBonusCount')::int > 0
     AND NOT (o.extra_data ? 'completionBonusApplied')
     AND p.completion_bonus_at < n.created_at
   ORDER BY u.email, p.completion_bonus_at
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(QUERY);
    await client.query("ROLLBACK");
    if (rows.length === 0) {
      console.log("No interns match.");
      return;
    }
    console.log(`${rows.length} bonus grant(s) earlier than the intern's first score:\n`);
    for (const r of rows) {
      console.log(
        [r.email, `bonuses=${r.bonus_count}`, `score=${r.score ?? "-"}`, `proposal=${r.proposal_id}`, `bonus_at=${new Date(r.bonus_at).toISOString()}`, `first_score_at=${new Date(r.first_score_at).toISOString()}`].join("  "),
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
