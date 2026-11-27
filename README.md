<div align="center">

<img src="public/media/findtern-logo.png" alt="Findtern" height="72" />

### Pre-screened interns. Hired by the hour. Billed only for approved work.

The platform behind **[findtern.in](https://findtern.in)**: the public site, the intern app, the employer app,
the college (TPO) console and the admin console, in one Next.js codebase.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-Drizzle-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

</div>

**Contents:** [Read this first](#read-this-first) · [Business rules](#business-rules) · [The five areas](#the-five-areas) ·
[Architecture](#architecture) · [Background jobs](#background-jobs) · [Run it locally](#run-it-locally) · [Scripts](#scripts) ·
[Database and migrations](#database-and-migrations) · [Tests](#tests) · [Environment variables](#environment-variables) ·
[Deploy](#deploy) · [Security model](#security-model) · [Performance](#performance) · [Project map](#project-map) · [Working on it](#working-on-it)

## Read this first

- This is **not** the Next.js you know: read `node_modules/next/dist/docs/` before changing framework-level code.
- `docs/`: launch checklist, cron activation, college-partner notes, plans.

**Hard rule for anyone touching data:** never point a script, test or dev server at the live production database
(a Supabase Postgres; its `DATABASE_URL` is in the host's settings and the main checkout's `.env`). Use a local Postgres
or the Neon staging database, and pass `DATABASE_URL` explicitly on every database command so nothing falls back to a `.env` file.

## Business rules

These are enforced on the server. The numbers live in the files named, so change them there, not in the UI.

### Findtern Score and price bands (`src/lib/score.ts`)

The score is out of 10: the mean of four admin-entered ratings (communication, coding, aptitude, AI interview), rounded to
one decimal, or a score imported in bulk (`src/lib/admin/ratings.ts`). Bands are half-open, so exactly 6.0 is Skilled and
exactly 8.0 is Assured.

| Band (plan name) | Score | Default hourly rate on the offer |
|---|---|---|
| Standard (Espresso) | 0 to under 6 | ₹0 |
| Skilled (Cappuccino) | 6 to under 8 | ₹100 |
| Assured (Latte) | 8 to 10 | ₹200 |

Rates are admin-editable in `pricing_plans` (the code values are the fallback). USD is derived at ₹100 = $1
(`src/lib/currency.ts`); only INR rows are authored.

- **+1 per successful internship, max 10.** A hire completes when every engagement month has an approved timesheet
  (`src/lib/admin/complete-internship.ts`). That adds 1 to the score (capped at 10) once, and creates one pending
  Findtern-paid completion bonus payout for the intern (₹2,000 / ₹2,500 / ₹3,000 by the score before the +1;
  `src/lib/completion-bonus.ts`). Full-time conversions and early-ended hires earn none.
- **Placement guarantee: 6 months** from the AI interview (`GUARANTEE_MONTHS` in `src/lib/guarantee.ts`). A miss is an offer
  the intern declined, or one that lapsed unanswered past its start day. More than 3 misses (the 4th) end the guarantee.
  Declined or lapsed full-time offers and offers closed by an admin never count.

### What an employer sees and pays (`src/lib/checkout.ts`, `billing-plan.ts`)

- **An employer never sees what the intern is paid.** No stipend, completion bonus or payout figure is sent to the
  employer's browser, shown in employer pages, emails, invoices, FAQ, pricing copy or chatbot answers. Employers see only
  what they pay Findtern. Guarded by `src/lib/employer-no-intern-pay.test.ts` and `employer-redaction.test.ts`; also
  `toEmployerProposal` in `src/lib/employer-proposal-view.ts`.
- Until hire, employers see candidates masked (initials, no photo, no surname); the full name unlocks after hire.
- **One-time hiring charge** on every internship hire, any band: ₹5,000 / $50 (or what the offer was priced with),
  billed with the first payment.
- **Pay plans.** Score 6 and above: pay the hiring charge now, then each month's charge is due 2 days before that month's pay
  date, payable from 15 days before it ("postpaid"). Under 6: the whole engagement is paid upfront. Upfront has no discount; the
  two plans differ only in timing. Hires paid on the older pay-at-start monthly plan keep it. The plan is decided by the oldest
  paid order that names the hire.
- **Full-time offer:** 8.33% of annual CTC, upfront only, no separate hiring charge.
- **Promo codes** apply only to an upfront payment. An employer code can never discount the whole engagement to zero.
- **Dues and reminders.** Month k falls due 2 days before the intern's pay date for it. Reminder emails go out at 15, 12, 9, 6,
  3, 2 and 1 days before, on the due day, and once as "overdue" 3 days after (`src/lib/payment-reminders.ts`). Each send is
  de-duplicated by key, so a cron re-run never mails twice.
- **Payouts.** Admins create payouts per intern and mark them paid with a bank reference; a stipend cannot be marked paid
  without the intern's bank details on file, and the payout is gated on the employer having paid that month
  (`src/app/admin/payouts`, `src/lib/admin/payout-run.ts`, `mark-paid-rules.ts`).

### Intern activation fee (`src/lib/platform-settings.ts`)

- **₹2,499, GST-inclusive** (`intern_activation_fee_minor`, editable by admins). Paying it unlocks the AI interview.
- **Waived by an active college code.** A college's TPO code is a 100% promo code. It works only while the college is active
  and a partner, only for students who confirm they are 18+, and only for students not already in a different college.
  Using it verifies the student with that college.

### College (TPO) seats and money (`src/lib/college/money.ts`)

- **Seats are ₹800 per student, GST-inclusive.** Admin picks only the seat count (1 to 5,000 per batch).
- **The code's cap equals paid seats.** A new college starts at 0; marking a batch paid raises the cap to total paid seats.
  The cap can never exceed paid seats or fall below seats already used. There are no free seats.
- Partner colleges earn a wallet credit per completed internship by a verified member (₹500 / ₹1,000 / ₹1,500 by the score
  before the +1; `src/lib/college/wallet.ts`), withdrawable to a bank account the college adds.

### Invoices and GST (`src/lib/gst.ts`, `invoice-number.ts`, `invoice-lines.ts`)

- Listed INR prices include 18% GST; tax is backed out of the total (total / 1.18).
- Place of supply decides the split: same state as the seller (Rajasthan) gives 9% CGST + 9% SGST, another Indian state 18%
  IGST, buyers outside India (USD) are an export with no GST. The buyer's state comes from GSTIN, then PIN code, then profile.
- One running invoice serial per Indian financial year (April to March, IST), shared by employer orders, intern fees and
  college seat batches. The number is assigned once, when a payment is marked paid, and never changes.

## The five areas

| Area | Routes (`src/app/`) | Who | What it does |
|---|---|---|---|
| Public site | `(marketing)/`, `blog/`, `(auth)/`, `drive/` | Anyone | Home, pricing, FAQ, employers, interns, guaranteed-internship page, blog, legal pages (employer and intern terms, intern NDA), contact; sign-in, sign-up with email code, password reset. Copy comes from `src/lib/content` accessors (DB first, TS fallback) |
| Intern | `intern/` | Candidates | Eight-step onboarding, activation, AI interview request, offers and interview slots (with a Join meeting button), timesheets, bank details, earnings, documents, college membership, notifications |
| Employer | `employer/` | Hiring teams | Company setup, projects, candidate search, shortlist and compare, interviews (with a Join meeting button), offers, cart and checkout, orders and invoices, timesheet approval, full-time offers, campus drives |
| College / TPO | `college/` | Placement officers | Roster upload, students, drives with employer links, seats and invoices, wallet earnings and withdrawals |
| Admin | `admin/` | Staff | Dashboard queues, interns (ratings, approval, skills, documents, Education/CGPA editor), proposal tracker (with a read-only View proposal page), companies, orders, intern invoices (date range, View invoice), payouts, transactions, promo codes, colleges, CMS and website content, terms and NDA, reports and CSV exports, contact messages (`/admin/messages`), notifications, roles, audit log, "View as" (read-only impersonation) |

`src/app/api/` holds the route handlers (`auth`, `intern`, `employer`, `college`, `admin`, `proposals`, `interviews`,
`timesheets`, `uploads`, `webhooks`, `cron`, and others). There is also `.well-known/security.txt`, `llms.txt`, a sitemap and
robots routes.

**Messaging was removed.** There are no employer or intern message threads: `/employer/messages/*` and `/intern/messages/*` are
308 redirects to the dashboards (`next.config.ts`; `src/lib/messaging-removed.test.ts`). The `threads` and `messages` tables are
kept for the record. Admin **contact messages** (the public contact form, `/admin/messages`) are unrelated and still there.

### Roles and permissions

- Session roles are `intern`, `employer`, `admin` and `college` (`src/lib/security/session.ts`).
- Admin permissions are a fixed catalog in `src/lib/admin/permissions.ts` (for example `interns:read`, `transactions:write`,
  `cms:write`, `roles:write`), mapped from URL to permission by longest prefix. `*` is Super Admin. `src/proxy.ts` enforces
  them on every `/admin` page and `/api/admin` call, and re-reads the role's permissions (cached about 30 seconds), so a
  demoted admin loses access without signing out.
- Default roles (`src/lib/admin/roles-seed.ts`): Super Admin, Admin, Executive - Accounts, Executive - Operations,
  Executive - Sales. **Accounts** has `reports:read`, `transactions:read`, `transactions:write` and read-only
  `interns:read` (to record an offline activation fee). One-time grants live in `roles-grants.ts` and are recorded in
  `platform_settings`, so a super admin removing one is not undone on the next boot.
- Nobody can grant more than they hold.

### Audit log

Every sensitive admin action (money, exports, identity reveal, impersonation, pricing, settings, role changes) writes to
`admin_audit_log` through `src/lib/admin/audit.ts`. `AUDIT_ACTIONS` maps every action to a human label and a test fails if an
action is written without one. Viewable and exportable under `/admin/audit-log`.

### Admin screens worth knowing

- **Education/CGPA editor:** `PUT /api/admin/interns/[id]/academics` (`src/app/api/admin/interns/[id]/academics/route.ts`, rules in `src/lib/admin/academics-edit.ts`).
- **View proposal:** read-only page at `/admin/proposal-tracker/[id]`, same read permission as the tracker.
- **Intern invoices:** `/admin/intern-invoices` has a date range (`DateRangeForm`) and a View invoice link on each row.
- **Filter bars** share the primitives in `src/components/admin/filter-controls.tsx`.

### Sessions and revocation

Sessions are HMAC-signed cookies with a CSRF double-submit token: 12-hour idle window, renewed while active, 30-day hard
maximum (`src/lib/security/session.ts`, renewed in `src/proxy.ts`). Logout writes the session id to `revoked_sessions`
(`revokeSession` in `src/lib/account-status.ts`) so a stolen cookie stops working before it expires; expired rows are pruned on
write. Impersonation sessions last one hour.

### Disabling an account

An admin disabling a company, intern or college officer takes effect on the **next request on any server instance**: the
session facts (revoked list, account active flag, password version) are read fresh on every request, not from the 30-second
cache, because the disable request can only clear the cache of the one instance it ran on (`src/lib/session-validity.ts`,
`src/lib/account-status.ts`). Routes answer **403 `ACCOUNT_DISABLED`**; a signed-out request gets 401 `SESSION_EXPIRED`
(`src/lib/account-disabled.ts`). Open tabs are signed out by a client watcher, and the sign-in page shows one shared message
that names the admin email. Disable and enable each send an email, only when the state really changed, inline and never
able to fail the admin action (`src/lib/account-notices.ts`). A check that cannot answer (pool timeout) signs that request out
rather than letting it through. Covered by `e2e/account-disable.e2e.mjs` (two instances, one database).

### Proposal and interview expiry

- **Proposals.** A proposal stops being answerable or payable when its start date begins (00:00 IST): an unanswered one expires
  as `no_reply_past_start`, an accepted-but-unpaid one as `unpaid_past_start`. `processing` and `hired` never expire, an open
  payment order freezes expiry, and a withdraw on an expired proposal is refused with a message saying it expired
  (`src/lib/proposal-expiry.ts`, `proposal-expiry-plan.ts`).
- **Three ways the sweep runs** (`src/lib/proposal-expiry-db.ts`): a page-load sweep (`src/lib/proposal-expiry-kick.ts`, queued with
  `after()` from the employer proposals/dashboard pages and the admin proposal tracker, at most one per 10 minutes across
  instances), the daily `GET /api/cron/proposal-expiry`, and the hourly steps of the in-process scheduler or the tick.
  `SCHEDULERS=off` stops all of them.
- **Interviews.** A meeting is `MEETING_MINUTES` = 30 long (`src/lib/interview-lifecycle.ts`). A booked interview still
  `scheduled` after that, or an invite whose offered slots have all started, reads `expired`; the same sweep persists it
  (`src/lib/interview-expiry-db.ts`). The AI interview has its own expiry (`src/lib/admin/ai-interview-expiry.ts`).
- **Join meeting** button for intern and employer: opens 15 minutes before the start, closes at start + 60 minutes
  (`src/lib/interview-join.ts`).

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        M[Public site]
        I[Intern app]
        EM[Employer app]
        C[College console]
        A[Admin console]
    end

    subgraph Next["Next.js 16"]
        P[proxy.ts<br/>admin permissions, sign-in redirects, session renewal]
        RSC[Server components<br/>read from the DB]
        API[Route handlers<br/>requireMutation on every write]
        J[Cron routes, and in-process<br/>schedulers on a long-running server]
    end

    DB[(Postgres<br/>Supabase in production)]
    FS[[File store<br/>local private folder or S3]]

    M & I & EM & C & A --> P --> RSC & API
    RSC & API & J --> DB
    API --> FS
    API <--> RZ[Razorpay]
    API --> G[Google<br/>sign-in, Calendar, Meet, Drive]
    API & J --> SMTP[Email]
```

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Data | Postgres (Supabase in production) with Drizzle ORM; plain-SQL migrations in `drizzle/` |
| Auth | argon2id passwords, signed session cookie, CSRF token, per-IP rate limits |
| Payments | Razorpay over `fetch`, signed webhook at `/api/webhooks/razorpay` |
| Google | OAuth, Calendar and Meet, Drive over `fetch` |
| Email | Nodemailer over SMTP; `MAIL_MODE=log` writes to `logs/mail/` instead. College nudge emails are sent inside the request (`src/lib/college/nudge.ts`, `nudge-plan.ts`, `POST /api/college/nudge`) |
| Styling | Tailwind v4, tokens in `src/app/globals.css`; UI primitives from the Watermelon registry (`components.json`) |
| Motion | GSAP, Motion and Lenis, reduced-motion aware |

## Background jobs

Two mechanisms run the same work, and which one is live depends on where the app runs.

| | Vercel (production) | Long-running server (VPS, local dev) |
|---|---|---|
| Trigger | `crons` in `vercel.json`, `GET` with `Authorization: Bearer $CRON_SECRET` (an unset secret closes the route) | In-process timers (`src/lib/schedulers.ts`), started by `src/instrumentation.ts` |
| Switch | `CRON_SECRET` set; `SCHEDULERS=off` skips the routes (except roster-import-purge) | `SCHEDULERS=on`; anything else leaves the timers off |
| Cadence | Daily, because the plan is Hobby | Reminders every 5 min, notification jobs every 6 h, offer expiry hourly, email outbox every 30 s |

- `SCHEDULERS=on` is a **no-op on Vercel** (`inProcessSchedulersAllowed` needs `SCHEDULERS=on` and no `VERCEL`): instances are
  short-lived and frozen between requests, so timers there would only add queries. Use it on exactly one long-running server.
- `GET /api/cron/tick` (`src/lib/cron-tick.ts`) runs the timers' jobs once, in order: interview reminders, proposal/interview
  expiry, notification jobs, email outbox (skipped when `OUTBOX_CRON=off`). Each step is idempotent and the whole tick stops
  starting steps after 40 s. The notification jobs run only on ticks whose UTC hour is 0, 6, 12 or 18, so the daily 06:00 UTC tick runs them once a day;
  more frequent runs need an hourly ping.
- **The 1-hour interview reminder** therefore needs either a long-running server with `SCHEDULERS=on` or an **hourly external
  ping** to `/api/cron/tick` with the bearer secret. On Hobby's daily cron it is late, and the reminder text states the real time left.
- Activation and turn-off steps for the money crons: [`docs/cron-activation.md`](docs/cron-activation.md) (written before
  `/api/cron/tick` existed, so its note that the outbox is unregistered is out of date: the tick drains it).

## Run it locally

Needs Node 24 (what CI runs; the scripts use `--experimental-strip-types`, which needs 22.6+) and a local Postgres with a `findtern` role (the npm scripts assume
`postgresql://findtern:findtern_dev@localhost:5432/findtern`).

```bash
npm ci
cp .env.example .env.local      # fill in what you need; see Environment variables
npm run db:seed                 # generate + apply schema to the LOCAL db, load demo data
npm run dev                     # http://localhost:3000
```

Demo logins (password `Findtern@2026`; local seed data only):

| Role | Email | Sign in at |
|---|---|---|
| Intern | `candidate@findtern.dev` | `/login` |
| Employer | `hiring@northwind.dev` | `/employer/login` |
| Admin | `admin@findtern.dev` | `/admin/login` |
| Placement officer | `tpo@jklu.edu.in` | `/college/login` |

The officer login exists after `npm run db:seed-colleges`, which adds the college demo data on top of `db:seed`.

Locally, emails are written to `logs/mail/` (not sent) when `MAIL_MODE=log`, schedulers stay off unless `SCHEDULERS=on`, and Razorpay is off unless you add test keys.
`PAYMENTS_MODE=free` completes activation and checkout without Razorpay; `PAYMENTS_TEST_BUTTON=1` lets the order APIs accept a
`testPay` request flag (no page has a button for it; the e2e suites use it) that settles at the real amount. The flag
works only on a known test host (localhost, a `*.vercel.app` deployment, or one listed in `STAGING_HOSTS`), whatever the
Razorpay key; elsewhere the API answers 403. `PAYMENTS_MODE=free` refuses a live key off a test host. Never set either on the real domain.

## Scripts

### `package.json`

| Command | What it does |
|---|---|
| `npm run dev` · `build` · `start` | Next dev server, production build, production server |
| `npm run lint` | ESLint |
| `npm test` | Unit tests: `node --test` over `src/lib/**/*.test.ts` and `src/components/**/*.test.ts` |
| `npm run test:security` | Only `src/lib/security/*.test.ts` |
| `npm run e2e` | The critical hiring path in a real browser against a local test DB (see `e2e/README.md`) |
| `npm run e2e:admin` · `test:e2e:college` · `test:e2e:college-money` | Admin console and college suites (they need a running QA server) |
| `npm run qa` · `qa:serve` · `qa:seed` | QA harness: crawl, keyboard, motion, slow-3G, Lighthouse, baseline; its server; its data situations |
| `npm run check:contrast` · `check:motion` | Computed text-contrast check and motion budget for the signed-in consoles (exit 1 on a finding) |
| `npm run shots` | Full-page screenshots of the signed-in areas |
| `npm run db:generate` | Generate migration SQL from `src/lib/db/schema.ts` |
| `npm run db:push` · `db:seed` · `db:reset` | **Destructive**, local only: rebuild the dev DB from the schema, then seed (refuses non-localhost) |
| `npm run db:seed-colleges` · `db:import-colleges` | College demo data; import the AISHE college directory (`data/colleges/`) |
| `npm run db:verify` | Row counts plus real logins through the route handlers |
| `npm run db:migrate` | Apply pending `drizzle/*.sql` files, recorded and safe to re-run |
| `npm run db:make-admin` | Give yourself an admin login on a local copy |
| `npm run db:pull-live` | Dump the production database to a local copy. **Do not run it without the owner's explicit go-ahead.** |
| `npm run db:studio` | Drizzle Studio on the local DB |

### `scripts/`

`db-push.ts`, `seed.ts`, `seed-colleges.ts`, `import-colleges.ts`, `db-verify.ts`, `migrate.ts`, `legacy-backfill.sql`
(idempotent fixes `migrate.ts` runs last), `make-admin.ts`, `pull-live.sh`, `upload-legacy-to-s3.ts`,
`report-lost-completion-bonus.ts` (read-only report), `shots.ts` and `design-shots.mjs` (screenshots), `check-contrast.mjs`,
`check-motion-budget.mjs`, `route-sweep.mjs` (every gated page as every role plus an access-control matrix; see
`e2e/route-sweep/README.md`), `security-probe.mjs` (IDOR, role-boundary, cookie, header, CSRF and CORS probes against a
loopback server and database), `legacy/` (an argon2 compatibility patch for the legacy app).

### Before every commit

```bash
npx tsc --noEmit && npm run lint && npm test && npm run db:verify
```

Add `npm run test:security` and a build when you touch auth, sessions or anything that affects the build.

## Database and migrations

- **Production** is Supabase Postgres in ap-southeast-1 (the pooled connection string is the `DATABASE_URL` on the host; it is never
  committed). Local dev and tests use a local Postgres. Neon is used only for the staging database the e2e/seed workflows target.
- Schema: `src/lib/db/schema.ts` plus the `schema-*.ts` files beside it (Drizzle). Migrations: `drizzle/0000_…` through
  `drizzle/0041_profile_views_intern_id_idx.sql` (there are two `0007_` files; they apply in filename order). `scripts/migrate.ts`
  reads the folder, applies each file once, records it in `_ft_migrations`, never drops anything, then runs
  `scripts/legacy-backfill.sql`. Hand-written rollbacks live in `drizzle/rollback/`.
- Recent additions: drive orders, imports and codes (0018-0020), email outbox (0021), payment refunds (0022), messaging tables
  (0023, now unused), project lifecycle (0024), listings (0025), roster imports (0026), presence (0027), and query indexes
  (0028-0034, 0036-0041; one index per migration so none holds a long lock). 0035 adds `interviews.employer_joined_at`.
- Workflow: change `schema.ts`, run `npm run db:generate`, **read the generated SQL**, commit it. On Vercel the build applies it
  (`vercel.json` `buildCommand` runs `scripts/migrate.ts` first). Elsewhere run `npm run db:migrate` on the target database.
  Migrations only add.
- Local database options: the `findtern` role on `localhost:5432` (what `db:seed` assumes), or any throwaway loopback Postgres
  (a container, or the `embedded-postgres` binaries; neither is a dependency of this repo). Apply with
  `DATABASE_URL=postgresql://findtern@127.0.0.1:<port>/<db> npm run db:migrate`, then seed with
  `node --experimental-strip-types scripts/seed.ts` (demo logins above) and `scripts/seed-colleges.ts`.
- The database was inherited from the legacy app, so some tables hold legacy JSON shapes. Go through `src/lib/offer.ts` for
  offers and `src/lib/onboarding.ts` for profiles; never read those JSON columns directly.

## Tests

The gates (CI, `.github/workflows/ci.yml`, runs the first four, the migrate/seed/verify steps, a build and the e2e path):

```bash
npx tsc --noEmit
npm run lint
env -u PUBLIC_ORIGIN -u DATABASE_URL npm test      # origin.test.ts fails while PUBLIC_ORIGIN is set; keep DATABASE_URL unset too
npm run test:security
DATABASE_URL=postgresql://x:y@127.0.0.1:1/none npx next build   # build with no reachable DB
npm run check:contrast && npm run check:motion
```

`check:contrast` and `check:motion` are not in CI; run them after UI changes. Pushing to `master` deploys to Vercel.

- **Unit** (`npm test`): pricing and bands, checkout, billing plans, dues and reminders, GST and invoices, offers, guarantee,
  promo and college rules, timesheets, payouts, permissions, audit labels, session lifecycle and revocation, redaction.
  Pure rules live in files with no database import so `node --test` can run them.
- **Route surface** (`src/lib/security/route-surface.test.ts`, part of `npm run test:security`): every `src/app/api` GET route
  must check a session or cron secret or be on a reviewed public list, cron routes are GET-only with a constant-time secret
  check, every `/api/admin` route resolves to a permission rule, and no route returns `err.message` to the browser.
- **CI** runs typecheck, lint, unit and security tests, migrate, seed, `db:verify`, build and the e2e critical path on a Postgres service.
- **E2E and QA** (`e2e/*.e2e.mjs`, `e2e/README.md`): browser and API suites with Playwright and `node:test`. `npm run e2e` is the
  critical path against a scratch Postgres on loopback; other suites are run as `node --test e2e/<name>.e2e.mjs` against a QA
  server started with `npm run qa:serve` (each file's header says which env it needs). All of them refuse a non-local database,
  except the staging journey, which is limited to the Neon staging host and a Vercel preview URL.
- **Route sweep and security probe** (`scripts/route-sweep.mjs`, `scripts/security-probe.mjs`): both need a seeded local scratch
  database and a local `next start` with `TRUST_PROXY=1`; they refuse non-loopback targets. Setup is in the file headers and `e2e/route-sweep/README.md`.

## Environment variables

Names only. `.env.example` lists each one with a comment; real values stay in untracked `.env*` files or the host's settings.

| Group | Variables |
|---|---|
| Core | `DATABASE_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`, `PUBLIC_ORIGIN`, `SESSION_SECRET`, `SIGNING_SECRET`, `TRUST_PROXY`, `RATE_LIMIT_BYPASS_IPS`, `PASSWORD_UPGRADE`, `TZ` |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENTS_MODE`, `PAYMENTS_TEST_BUTTON` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `MAIL_MODE`, `ADMIN_ALERT_EMAIL` |
| Jobs | `SCHEDULERS` (`on` on exactly one long-running server for the in-process timers; `off` skips the cron routes; no effect on Vercel), `CRON_SECRET` (bearer token for every `/api/cron/*` route), `REFUND_RECONCILE` (`1` turns the refund reconcile cron on; default off), `REFUND_RECONCILE_MIN_AGE_MINUTES` (default 30), `OUTBOX_CRON` (`off` skips the email-outbox cron; default on) |
| Google | `GOOGLE_LOGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `FINDTERN_GOOGLE_OAUTH_REDIRECT_URI`, `FINDTERN_GOOGLE_TOKEN_OWNER_ID`, `MEET_CALENDAR_ID` |
| Files | `UPLOAD_ROOT`, `LEGACY_UPLOAD_ROOT`, `STORAGE_BUCKET` (S3; the AWS SDK reads its own `AWS_*` variables) |
| Invoices | `FINDTERN_LEGAL_NAME`, `FINDTERN_GSTIN`, `FINDTERN_BILLING_ADDRESS`, `FINDTERN_BILLING_EMAIL`, `FINDTERN_BANK_NAME`, `FINDTERN_BANK_ACCOUNT`, `FINDTERN_BANK_IFSC` |
| Integrations | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (chatbot), `INCRUITER_WEBHOOK_SECRET` (AI-interview scores), `FIREFLIES_API_KEY`, `FIREFLIES_WEBHOOK_SECRET` (meeting transcripts, admin-only), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web push) |
| Analytics | `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID` |
| Dev and test only | `STAGING_HOSTS`, `STAGING_URL`, `STAGING_DB_HOST`, `STAGING_ALLOW_HOSTS`, `STAGING_LOCAL_DB_URL`, `E2E_PORT`, `E2E_REBUILD`, `E2E_BASE_URL`, `QA_PORT`, `QA_REBUILD`, `QA_GOOGLE`, `SHOTS_ONLY`, `SHOTS_WIDTHS`, `PLAYWRIGHT_CHROMIUM_PATH`, `COLLEGE_DEV_FILE`, `TIMESTAMP_TEST_DATABASE_URL`, `NEON_ENV_FILE` |

`PUBLIC_ORIGIN` is required in production (the build refuses to make links to localhost). `SESSION_SECRET` and `SIGNING_SECRET`
need 32+ random characters. `TRUST_PROXY=1` is needed on any host that is not Vercel and sits behind a proxy (nginx), or every
visitor shares one rate-limit bucket. `src/instrumentation.ts` logs a warning at boot for missing production settings.

## Deploy

Pushing to `master` deploys to Vercel: project `findtern`, live at **https://findtern.vercel.app**. (A second Vercel project, `nextjs-findtern`, also watches this repo but has no environment variables, so its deploys always fail; ignore it.) `vercel.json` is the config; the region is `sin1` (Singapore), next to the Supabase
ap-southeast-1 database.

- `buildCommand`: `node --experimental-strip-types scripts/migrate.ts && next build`. **Every build applies pending migrations
  to the `DATABASE_URL` of that environment**, so check which database an environment points at before deploying.
- `crons` (UTC, one run a day each because the plan is Hobby). All are `GET`, authorised with `CRON_SECRET`; all skip when
  `SCHEDULERS=off` except roster-import-purge:

  | Path | Schedule | What it does |
  |---|---|---|
  | `/api/cron/tick` | 06:00 | Reminders, expiry, notification jobs (only on ticks at 00/06/12/18 UTC, see [Background jobs](#background-jobs)), email outbox |
  | `/api/cron/payment-reminders` | 03:30 | Payment reminder emails |
  | `/api/cron/roster-import-purge` | 04:15 | Deletes expired college roster imports; ignores `SCHEDULERS=off` |
  | `/api/cron/refund-reconcile` | 04:30 | Settles refunds stuck in `initiated` by reading Razorpay. **Does nothing (`{skipped:true}`) unless `REFUND_RECONCILE=1`** and the Razorpay keys are set. Design: `src/lib/refunds/refund-reconcile.ts` |
  | `/api/cron/proposal-expiry` | 18:45 | Proposal and interview expiry sweep |

  `/api/cron/email-outbox` exists (batches of 50, about 30 s) but is **not registered**; `OUTBOX_CRON=off` makes both it and the
  tick's outbox step answer `skipped`. **Vercel env changes apply only on the next deployment**, so turning a switch on or off
  needs a redeploy. Money-cron steps: [`docs/cron-activation.md`](docs/cron-activation.md).

`deploy/` holds the alternative self-hosted setup on a VPS: `backup.sh` (dump and restore-test), `release.sh` (pull, install,
build, migrate, reload PM2), `ecosystem.config.cjs` (one PM2 process, because the in-process schedulers must run once) and
`nginx-findtern.conf`. `docs/launch-checklist.md` has the cutover steps.

After a schema change, run the migration on the target database with the deploy, then smoke-test the key routes on the live URL.

## Security model

- **Writes.** Every mutating route handler starts with `requireMutation({ req, roles, ownerId? })` from
  `src/lib/guards-mutation.ts` (session, role, CSRF and ownership in one call), then validates the body with zod. Allowed
  exceptions: `api/auth/*`, `api/webhooks/*` and the public contact form. The client writes through `csrfFetch`.
- **Money.** Prices, totals and eligibility are computed on the server. Razorpay signatures are verified; settlement is
  atomic and idempotent, so one payment hires exactly the offers it paid for, once (advisory locks, unique indexes).
- **Accounts.** argon2id; rate limits on sign-in, OTP and sign-up; every login route runs a password check even for an unknown
  email (`verifyPasswordOrDummy`, `src/lib/security/password.ts`) so response time does not reveal which emails exist; deactivated
  users lose access on the next request ([Disabling an account](#disabling-an-account)); sessions are revocable.
- **Identity numbers.** The onboarding form is only sent a masked Aadhaar/PAN (`XXXX XXXX 0123`) and masked bank details, never
  the stored number (`src/components/intern/onboarding/id-mask.ts`).
- **Files.** Identity documents are never in a public folder; links are signed, short-lived and checked against the viewer;
  per-type size and format limits (checked against `Content-Length`, and the body size is bounded even when a chunked upload sends
  none, `src/lib/security/upload-rules.ts`); content sniffing; path traversal blocked.
- **Admin.** Permissions on every page and API; audit log; "View as" is read-only and time-limited.
- **Headers.** Set in `next.config.ts`: HSTS (`max-age` one year), a Content-Security-Policy in **report-only** mode (reports go to
  `/api/csp-report`), and the usual frame/type/referrer headers.
- **Checking it.** `src/lib/security/route-surface.test.ts` and `npm run test:security` run in CI; `scripts/security-probe.mjs`
  probes a local server for IDOR, role-boundary, cookie, header, CSRF and CORS problems.

**Open items from the last security audit** (the audit table itself is kept outside this repo):

- CSP is still report-only; enforce it once the reports are clean.
- `TRUST_PROXY=1` must be set on every host that is not Vercel, or rate limits are shared by all visitors.
- HSTS has no `includeSubDomains`, deliberately: every `*.findtern.in` host would first have to serve HTTPS, which has not been checked.
- The session cookie is `ft_sid` with `HttpOnly` and `Secure` over TLS, but does not use the `__Host-` prefix.
- **Never ported from the legacy app:** plaintext passwords, an unauthenticated `/uploads` static folder, the `/api/interns`
  IDOR.

## Performance

These are the levers in place and the goals they serve, not measured results; no latency numbers are recorded in this repo.

- **Region.** Functions run in `sin1`, beside the ap-southeast-1 database, so each query is a short hop (`vercel.json`).
- **Pool.** `src/lib/db/pool-config.ts`: 5 connections per instance on Vercel or behind a transaction pooler, 10 on a long-running
  server, `DATABASE_POOL_MAX` (1 to 20) overrides. Many serverless instances each hold a pool, so small is deliberate. Background
  jobs wait when the pool is busy rather than queueing behind users.
- **One read per request.** Loaders that several components call are wrapped in React `cache()` (for example `getSessionState` in
  `src/lib/auth.ts`, `src/lib/employer-flow.ts`, `src/lib/intern-data.ts`), and the session checks run in one round trip.
- **Indexes** on the foreign keys the dashboards filter by: migrations 0012, 0028-0034 and 0036-0041.
- **Goals.** Signed-in pages should not add queries per row, and nothing should run in a page request that can run in `after()`
  or a cron. Check changes with `npm run check:motion` and the QA suite (`npm run qa`), and measure on a deployment before
  claiming a number.

## Project map

```text
src/
├── app/
│   ├── (marketing)/    public site          ├── intern/     intern app
│   ├── (auth)/         sign-in, sign-up      ├── employer/   employer app
│   ├── blog/ drive/    blog, drive links     ├── college/    TPO console
│   ├── admin/          admin console         └── api/        route handlers
├── components/         UI by area: admin, college, employer, intern, home, marketing, payments, ui, watermelon…
├── lib/                rules and data access (pure files have no DB import so they are unit-testable)
│   ├── score.ts, checkout.ts, billing-plan.ts, dues.ts, payment-reminders*.ts   pricing, plans, dues
│   ├── offer.ts, onboarding.ts, proposals.ts                                     legacy-shaped offers and profiles
│   ├── gst.ts, invoice*.ts, payments.ts, razorpay.ts                             invoices and settlement
│   ├── promo*.ts, college/                                                       promo and college codes, seats, wallet, drives
│   ├── employer-timesheets.ts, timesheet-days.ts                                 timesheets
│   ├── admin/          permissions, roles, audit, payouts, ratings, CMS, reports, CSV
│   ├── security/       sessions, CSRF, passwords, rate limits, signed URLs, file store
│   ├── content/        marketing copy (DB first, built-in fallback)
│   ├── db/             Drizzle schema and client
│   ├── schedulers.ts   in-process interview and notification jobs (SCHEDULERS=on, long-running server only)
│   ├── cron-tick.ts    what /api/cron/tick runs on Vercel
│   └── proposal-expiry*.ts, interview-lifecycle.ts   offer and interview expiry
├── instrumentation.ts  starts the schedulers (long-running server) and prints startup warnings
└── proxy.ts            admin permission gate, sign-in redirects, session renewal
drizzle/                SQL migrations        scripts/    seed, migrate and tooling
e2e/                    browser suites + QA   deploy/     VPS backup, release, PM2, nginx
data/colleges/          AISHE directory       loadtest/   college load tests
docs/                   launch, cron, plans   vercel.json region, crons, build command
```

## Working on it

1. Read the code and `e2e/README.md` first.
2. New write endpoint? Start it with `requireMutation`. Never hand-roll auth checks.
3. Marketing pages read through `src/lib/content` accessors, not the data files directly.
4. Colours and spacing come from the tokens in `src/app/globals.css`; use `container-page` and `section-y`; add UI primitives from the Watermelon registry.
5. Keep employer-facing screens free of intern pay (see Business rules); the regression tests will fail if it leaks.
6. Schema change: generate, read the SQL, commit, migrate the target database.
7. Run the checks under [Before every commit](#before-every-commit).
