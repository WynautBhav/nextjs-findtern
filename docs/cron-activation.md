# Cron activation checklist (Vercel)

Applies to `/api/cron/refund-reconcile` and `/api/cron/email-outbox` (the outbox cron is **not registered in `vercel.json` yet**, see the last section). Do not start until Razorpay is ready and the staging run below is clean.

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

1. Check Vercel > Settings > Cron Jobs for the plan's cron limit. Three jobs are registered: payment-reminders (03:30 UTC), refund-reconcile (04:30) and roster-import-purge (04:15). Schedules are daily on purpose (valid on Hobby); on Pro you may change reconcile to `*/15 * * * *` in `vercel.json`.
2. refund-reconcile is OFF by default (`{skipped:true}` without `REFUND_RECONCILE=1`). roster-import-purge deletes expired roster imports and ignores `SCHEDULERS=off`.

## Turn on refund reconcile

1. Set `CRON_SECRET`, the two Razorpay keys, and leave `SCHEDULERS` unset. Leave `REFUND_RECONCILE` unset. Deploy.
2. Dry look: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/refund-reconcile` must return `{"skipped":true,"reason":"REFUND_RECONCILE is off"}`.
3. Set `REFUND_RECONCILE=1` and **redeploy**.
4. Run the same curl once by hand. Expect `{"skipped":false,"checked":N,...}`. Watch `payment_refunds` rows in `initiated` and Admin > Audit log (action "Refund status settled from Razorpay", actor "Automatic job"). Rows flagged for manual review (`raw->'reconcile'->>'flag'`, for example `amount_mismatch` including when Razorpay returns no amount) stay `initiated` and need a human.
5. First live run: watch it. Razorpay's response shape for `GET /v1/refunds/:id` and `GET /v1/payments/:id/refunds` comes from their docs and is untested live.

## Turn off

- Refund reconcile: **unset `REFUND_RECONCILE` and redeploy.** Not instant. Or remove the `vercel.json` entry and deploy.
- Email outbox (once registered): **set `OUTBOX_CRON=off` and redeploy.** Or remove the `vercel.json` entry and deploy.
- Everything: `SCHEDULERS=off` and redeploy (also stops payment-reminders).

## Follow-up: register the email outbox cron (not done in this landing)

The route (`/api/cron/email-outbox`), its drain loop and the `OUTBOX_CRON` switch are deployed, but the cron is **not in `vercel.json`**. With `MAIL_MODE` unset in production, `src/lib/mailer.ts` sends whenever SMTP is configured, so the first scheduled run could mail queued messages to demo/dummy students. Enable it only after confirming `MAIL_MODE` and SMTP on staging, and after a read-only count of `email_outbox` rows by status (anything `queued` or `failed` goes out on the first run; decide first: let it send, set `OUTBOX_CRON=off` for the first deploy, or mark the rows dead).

To enable, add this line to `crons` in `vercel.json` and deploy:

```json
{ "path": "/api/cron/email-outbox", "schedule": "0 4 * * *" }
```

Daily is the only Hobby-safe schedule (a more frequent one fails the deploy). On Pro use `*/5 * * * *` so retries (1 min, 5 min, 30 min, 2 h backoff) and new campaigns go out promptly. `src/lib/vercel-crons.test.ts` checks that every path in `vercel.json` has a route file and is daily.
