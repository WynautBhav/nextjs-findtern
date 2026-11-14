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
[Architecture](#architecture) · [Run it locally](#run-it-locally) · [Scripts](#scripts) · [Database and migrations](#database-and-migrations) ·
[Tests](#tests) · [Environment variables](#environment-variables) · [Deploy](#deploy) · [Security model](#security-model) ·
[Project map](#project-map) · [Working on it](#working-on-it)

## Read this first

- This is **not** the Next.js you know: read `node_modules/next/dist/docs/` before changing framework-level code.
- `docs/`: launch checklist, cron activation, college-partner notes, plans.

**Hard rule for anyone touching data:** never point a script, test or dev server at the live production database
(the `DATABASE_URL` in the main checkout's `.env`). Use a local Postgres or the Neon staging database, and pass
`DATABASE_URL` explicitly on every database command so nothing falls back to a `.env` file.

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
| Intern | `intern/` | Candidates | Eight-step onboarding, activation, AI interview request, offers and interview slots, timesheets, bank details, earnings, documents, college membership, notifications |
| Employer | `employer/` | Hiring teams | Company setup, projects, candidate search, shortlist and compare, interviews, offers, cart and checkout, orders and invoices, timesheet approval, full-time offers, campus drives |
| College / TPO | `college/` | Placement officers | Roster upload, students, drives with employer links, seats and invoices, wallet earnings and withdrawals |
| Admin | `admin/` | Staff | Dashboard queues, interns (ratings, approval, skills, documents), companies, orders, payouts, transactions, promo codes, colleges, CMS and website content, terms and NDA, reports and CSV exports, messages, notifications, roles, audit log, "View as" (read-only impersonation) |

`src/app/api/` holds the route handlers (`auth`, `intern`, `employer`, `college`, `admin`, `proposals`, `interviews`,
`timesheets`, `uploads`, `webhooks`, `cron`, and others). There is also `.well-known/security.txt`, `llms.txt`, a sitemap and
robots routes.

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

### Sessions and revocation

Sessions are HMAC-signed cookies with a CSRF double-submit token: 12-hour idle window, renewed while active, 30-day hard
maximum (`src/lib/security/session.ts`, renewed in `src/proxy.ts`). Logout writes the session id to `revoked_sessions`
(`revokeSession` in `src/lib/account-status.ts`) so a stolen cookie stops working before it expires; expired rows are pruned on
write. Impersonation sessions last one hour.

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
        J[Schedulers and cron<br/>reminders and nudges]
    end

    DB[(Postgres)]
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
| Data | Postgres with Drizzle ORM; plain-SQL migrations in `drizzle/` |
| Auth | argon2id passwords, signed session cookie, CSRF token, per-IP rate limits |
| Payments | Razorpay over `fetch`, signed webhook at `/api/webhooks/razorpay` |
| Google | OAuth, Calendar and Meet, Drive over `fetch` |
| Email | Nodemailer over SMTP; `MAIL_MODE=log` writes to `logs/mail/` instead |
| Styling | Tailwind v4, design tokens in `src/app/globals.css`; UI primitives from the Watermelon registry (`components.json`) |
| Motion | GSAP, Motion and Lenis, reduced-motion aware |

## Run it locally

Needs Node 20+ and a local Postgres with a `findtern` role (the npm scripts assume
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

Locally, emails are written to `logs/mail/` (not sent), schedulers stay off, and Razorpay is off unless you add test keys.
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
`report-lost-completion-bonus.ts` (read-only report), `shots.ts` and `design-shots.mjs` (screenshots), `legacy/`
(an argon2 compatibility patch for the legacy app).

### Before every commit

```bash
npx tsc --noEmit && npm run lint && npm test && npm run db:verify
```

Add `npm run test:security` and `npm run build` when you touch auth, sessions or anything that affects the build.

## Database and migrations

- Schema: `src/lib/db/schema.ts` (Drizzle). Migrations: `drizzle/0000_…` through `drizzle/0017_revoked_sessions.sql` (there are two
  `0007_` files; they apply in filename order). `scripts/migrate.ts` reads the folder, applies each file once, records it in
  `_ft_migrations`, never drops anything, then runs `scripts/legacy-backfill.sql`.
- Recent additions: college partners and seats (0007, 0008, 0016), promo usage and college codes (0009, 0010), terms acceptance
  (0011), money checks and college ban (0013, 0014), cleared strike prices (0015), revoked sessions (0017).
- Workflow: change `schema.ts`, run `npm run db:generate`, **read the generated SQL**, commit it, then run `db:migrate` on the
  target database with the deploy. Migrations only add.
- The database was inherited from the legacy app, so some tables hold legacy JSON shapes. Go through `src/lib/offer.ts` for
  offers and `src/lib/onboarding.ts` for profiles; never read those JSON columns directly.
- Local databases by convention: dev on `localhost:5432/findtern`, e2e on `localhost:5433/findtern_e2e`, QA on `5435/findtern_qa`.

## Tests

- **Unit** (`npm test`): pricing and bands, checkout, billing plans, dues and reminders, GST and invoices, offers, guarantee,
  promo and college rules, timesheets, payouts, permissions, audit labels, session lifecycle and revocation, redaction.
  Pure rules live in files with no database import so `node --test` can run them.
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, tests, security tests, migrate, seed, build and the e2e critical path on a Postgres service.
- **E2E and QA** (`e2e/`): browser suites with Playwright and `node:test`. `e2e/README.md` documents the critical path and the
  safety rules. All of them refuse a non-local database, except the staging journey, which
  is limited to the Neon staging host and a Vercel preview URL.

## Environment variables

Names only. `.env.example` lists each one with a comment; real values stay in untracked `.env*` files or the host's settings.

| Group | Variables |
|---|---|
| Core | `DATABASE_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `PUBLIC_ORIGIN`, `SESSION_SECRET`, `SIGNING_SECRET`, `TRUST_PROXY`, `RATE_LIMIT_BYPASS_IPS`, `PASSWORD_UPGRADE`, `TZ` |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENTS_MODE`, `PAYMENTS_TEST_BUTTON` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `MAIL_MODE`, `ADMIN_ALERT_EMAIL` |
| Jobs | `SCHEDULERS` (`on` on exactly one server for the in-process schedulers), `CRON_SECRET` (bearer token for every `/api/cron/*` route), `REFUND_RECONCILE` (`1` turns the refund reconcile cron on; default off), `REFUND_RECONCILE_MIN_AGE_MINUTES` (default 30), `OUTBOX_CRON` (`off` skips the email-outbox cron; default on) |
| Google | `GOOGLE_LOGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `FINDTERN_GOOGLE_OAUTH_REDIRECT_URI`, `FINDTERN_GOOGLE_TOKEN_OWNER_ID`, `MEET_CALENDAR_ID` |
| Files | `UPLOAD_ROOT`, `LEGACY_UPLOAD_ROOT`, `STORAGE_BUCKET` (S3; the AWS SDK reads its own `AWS_*` variables) |
| Invoices | `FINDTERN_LEGAL_NAME`, `FINDTERN_GSTIN`, `FINDTERN_BILLING_ADDRESS`, `FINDTERN_BILLING_EMAIL`, `FINDTERN_BANK_NAME`, `FINDTERN_BANK_ACCOUNT`, `FINDTERN_BANK_IFSC` |
| Integrations | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (chatbot), `INCRUITER_WEBHOOK_SECRET` (AI-interview scores), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web push) |
| Analytics | `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID` |
| Dev and test only | `STAGING_HOSTS`, `STAGING_URL`, `STAGING_DB_HOST`, `STAGING_ALLOW_HOSTS`, `STAGING_LOCAL_DB_URL`, `E2E_PORT`, `E2E_REBUILD`, `E2E_BASE_URL`, `QA_PORT`, `QA_REBUILD`, `QA_GOOGLE`, `SHOTS_ONLY`, `SHOTS_WIDTHS`, `PLAYWRIGHT_CHROMIUM_PATH`, `COLLEGE_DEV_FILE`, `TIMESTAMP_TEST_DATABASE_URL`, `NEON_ENV_FILE` |

`PUBLIC_ORIGIN` is required in production (the build refuses to make links to localhost). `SESSION_SECRET` and `SIGNING_SECRET`
need 32+ random characters.

## Deploy

`vercel.json` is the Vercel config:

- `buildCommand`: `node --experimental-strip-types scripts/migrate.ts && next build`. **Every build applies pending migrations
  to the `DATABASE_URL` of that environment**, so check which database an environment points at before deploying.
- `crons`: all are `GET` and authorised with `CRON_SECRET`; all skip when `SCHEDULERS=off` except roster-import-purge. Region `cle1`.
  - `/api/cron/payment-reminders` daily at 03:30 UTC (09:00 IST): sends the payment reminders.
  - `/api/cron/email-outbox` is **not registered** yet (route, drain loop and `OUTBOX_CRON` switch are in place). Enabling it
    is a follow-up, see `docs/cron-activation.md`. It sends queued campaign mail in batches of 50 until nothing is due or ~30 s
    are used.
  - `/api/cron/refund-reconcile` daily at 04:30 UTC: settles refunds stuck in `initiated` by reading Razorpay. **Does
    nothing (`{skipped:true}`) unless `REFUND_RECONCILE=1`** and the Razorpay keys are set. Read-only towards Razorpay.
    Design and invariants: `src/lib/refunds/refund-reconcile.ts`.
  - `/api/cron/roster-import-purge` daily at 04:15 UTC: deletes expired college roster imports. Ignores `SCHEDULERS=off`.
  - `/api/cron/email-outbox` (once registered) also answers `{skipped:true}` when `OUTBOX_CRON=off`.
  - **Vercel env changes apply only on the next deployment**, so turning a switch on or off needs a redeploy. Step-by-step
    activation and turn-off: [`docs/cron-activation.md`](docs/cron-activation.md).

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
- **Accounts.** argon2id; rate limits on sign-in, OTP and sign-up; deactivated users lose access immediately; sessions are
  revocable.
- **Files.** Identity documents are never in a public folder; links are signed, short-lived and checked against the viewer;
  per-type size and format limits; content sniffing; path traversal blocked.
- **Admin.** Permissions on every page and API; audit log; "View as" is read-only and time-limited.
- **Headers.** A Content-Security-Policy (report-only for now, reports go to `/api/csp-report`) is set in `next.config.ts`.
- **Never ported from the legacy app:** plaintext passwords, an unauthenticated `/uploads` static folder, the `/api/interns`
  IDOR.

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
│   └── schedulers.ts   in-process interview and notification jobs (SCHEDULERS=on)
├── instrumentation.ts  starts the schedulers and prints startup warnings
└── proxy.ts            admin permission gate, sign-in redirects, session renewal
drizzle/                SQL migrations        scripts/    seed, migrate and tooling
e2e/                    browser suites + QA   deploy/     VPS backup, release, PM2, nginx
data/colleges/          AISHE directory       loadtest/   college load tests
docs/                   audits, QA, plans     vercel.json crons and build command
```

## Working on it

1. Read the code and `e2e/README.md` first.
2. New write endpoint? Start it with `requireMutation`. Never hand-roll auth checks.
3. Marketing pages read through `src/lib/content` accessors, not the data files directly.
4. Colours and spacing come from tokens in `src/app/globals.css`; use `container-page` and `section-y`; add UI primitives from the Watermelon registry.
5. Keep employer-facing screens free of intern pay (see Business rules); the regression tests will fail if it leaks.
6. Schema change: generate, read the SQL, commit, migrate the target database.
7. Run the checks under [Before every commit](#before-every-commit).
