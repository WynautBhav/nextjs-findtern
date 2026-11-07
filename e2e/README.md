# End-to-end: the critical hiring path

One ordered story through the whole product, run in a real browser against a
production build (`next start`) and a local Postgres:

intern signup → onboarding → free activation → AI interview request → admin
score → employer signup → company + project → interview booked → intern picks
a slot → offer → intern accepts → month-end checkout (free) → hired → timesheet
→ employer approves → employer pays month 1 → admin payout → intern's earnings page (20 steps).

`playwright` (the library) drives the browser and `node:test` runs the steps.
There is no `@playwright/test`.

## Running

```bash
# 1. A migrated local copy of the database (never the live one)
DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e npm run db:migrate

# 2. The suite
DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e npm run e2e
```

With `DATABASE_URL` unset, the suite uses that same 5433 URL. Seed logins
(`admin@findtern.dev` and the rest) use `Findtern@2026`, but the story creates
its own accounts and does not use them.

`npm run e2e` (`e2e/run.mjs`):

1. **Refuses** unless the `DATABASE_URL` host is `localhost`, `127.0.0.1` or `::1`.
2. Checks that the DB answers, then builds with `npm run build` when
   `.next/BUILD_ID` is missing. Set `E2E_REBUILD=1` to rebuild anyway, and do so
   after UI changes, because a stale build tests stale UI. The build gets the
   same env as the server, since prerendering reads the DB.
3. Starts `next start -p 3300` with `DATABASE_URL` and the overrides below set
   in the process env. Next gives process env precedence over `.env*` files, and
   an empty string counts as set (`@next/env` only fills keys that are
   `undefined`), so `.env.local`'s 5432 URL and its SMTP/Razorpay/Google keys
   are all overridden.
4. **Canary**: inserts a throwaway `users` row into the test DB, reads it back
   through the public `GET /api/users/exists/phone/:phone`, then deletes it. If
   the server cannot see the row, it is not on the test DB, and the run stops
   before any test writes anything.
5. Runs `e2e/critical-path.e2e.mjs` with `node --test --test-concurrency=1`,
   stops the server, and exits non-zero on any failure.

| Env | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e` | loopback hosts only |
| `E2E_PORT` | `3300` | the run fails if the port is taken |
| `E2E_REBUILD` | unset | `1` runs `next build` first |
| `E2E_HEADED` | unset | `1` shows the browser |

These are fixed in the server's env: `NODE_ENV=production`, `MAIL_MODE=log`,
`PAYMENTS_MODE=free` and `SCHEDULERS=off`. These are set empty:
`RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_HOST/USER/PASS/FROM`,
`GOOGLE_CLIENT_ID/SECRET`, `DEEPSEEK_API_KEY`, `INCRUITER_WEBHOOK_SECRET`,
`STORAGE_BUCKET`, `TRUST_PROXY` and `VERCEL`. `SESSION_SECRET` and `SIGNING_SECRET` are 32+ characters,
`PUBLIC_ORIGIN=http://localhost:3300`, and `UPLOAD_ROOT` and
`LEGACY_UPLOAD_ROOT` point at `e2e/.artifacts/`.

Outputs (git-ignored):

- `e2e/.artifacts/server.log`: the server's stdout and stderr.
- `e2e/.artifacts/fail-<step>-<role>.png`: full-page screenshots of all three
  role tabs when a step fails.
- `e2e/.artifacts/uploads/`: the test's photo and PAN uploads.
- `logs/mail/<YYYY-MM-DD>.log`: every email, written by `MAIL_MODE=log`.

## Re-running and rate limits

Every email, phone, Aadhaar, PAN, company name and project name comes from
the run's timestamp, so the story runs again and again against the same DB.
The signup, OTP and login limiters (`src/lib/security/rate-limit.ts`) live in
memory per server process. The orchestrator starts a fresh server for each
run, so their budgets reset. One run uses 2 OTP sends, 2 signups and 1 login.

