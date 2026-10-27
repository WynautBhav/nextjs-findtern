# End-to-end: the critical hiring path

One ordered story through the whole product, run in a real browser against a
production build (`next start`) and a local Postgres:

intern signup → onboarding → free activation → AI interview request → admin
score → employer signup → company + project → interview booked → intern picks
a slot → offer → intern accepts → monthly checkout (free) → hired → timesheet
→ employer approves → admin payout → intern's stipend page.

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
5. Runs `e2e/critical-path.e2e.mjs` with `node --test`, stops the server, and
   exits non-zero on any failure.

| Env | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e` | loopback hosts only |
| `E2E_PORT` | `3300` | the run fails if the port is taken |
| `E2E_REBUILD` | unset | `1` runs `next build` first |
| `E2E_HEADED` | unset | `1` shows the browser |

These are fixed in the server's env: `NODE_ENV=production`, `MAIL_MODE=log`,
`PAYMENTS_MODE=free` and `SCHEDULERS=off`. These are set empty:
`RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_HOST/USER/PASS/FROM`,
`GOOGLE_CLIENT_ID/SECRET`, `DEEPSEEK_API_KEY`, `STORAGE_BUCKET`, `TRUST_PROXY`
and `VERCEL`. `SESSION_SECRET` and `SIGNING_SECRET` are 32+ characters,
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
| 10 | Intern picks a slot | UI `/intern/interviews` "Choose this" | page hides the company; `scheduled` + `selected_slot`; intern mail has an `.ics` attached; employer gets "Candidate confirmed a slot" |
| 11 | Interview takes place | SQL time travel, then API feedback | status `completed`, feedback in notes |
| 12 | Offer sent | API `POST …/proposals` | `sent`, INR; `offer_details.hourlyRate` × 100 matches an active INR plan's paise (so it is stored in rupees); `monthlyAmount = hourlyRate × monthlyHours`; proposal mail to the intern without the company name |
| 13 | Intern accepts | UI `/intern/proposals/[id]` "Accept this offer" → terms → "Yes, accept" | page hides the company; status `accepted`; employer gets "Candidate decision update" |
| 14 | Monthly checkout, free mode | UI `/employer/checkout` "Monthly" → "Complete for free (test mode)" | proposal `hired` + `hired_at`; `employer_payments` free row `paid`, `paymentMode=monthly`; intern "You're hired!" mail names the company (positive control); employer "Payment received" |
| 15 | No pre-hire leak | mail log | none of the intern's emails before `hired_at` (at least 4: code, invitation, scheduled, proposal) contain the company name |
| 16 | Timesheet filled + submitted | SQL time travel, then API | `/intern/timesheets` renders; `POST` creates a draft for the first engagement month; every day set (Present on weekdays, Fixed off on weekends); submit → `submitted`; employer gets "Timesheet submitted" |
| 17 | Employer approves | UI `/employer/timesheets/[id]` "Approve" | `approved` + `approved_at`; intern notification |
| 18 | Payout created + marked paid | API `POST …/payouts`, `POST …/mark-paid` | `/admin/payouts` renders; payout row `paid` with the bank reference and amount; intern gets "Stipend transferred" |
| 19 | Earnings page | UI `/intern/earnings` | shows ₹12,345 |

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
- **Payout (18).** The admin payout dialog is likewise under redesign.

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
