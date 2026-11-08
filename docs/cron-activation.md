# Cron activation checklist (Vercel)

Applies to `/api/cron/refund-reconcile` and `/api/cron/email-outbox`. Do not start until Razorpay is ready and the staging run below is clean.

**Env changes on Vercel only apply to a new deployment.** Setting or unsetting any variable here does nothing until you redeploy (Deployments > Redeploy, or push). That includes the switches that turn things *off*.

## Variables (Vercel Production)

| Variable | Needed for | Value |
|---|---|---|
| `CRON_SECRET` | every `/api/cron/*` route | long random string; Vercel Cron sends it as `Authorization: Bearer <secret>` |
| `REFUND_RECONCILE` | refund reconcile | exactly `1` to turn on; unset (default) = route answers `{skipped:true}`, no DB and no Razorpay call |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | refund reconcile | live keys; reconcile only does GETs |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook, not the cron | already required |
| `REFUND_RECONCILE_MIN_AGE_MINUTES` | optional | default 30, clamped 5 min .. 7 d |
| `OUTBOX_CRON` | email outbox | `off` = `/api/cron/email-outbox` answers `{skipped:true}`; unset or anything else = on (default) |
| `SCHEDULERS` | all crons | must not be `off` (`off` skips every cron route) |
| `MAIL_MODE` | outbox sending | a real mode; `log` sends nothing |
| `RAZORPAY_API_BASE` | never | do not set in production (ignored there) |

## Before the first deploy that carries the crons

1. Read-only count of production `email_outbox` rows by status. Anything `queued` or `failed` is sent on the first 04:00 UTC run, because this is the first time the outbox cron is scheduled. If there is a stale backlog, decide first: let it send, or set `OUTBOX_CRON=off` for the first deploy, or mark the rows dead.
2. Check Vercel > Settings > Cron Jobs for the plan's cron limit. Three jobs are registered (four once roster-import-purge is added). Schedules are daily on purpose (valid on Hobby); on Pro change them in `vercel.json` (outbox `*/5 * * * *`, reconcile `*/15 * * * *`).

## Turn on refund reconcile

1. Set `CRON_SECRET`, the two Razorpay keys, and leave `SCHEDULERS` unset. Leave `REFUND_RECONCILE` unset. Deploy.
2. Dry look: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/refund-reconcile` must return `{"skipped":true,"reason":"REFUND_RECONCILE is off"}`.
3. Set `REFUND_RECONCILE=1` and **redeploy**.
4. Run the same curl once by hand. Expect `{"skipped":false,"checked":N,...}`. Watch `payment_refunds` rows in `initiated` and Admin > Audit log (action "Refund status settled from Razorpay", actor "Automatic job"). Rows flagged for manual review (`raw->'reconcile'->>'flag'`, for example `amount_mismatch` including when Razorpay returns no amount) stay `initiated` and need a human.
5. First live run: watch it. Razorpay's response shape for `GET /v1/refunds/:id` and `GET /v1/payments/:id/refunds` comes from their docs and is untested live.

## Turn off

- Refund reconcile: **unset `REFUND_RECONCILE` and redeploy.** Not instant. Or remove the `vercel.json` entry and deploy.
- Email outbox: **set `OUTBOX_CRON=off` and redeploy.** Or remove the `vercel.json` entry and deploy.
- Everything: `SCHEDULERS=off` and redeploy (also stops payment-reminders).