The OTP is read from the mail log (`--- <iso>` / `To:` / `Subject:` blocks).
Mail is matched only when its timestamp falls inside the current run.

## The steps

**[UI]** steps click the real page using `getByRole` / `getByLabel` / `#id`
selectors, never CSS classes. **[API]** steps call the same endpoint the page
calls, from inside the page with its session cookie and with the `ft_csrf`
cookie echoed as `x-csrf-token`, which is what `csrfFetch` does. Even so, every
API-driven step first loads its role's page and checks that it renders.

If a UI step fails, it reports the failure and then performs the same action
through the API, so later steps still run. The failed step stays failed: its
message says the UI failed and that state was recovered.

| # | Step | Drive | Asserts (DB + mail) |
|---|------|-------|---------------------|
| 1 | Intern signs up | UI `/signup` | `users` row: intern, `email_verified`, argon2 password (never plaintext); OTP consumed; code read from the "Verify your Findtern email" mail |
| 2 | Intern onboarding, final submit | API | `/intern/onboarding` renders; photo + PAN go through `POST /api/uploads` → `intern_document` (re-encoded WebP); `POST /api/intern/onboarding {final:true}` passes `validateProfile`; Aadhaar/PAN/skills/modes/laptop/NDA stamp stored; dashboard renders |
| 3 | Free activation | UI dashboard "Activate free (test mode)" | `intern_payments` row: `gateway=free`, `paid`, amount 0; `extraData.payment.isPaid` |
| 4 | AI interview request | UI "Request my AI interview" | `interviews` row against `ai-interview@findtern.ai`, status `waiting`; notification |
| 5 | Admin created and signed in | `scripts/make-admin.ts`, then SQL `role='super_admin'`, then UI `/admin/login` | lands on `/admin/dashboard` with the admin nav |
| 6 | Admin scores the intern | API `PUT …/ratings` | `/admin/interns/[id]` renders; `ratings.interview=8`, score ≥ 6, `approvalStatus=Approved`, AI interview row `completed` |
| 7 | Employer signs up | UI `/employer/signup` | `employers` row, argon2 password; code from "Verify your company email" |
| 8 | Company setup + project | API `PATCH /api/employer/:id`, `POST …/projects` | `/employer/onboarding` form renders; country/website stored; `onboarding_completed`; employer dashboard renders without bouncing back to onboarding |
| 9 | Interview booked, 3 slots | API `POST …/interviews` | candidate page hides the intern's surname; `pending` row with 3 slots (11:00 IST stored as 05:30 UTC); invitation mail to the intern without the company name |
| 10 | Intern picks a slot | UI `/intern/interviews`: select an offered time, then "Book …" | page hides the company; `scheduled` + `selected_slot`; intern mail has an `.ics` attached; employer gets "Candidate confirmed a slot" |
| 11 | Interview takes place | SQL time travel, then API feedback | status `completed`, feedback in notes |
| 12 | Offer sent | API `POST …/proposals` | `sent`, INR; `offer_details.hourlyRate` × 100 matches an active INR plan's paise (so it is stored in rupees); `monthlyAmount = hourlyRate × monthlyHours`; proposal mail to the intern without the company name |
| 13 | Intern accepts | UI `/intern/proposals/[id]` "Accept this offer" → terms → "Yes, accept" | page hides the company; status `accepted`; employer gets "Candidate decision update" |
| 14 | Checkout, post-paid plan, free mode | UI `/employer/checkout` "…charge due 2 days before the month's pay date" → "Complete for free (test mode)" | page lists "Hiring charge (one-time)" and "Month 1 charge" as the amount due now and "Month 2 · due …" as the first later month; proposal `hired` + `hired_at`; `employer_payments` free row `paid`, `paymentMode=hiring_fee` with `firstMonthProposalIds=[proposal]`; intern "You're hired!" mail names the company (positive control); employer "Payment received" |
| 15 | No pre-hire leak | mail log | none of the intern's emails before `hired_at` (at least 4: code, invitation, scheduled, proposal) contain the company name |
| 16 | Timesheet filled + submitted | SQL time travel, then API | `/intern/timesheets` renders; `POST` creates a draft for the first engagement month; every day set (Present on weekdays, Fixed off on weekends); submit → `submitted`; employer gets "Timesheet submitted" |
| 17 | Employer approves | UI `/employer/timesheets/[id]` "Approve timesheet" → "Yes, approve and lock" | `approved` + `approved_at`; intern notification |
| 18 | Month 1 already paid | SQL check (no POST) | the first order's `firstMonthProposalIds` carries the proposal (month 2 is not payable yet). The payout below is gated on it |
| 19 | Payout created + marked paid | API `POST …/payouts`, `POST …/mark-paid`, after the intern adds bank details | `/admin/payouts` renders; payout row `paid` with the bank reference and amount; intern gets "Stipend transferred" |
| 20 | Earnings page | UI `/intern/earnings` | shows ₹7,345 |

