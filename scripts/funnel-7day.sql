-- 7-day intern funnel, one row per signup week plus a total row.  READ-ONLY: a single SELECT, no writes.
--
-- Run it against a READ REPLICA or a local copy, never write-capable credentials:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/funnel-7day.sql
-- Output is counts only (no names, emails or ids), so it is safe to paste into a report.
--
-- Change the start date in `params` to move the window. Only interns who signed up at least 7 days ago
-- are counted, so every row has had a full 7 days to reach each stage (no half-finished cohorts).
--
-- Each stage is counted on its own: "did this intern reach the stage within 7 days of signing up".
-- It is not a strict chain (an intern can be hired without a paid activation row, for instance), so
-- read the columns as separate rates against `signups`, not as "% of the previous step".
--
-- Stage          | where it lives (confirmed in code)                                         | 7-day timestamp
-- signup         | users.created_at, users.role = 'intern'      (src/lib/db/schema.ts:6)      | yes
-- profile done   | intern_onboarding.extra_data->>'profileSubmittedAt', set once by the final   | yes (ISO string in JSON)
--                |   "Complete & Submit" (src/app/api/intern/onboarding/route.ts:373)
--                |   NOTE: admin also re-validates the fields (src/lib/admin/profile-state.ts);
--                |   this counts "submitted", which is what the intern controls.
-- activated      | intern_payments.status = 'paid' and paid_at (promo, free and admin-marked   | yes
--                |   rows included; src/lib/fee-paid-sql.ts). Old accounts can instead carry
--                |   extra_data.payment.isPaid = 'true' with NO date and NO payment row; they
--                |   cannot be placed in a window, so they are shown in `activated_legacy_undated`.
-- scored         | NO score timestamp column exists. PROXY: the one-time in-app notification    | proxy
--                |   type 'ai_interview_scores_live' (notifications.created_at), written when
--                |   the first live score lands (src/lib/admin/score-live.ts). It is best-effort
--                |   in code, so this can undercount; the rated score itself lives undated in
--                |   intern_onboarding.extra_data->>'findternScore'.
-- hired          | proposals.hired_at (src/lib/db/schema.ts:793), first one per intern          | yes
--                |   (a hire that ended early still counts; endedAt is not checked).
--
-- Timestamps: users.created_at, paid_at, hired_at and notifications.created_at are `timestamp without time zone`
-- holding UTC (the app pins its sessions to UTC). profileSubmittedAt is an ISO string with a trailing Z, so it
-- is converted to UTC the same way before comparing.

WITH params AS (
  SELECT DATE '2026-10-01' AS since          -- edit me
),
cohort AS (
  SELECT u.id,
         u.created_at                            AS signed_up_at,
         date_trunc('week', u.created_at)::date  AS cohort_week
    FROM users u, params p
   WHERE u.role = 'intern'
     AND u.created_at >= p.since
     AND u.created_at <= (now() AT TIME ZONE 'UTC') - interval '7 days'
),
profile_done AS (
  SELECT o.user_id,
         min((o.extra_data->>'profileSubmittedAt')::timestamptz AT TIME ZONE 'UTC') AS at
    FROM intern_onboarding o
   WHERE o.extra_data->>'profileSubmittedAt' ~ '^\d{4}-\d{2}-\d{2}T'   -- skip any malformed legacy value
   GROUP BY o.user_id
),
activated AS (
  SELECT p.intern_id AS user_id, min(p.paid_at) AS at
    FROM intern_payments p
   WHERE p.status = 'paid' AND p.paid_at IS NOT NULL
   GROUP BY p.intern_id
),
activated_legacy AS (
  SELECT DISTINCT o.user_id
    FROM intern_onboarding o
   WHERE o.extra_data->'payment'->>'isPaid' = 'true'
     AND NOT EXISTS (SELECT 1 FROM intern_payments p WHERE p.intern_id = o.user_id AND p.status = 'paid')
),
scored AS (
  SELECT n.recipient_id AS user_id, min(n.created_at) AS at
    FROM notifications n
   WHERE n.recipient_type = 'intern' AND n.type = 'ai_interview_scores_live'
   GROUP BY n.recipient_id
),
hired AS (
  SELECT pr.intern_id AS user_id, min(pr.hired_at) AS at
    FROM proposals pr
   WHERE pr.hired_at IS NOT NULL
   GROUP BY pr.intern_id
)
SELECT coalesce(c.cohort_week::text, 'ALL')                                                     AS signup_week,
       count(*)                                                                                  AS signups,
       count(*) FILTER (WHERE pd.at <= c.signed_up_at + interval '7 days')                       AS profile_done_7d,
       count(*) FILTER (WHERE a.at  <= c.signed_up_at + interval '7 days')                       AS activated_7d,
       count(*) FILTER (WHERE s.at  <= c.signed_up_at + interval '7 days')                       AS scored_7d_proxy,
       count(*) FILTER (WHERE h.at  <= c.signed_up_at + interval '7 days')                       AS hired_7d,
       round(100.0 * count(*) FILTER (WHERE pd.at <= c.signed_up_at + interval '7 days') / count(*), 1) AS profile_done_pct,
       round(100.0 * count(*) FILTER (WHERE a.at  <= c.signed_up_at + interval '7 days') / count(*), 1) AS activated_pct,
       round(100.0 * count(*) FILTER (WHERE s.at  <= c.signed_up_at + interval '7 days') / count(*), 1) AS scored_pct,
       round(100.0 * count(*) FILTER (WHERE h.at  <= c.signed_up_at + interval '7 days') / count(*), 1) AS hired_pct,
       count(*) FILTER (WHERE al.user_id IS NOT NULL)                                            AS activated_legacy_undated
  FROM cohort c
  LEFT JOIN profile_done      pd ON pd.user_id = c.id
  LEFT JOIN activated         a  ON a.user_id  = c.id
  LEFT JOIN activated_legacy  al ON al.user_id = c.id
  LEFT JOIN scored            s  ON s.user_id  = c.id
  LEFT JOIN hired             h  ON h.user_id  = c.id
 GROUP BY ROLLUP (c.cohort_week)
 ORDER BY c.cohort_week NULLS LAST;
