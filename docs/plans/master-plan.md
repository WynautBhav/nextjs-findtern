# Findtern master plan: drives, per-student codes, refunds, realtime, Bio and skills, UX

Produced by `opus-planner` on 7 Nov 2026 (read-only; no checks were run). Status: **owner decisions recorded 7 Nov 2026; nothing here is built.**

## Owner decisions (7 Nov 2026)
1. **Fee:** configurable per drive; ₹800 is only the form default. (Overrides Q4.)
2. **Codes: REPLACE the college code.** Per-student drive codes become the only way a student is covered by a college. This overrides the planner's recommendation (B2, B3), which kept the college join code. Consequences to settle in Wave 1 before any code is written:
   - The per-college `promo_codes` row, the TPO "student code" shown on `/college`, `seat-paid.ts` cap raising, and the code-based join path are retired for new drives. Existing colleges with paid seat batches and students already joined by code keep their data read-only (history, wallet, invoices); nothing is deleted.
   - Students still join a college through the roster email match or the picker; a drive code only grants the entitlement.
   - A migration and cut-over rule is needed for colleges that already have paid seats (honour or convert the unused seats into a drive order). Money records are never altered.
   - Update `docs/college-partners/decisions.md` and `threat-model.md` (T5, T6 and the code-related threats) in the same change.
   - **Cut-over (owner, 7 Nov):** colleges with paid seats keep them as they are. Almost all will be used; any unused seats are credited against that college's next year's billing, so no seats are wasted. No conversion migration is needed. Build only a way for an admin to record a carried-over seat credit on the next drive order (a signed credit line, never an edit to old money rows).
3. **Identity:** a phone and name match only suggests a link to the admin; the student links by logging in and redeeming the code sent to the college inbox. No SMS verification for now.

Blockers found by the planner:
- `SEAT_PRICE_MINOR = 80000` is a fixed ₹800 price (`src/lib/college/money.ts:9`, owner answer Q4). The directive wants a configurable fee.
- One code per college is enforced by `promo_codes_college_id_unique` (`src/lib/db/schema.ts:903-912`). The directive wants one code per student.
- Phone verification does not exist (only `email_verified`, `schema.ts:11,72`), so rule 3.4(b) "verified phone" cannot be met as written.

## A. Findings

| # | Current state | Gap |
|---|---|---|
| 1 Bio | In `intern_onboarding.bio`, `onboarding.ts`, `api/intern/onboarding/route.ts` (~52, ~392), `lib/college/serialize.ts`, `employer/intern/[id]/page.tsx` (~436), candidate search `employer/candidates/page.tsx` (~296) | Remove from UI, employer serializers and search. Keep the column (legacy app shares the DB, T15) |
| 2 Posting | `projects.status` is free text, default `"active"` (`schema.ts:414`). APIs `api/employer/[id]/projects`, `api/employer/projects/[id]` | No draft, review, publish, pause, close state machine. Moderation queue not found (unverified) |
| 3 Realtime | `college_presence` + SSE stream, `notifications`, `push_subscriptions` | No messages table, no employer presence, no live channel |
| 4 Drives and money | `college_seat_batches`, fixed ₹800 in `money.ts`, `seat-paid.ts` raises the college code cap | Payment is per college, not per drive; no Failed/Refunded; price hard-coded |
| 5 Import | `lib/college/roster.ts`, `lib/xlsx.ts`, `admin/csv.ts` | No header mapping, preview, idempotent batch, allocation check |
| 6 Identity | `membership.ts`, `promo-membership.ts` | No phone verification, no match or review queue |
| 7 Codes | One `promo_codes` row per college; usages unique on (code, user) | No per-student code tied to a drive |
| 8 Email | `emails.ts`, `mailer.ts`, `college/mail.ts`; schedulers are in-process `setInterval`; PM2 single fork; `vercel.json` one daily cron | No outbox or campaign table |
| 9 Redemption | College code goes through the promo path against the activation fee | No drive entitlement; nothing stops paying twice |
| 10 TPO | `college/scope.ts`, `access.ts`, `guard.ts`; admin college page 68 lines | No drive funnel metrics; no admin global view |
| 11 Refunds | None | Everything |
| 12 Skills | Enforced in onboarding route (83, 88, 289); `MAX_SKILLS` redefined in `components/employer/skill-filter.tsx:27` | Not checked: AI interview config, admin edit, ratings import, legacy rows |
| 13 UX | Surface, Pill, ListRow, PageHead, tokens | Journey polish |
| 14 Tests | 1,044 unit tests plus e2e scripts | New scenarios |