### Why some steps are API-driven

- **Onboarding (2).** The form has 8 steps, a photo and a PAN upload, and is
  being restyled. The test makes the same upload and save calls the form makes
  (`file-upload.tsx`, `onboarding-form.tsx`), and the server's `final: true`
  validation is identical either way.
- **Ratings (6), company setup and project (8), interview booking (9), offer
  (12).** These are long multi-field forms with date and time pickers, all
  under active redesign. The rules worth testing (pool visibility, quarter-hour
  future slots, the rupee pricing, CSRF, ownership) live in the routes, and the
  test exercises those routes directly.
- **Timesheet (16).** The grid has a cell for every day of the month. The test
  makes the grid's own PATCH and submit calls.
- **Payout (19).** The admin payout dialog is likewise under redesign.

### Time travel (test DB only)

The product correctly blocks two transitions that need real time to pass. The
story moves the clock in the test DB rather than waiting:

- **Step 11.** Interview slots must be in the future, and an open meeting
  blocks an offer until it ends (`employer-interview-rules.ts`). The three
  slots are moved 2 to 3 hours into the past.
- **Step 16.** An offer must start after today, while a timesheet period can be
  logged only after it starts and submitted only after it ends
  (`timesheetPeriod`, the submit route). `offer_details.startDate` is moved 40
  days back.

## Other suites in this folder

The critical path above is the only one `npm run e2e` runs, and CI runs it
(`.github/workflows/ci.yml`, against a throwaway `findtern_e2e` database). The
rest are run by hand or through the QA harness (`docs/qa/README.md`) and also
refuse a non-local database, except the staging journey.

| Script | Run with | What it covers |
| --- | --- | --- |
| `qa.mjs`, `qa-serve.mjs`, `seed-situations.mjs` | `npm run qa`, `qa:serve`, `qa:seed` | QA harness: its own server on `QA_PORT` (3500) and seeded data situations |
| `crawl.e2e.mjs`, `keyboard.e2e.mjs`, `motion.e2e.mjs`, `slow3g.e2e.mjs`, `lighthouse.mjs`, `baseline.mjs` | `npm run qa -- <step>` | Every route per role and width (errors, overflow, axe), keyboard-only pass, reduced motion, slow network, Lighthouse, baseline screenshots |
| `admin.e2e.mjs` | `npm run e2e:admin` | Admin console as the seeded super admin (cleans up what it creates) |
| `college-partners.e2e.mjs`, `college-money.e2e.mjs`, `college-real-onboarding.mjs` | `npm run test:e2e:college`, `test:e2e:college-money`, or `node` | College drives, seat batches, bank and withdrawals, the full officer-to-student story |
| `pay-race.mjs` | `node e2e/pay-race.mjs` (QA server with `PAYMENTS_TEST_BUTTON=1`) | Double-submit safety: one order, one hire, one invoice |
| `retest-qa001.mjs`, `retest-qa002.mjs` | `node …` | Regressions for QA-001 (campus call without a join link) and QA-002 (hydration under reduced motion) |
| `staging-journey.e2e.mjs`, `bugsheet9-public.mjs` | `node --test …`, `node …` | The hiring journey and public pages on the **deployed staging site** (Vercel preview + Neon staging only; never the real domain). Needs admin credentials in the environment |