## B. Decisions (planner's recommendation)

1. **Price configurable per drive** (conflicts with Q4). Store `college_drive_orders.fee_per_student_minor`; keep `SEAT_PRICE_MINOR` only as the form default. Owner must confirm.
2. **Codes:** keep the per-college code as the join code; add a new `drive_codes` table for per-student entitlement codes. Do not overload `promo_codes`. Freeze old seat-cap redemption for colleges with drive orders so money is never counted twice.
3. **Money model:** a drive order is the single paid unit. Each order creates exactly one `college_seat_batches` row (`drive_order_id`, unique). `capAfterPaid` must not run for drive-order batches. Wallet untouched.
4. **Entitlement:** `drive_entitlements`, one row per redeemed code. The fee waiver is a zero-amount `intern_payments` row (`gateway = 'college_drive'`, `amountMinor = 0`, `status = 'paid'`, `raw = {driveOrderId, codeId}`). Verify every reader of `status = 'paid'` (receivables, GST numbering) skips gateway `college_drive`; the student gets no invoice.
5. **Allocation in the database:** `issued_count`, `redeemed_count` with CHECK `issued_count <= slots`, `redeemed_count <= issued_count`; increment with a conditional UPDATE inside the transaction.
6. **T5 and no consent step (3 Nov):** redemption sets membership `verified`, `verifiedBy = 'drive_code'`. T6 is stale; document it. Under-18s stay blocked (T13).
7. **Identity without verified phone:** (a) college email equals the student's verified registered email: auto-link. (b) email differs: student logs in and redeems the code mailed to the college inbox, which proves control of that inbox. Phone plus name only creates an admin-review suggestion, never a link. No new accounts; never change `users.email`. Add phone OTP only if an SMS vendor is approved.
8. **Queue:** Postgres outbox `email_outbox`, claimed with `FOR UPDATE SKIP LOCKED`; driven by `startSchedulers` every 30 s and `/api/cron/email-outbox` (`CRON_SECRET`). 50 per tick.
9. **Realtime:** SSE, one `/api/realtime/stream` per user polling an events cursor table every 2 s. Presence heartbeat every 30 s, offline after 90 s (computed at read). No third-party service.
10. **Legacy rows with more than 7 skills:** do not truncate; show all with a notice; any edit must reach 7 or fewer unless the list is unchanged; admin report of affected rows.
11. **Refunds:** Razorpay Refunds API through `razorpay.ts` (no new package); final status from `refund.processed` / `refund.failed` webhooks plus a poll.

## C. Data model (one builder owns each migration; apply in order)

- **0018 drive orders (WP-A):** `college_drive_orders` (`id`, `college_id`, `drive_id` unique when set, `slots > 0`, `fee_per_student_minor > 0`, `amount_minor` with CHECK `= slots * fee`, `status` pending|paid|failed|refunded|partially_refunded, `seat_batch_id` unique, `issued_count`, `redeemed_count`, `code_valid_until`, `paid_at`, `verified_by`, `gateway_ref`); `college_seat_batches.drive_order_id` unique nullable; `college_drives.order_id` (activation blocked unless paid).
- **0019 import and identity (WP-C):** `drive_imports` (`order_id`, `file_sha256`, `mapping`, `status` preview|confirmed|void, `counts`, UNIQUE (`order_id`,`file_sha256`) where not void); `drive_roster_entries` (`order_id`, `import_id`, `row_no`, `name`, `college_email_norm`, `phone_e164`, `state` valid|invalid|duplicate|ambiguous|over_allocation, `reasons`, `match`, `intern_id`, UNIQUE (`order_id`,`college_email_norm`)); `identity_reviews`.
- **0020 codes and entitlements (WP-D):** `drive_codes` (`order_id`, `entry_id` unique, `code_hash` unique, `code_last4`, `status` issued|redeemed|revoked|expired, `valid_until`); `drive_entitlements` (`code_id` unique, `intern_id`, `order_id`, `college_id`, `payment_id`, `redeemed_at`, `interview_status`, UNIQUE (`order_id`,`intern_id`)). Plain code only in email; masked in admin.
- **0021 outbox and campaigns (WP-E):** `email_campaigns`; `email_outbox` (`campaign_id`, `entry_id`, `to`, `template`, `payload`, `status` queued|sending|sent|failed|dead, `attempts`, `next_at`, `last_error`, `provider_id`, `idempotency_key` unique = `campaign:entry:v{resendNo}`).
- **0022 refunds (WP-F):** `payment_refunds` (`intern_payment_id`, `entry_id`, `amount_minor` copied from the payment, `status` eligible|review|pending|initiated|refunded|failed, `gateway_refund_id` unique, `raw`, `actor`); partial UNIQUE on `intern_payment_id` where status is not failed.
- **0023 messaging and realtime (WP-G):** `threads` (UNIQUE employer, intern, proposal), `messages` (`delivered_at`, `read_at`), `user_presence`, `realtime_events` (bigserial, index `user_id,id`), `notification_prefs`.
- **0024 projects lifecycle (WP-B):** CHECK status draft|pending_review|published|paused|closed|rejected; backfill `active` to `published`.

Rollback: all additive; revert code and DROP new tables; 0024 needs reverse backfill first. Rehearse each on a QA/Neon copy with the legacy app booted (T15).

## D. API contracts

All writes start with `requireMutation`. Admin routes need new `colleges:write`. Money routes take an `Idempotency-Key` header.

- `POST /api/admin/colleges/[id]/drive-orders`: `{slots, feePerStudentMinor, driveId?, codeValidUntil}` returns a pending order.
- `POST /api/admin/drive-orders/[id]/payment`: manual reference or Razorpay order; the verified webhook or signature moves pending to paid conditionally.
- `POST /api/admin/drive-orders/[id]/imports`: file plus optional `mapping`, returns `{importId, headers, suggestedMapping, rows, counts}`.
- `POST /api/admin/imports/[id]/confirm`: links entries and issues codes in one transaction; repeat returns the same result.
- `POST /api/admin/identity-reviews/[id]`: `{decision: link|reject, internId?}`.
- `POST /api/admin/drive-orders/[id]/campaign` and `.../outbox/[id]/resend`.
- `POST /api/intern/drive-codes/redeem`: `{code}`; errors 409 used, 403 not yours or other college, 410 expired, 402 unpaid.
- `GET /api/college/drive-dashboard`: metrics plus paged student table (statuses only).
- `GET/POST /api/admin/refunds`, `POST /api/admin/refunds/[id]/initiate`: `{confirm: true, amountMinor}` must equal the stored amount.
- Extend `POST /api/webhooks/razorpay`: `refund.processed` / `refund.failed`.
- `POST /api/employer/projects/[id]/transition`: `{to}` checked against the state machine.
- `POST /api/presence/heartbeat`; `GET /api/realtime/stream` (SSE); `GET/POST /api/threads`, `/api/threads/[id]/messages`, `/api/threads/[id]/read` (participants only).
- SSE events: `message.new`, `message.read`, `proposal.updated`, `notification.new`, `presence.changed`.

## E. Work packages ($ money, 🔐 identity or tenant)

**Wave 1 (schema plus pure libraries):**
- **A $:** `drizzle/0018*`, drive-order section of `schema.ts`, `src/lib/college/drive-order.ts` (+test). Accept: CHECKs hold; paid transition can't run twice; no hard-coded fee.
- **B:** `drizzle/0024*`, `src/lib/projects/lifecycle.ts` (+test).
- **C 🔐:** `drizzle/0019*`, `src/lib/drives/import/*` (header detection, normalisation, matching), tests.
- **D $🔐:** `drizzle/0020*`, `src/lib/drives/codes.ts`, `redeem.ts` (+tests). Accept: concurrent redemption, exactly one wins.
- **E:** `drizzle/0021*`, `src/lib/outbox/*`. SKIP LOCKED, backoff, dead after 5.
- **F $:** `drizzle/0022*`, `src/lib/refunds/*`. Double refund refused.
- `schema.ts` is shared: each builder appends only its own marked section; one integrator merges and runs `db:verify`; migrations applied in order.