`e2e/lib/` holds the shared helpers: `env.mjs` (the loopback-only database rule),
`db.mjs`, `mail.mjs` (reads `logs/mail/`), `browser.mjs`, `session.mjs`,
`personas.mjs`, `routes.mjs`, `qa-server.mjs`, `one-window.mjs` and `staging.mjs`.

## Messaging, project lifecycle and profile-limit suites (WP-T)

Three QA-stack suites in the style of `admin.e2e.mjs` (node:test + playwright, one context per
persona, CSRF header via `api()`, direct `pg` assertions). They were written without a database and
have **not been run yet**; expect to adjust selectors on the first run.

| Script | File | Covers |
| --- | --- | --- |
| `npm run test:e2e:messaging` | `messaging.e2e.mjs` | thread access rules, both-way messages, 404 for outsiders, 4000-char cap, HTML stripped, live unread badge (SSE, no reload), Read receipt, Online/Offline, stream 401/429/Last-Event-ID, no contact data in payloads |
| `npm run test:e2e:projects` | `projects-lifecycle.e2e.mjs` | draft → review → reject/approve → pause/resume/close, 7-skill cap, 422 missing fields, race = one winner, ownership, legacy `active`, 390px + axe |
| `npm run test:e2e:limits` | `profile-limits.e2e.mjs` | `bio` accepted but not stored/shown, 8 skills refused, legacy 9-skill rows (unchanged ok, swap refused, reduce ok), admin skills route |

Run with the QA stack env (`E2E_BASE_URL`, `DATABASE_URL`) and a server started with `TRUST_PROXY=1`.
`projects` also needs the seeded `admin` and `intern-hired` personas. Accounts and rows are created by
`lib/fixtures2.mjs` (SQL inserts, tagged with the run id) and removed in `after()`.

## Drive journey (`npm run test:e2e:drive`)

`e2e/drive-journey.e2e.mjs` (helpers in `e2e/lib/drive.mjs`) covers the college drive order end to end, 14 tests in
order: create order → mark paid (idempotent) → roster preview → confirm + identity matching → identity review →
campaign/mail → redemption and its refusals → 8-way race → slot limits and CHECKs → TPO dashboard → refunds
(scan, initiate, webhook) → mobile 390x844 smoke ×2 → axe on `/college`. Fake people only (`@e2e-drive.test`).

It is **written but not run in CI**; it needs a real server and database:

1. `DATABASE_URL=postgresql://…@localhost:5433/findtern_e2e npm run db:migrate` (all migrations incl. 0018 to 0022), plus the seeded super admin (`admin@findtern.dev`, or `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`).
2. Start a production server on that same DB with the `npm run e2e` env (`MAIL_MODE=log`, `SIGNING_SECRET`/`SESSION_SECRET` as in `e2e/run.mjs`, Razorpay keys blank, `PAYMENTS_MODE=free`), e.g. run `npm run e2e` once to build, or `next start` with that env.
3. `E2E_BASE=http://localhost:3300 DATABASE_URL=… npm run test:e2e:drive`. It refuses a non-loopback DB or server host.

Optional env: `E2E_SIGNING_SECRET` (else read from `e2e/run.mjs`; codes are derived from it, never stored), `CRON_SECRET` (set in BOTH the server and this process, with the server's `SCHEDULERS` not `off`, or the mail/resend assertions in test 6 skip with a reason), `E2E_WEBHOOK_SECRET` (same value as the server's `RAZORPAY_WEBHOOK_SECRET`, or test 11d skips).
The suite leaves its fake rows behind (a new tag per run); use a throwaway database. The per-IP redeem limit is 30 per 15 minutes and the suite uses about 20, so wait 15 minutes between runs on one server.