**Wave 2 (routes and UI):**
- **G:** 0023, presence, realtime and threads libs and APIs, `src/hooks/use-realtime.ts`.
- **H $:** `src/app/api/admin/drive-orders/**`, `src/app/admin/colleges/**`, `permissions.ts`.
- **I 🔐$:** `src/app/api/intern/drive-codes/**`, onboarding payment step components, `payments.ts` waiver branch.
- **J 🔐:** `src/app/api/college/drive-dashboard/**`, `src/app/college/**`.
- **K:** Bio removal (files in A1) and skills: `onboarding.ts`, `skill-filter.tsx` imports shared `MAX_SKILLS`, admin edit, ratings import, AI interview config.
- **L:** `src/app/api/employer/projects/**`, `src/app/employer/projects/**`, intern discovery query.

**Wave 3:** M refunds admin UI, routes and webhook ($); N messaging UI; O outbox scheduler, cron wiring and campaign UI; P-R UX overhaul split into candidate, employer, TPO plus admin, each on separate route directories.

**Wave 4:** e2e suites and the browser matrix.

Agent rule (AGENTS.md): at most 6 builders per wave, no shared files, Opus review after each wave.

## F. Test plan

- **300-slot drive:** order total is 300 x fee; activation refused while pending; 301st issue and redeem refused (CHECK plus `Promise.all` race test).
- **Import:** header variants and manual mapping; invalid, duplicate, ambiguous, over-allocation rows each have a reason; same file returns the same import; confirm twice is a no-op.
- **Identity:** exact verified-email match links; different email gives a review suggestion only; name-only never links; `users` row counts unchanged.
- **Codes and redemption:** one code per entry; wrong student 403; other college 403; expired 410; unpaid 402; student cannot pay again afterwards.
- **Email:** success, SMTP failure with retry, no duplicate (idempotency key), per-recipient resend.
- **Refunds:** eligible, initiated, webhook, refunded; initiating twice 409; consumed interview goes to `review`; amount equals `intern_payments.amount_minor`.
- **Skills:** 8 rejected everywhere; legacy 9 shown, unchanged save ok, changed save rejected.
- **Presence and messaging:** heartbeat expiry; SSE within 5 s; unread counts; read receipts.
- **Bio:** employer API snapshot has no `bio`.
- **Browser:** Playwright at 1280, 768 and 390 px.

## G. Risks and unverified items

- Double counting if the seat-cap path runs for drive batches (needs a guard test).
- The zero-amount payment row may affect GST and receivables reports.
- SSE on Vercel serverless: connection limits and cost.
- Codes as identity proof depend on college inbox security (hashed, expiring, bound to one student).
- Rollout: QA DB, then Neon staging; behind `DRIVES_V2=on`; pilot one college before refunds; refunds in Razorpay test mode first.
- Not verified: project moderation queue, AI interview and test config files, admin skills edit paths, whether the Razorpay webhook handles refunds, production host (Vercel or PM2 VPS), whether gating reads `intern_payments.status = 'paid'`, the admin-colleges draft spec contents.

## Wave 1 review outcomes (7 Nov 2026)

Opus review of the integrated Wave 1 diff found no blockers. Fixed: refund CHECK names now match the drizzle schema; the code hash is now keyed (HMAC with the server secret, `hashDriveCode(code, secret)`); a student who already holds a seat on the order gets 409, not a 500; a failed slot bump returns 409; `drive_codes_status_check` added to the drizzle schema.

Wave 2 requirements that came out of the review:
- **Redemption, entry binding:** if the roster entry behind a code already has `intern_id` set (auto-linked by verified email) and it is not the redeeming student, refuse with 403. If `intern_id` is empty, whoever controls the college inbox may redeem (owner decision 3); this is intended and goes into `threat-model.md`.
- **Marking an order paid:** use `UPDATE college_drive_orders SET status='paid' ... WHERE id=$1 AND status='pending'` and check the affected row count; create the one `college_seat_batches` row with `drive_order_id` in the same transaction; never call `capAfterPaid` for it.
- Shared DB helper `src/lib/db/pg-tx.ts` (`withPgTransaction`, `asSqlExecutor`, `asRowsExecutor`) wires the Wave 1 executors to Postgres. Do not edit it; ask the integrator.
- No database is reachable locally, so Wave 2 and 3 route code is checked by tsc, lint and unit tests only. The integrator must run `db:migrate` and `db:verify` against a QA copy before any of this ships.
