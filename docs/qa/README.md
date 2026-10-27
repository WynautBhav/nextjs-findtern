# QA harness (`npm run qa`)

Everything here runs against a **local, scrubbed copy** of the data, never the
live database. The repo is public, so nothing in it (screenshots included) may
carry a real person, an address, a port, or a credential.

| File | What it is |
|---|---|
| `e2e/qa.mjs` | `npm run qa`: starts the QA server, runs the steps, stops it |
| `e2e/qa-serve.mjs` | `npm run qa:serve`: the QA server alone, for running one step by hand |
| `e2e/seed-situations.mjs` | `npm run qa:seed`: scrub + data situations + college demo |
| `e2e/crawl.e2e.mjs` | every route × width × role: errors, console, 4xx/5xx, overflow, axe |
| `e2e/keyboard.e2e.mjs` | keyboard-only pass: Tab order, focus indicator, Enter on the critical path |
| `e2e/motion.e2e.mjs` | `prefers-reduced-motion` run of the dashboards |
| `e2e/slow3g.e2e.mjs` | slow-3G + 4x CPU run of the dashboards |
| `e2e/lighthouse.mjs` | Lighthouse CI (mobile preset) on the dashboards → `docs/qa/lighthouse.md` |
| `e2e/baseline.mjs` | screenshots of every route at 390 / 768 / 1440 → `docs/qa/baseline/` |
| `docs/qa/bug-ledger.md` | every defect, with ID, severity, steps, trace, screenshot |
| `docs/qa/bug-sheet-7-results.md` | pass / fail for every row of bug sheet 7 |
| `.github/workflows/ci.yml` | tsc, lint, test, test:security, migrate, seed, build, e2e on a Postgres service |

`npm run e2e` (the 19-step critical path) is separate and unchanged; see
`e2e/README.md`. CI runs it.

## One-time setup

1. A private Postgres (no root needed), restored from a dump you already hold:

   ```bash
   initdb -D ~/findtern-qa-pgdata -U findtern --auth=trust -E UTF8
   pg_ctl -D ~/findtern-qa-pgdata -o "-p 5435 -k /tmp -c listen_addresses=127.0.0.1" -l ~/findtern-qa-pgdata/server.log start
   export PGHOST=127.0.0.1 PGPORT=5435 PGUSER=findtern
   createdb -d postgres findtern_live          # pristine copy
   pg_restore -d findtern_live --no-owner ~/findtern-dumps/<dump>.dump
   DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_live npm run db:migrate
   ```

2. The QA database is a template copy of that, so it can be rebuilt in seconds:

   ```bash
   psql -d postgres -c "DROP DATABASE IF EXISTS findtern_qa" -c "CREATE DATABASE findtern_qa TEMPLATE findtern_live"
   export DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa
   npm run qa:seed
   ```

   `qa:seed` (a) replaces every real name, email, phone, Aadhaar, PAN, bank
   detail, notification text, payment payload, OTP and OAuth token in the copy
   with synthetic values, (b) creates the situation accounts below, (c) runs
   `scripts/seed-colleges.ts` and links the personas into the demo drive. It is
   idempotent. Re-run after migrating a new schema. Migrate `findtern_live`
   first, then recreate `findtern_qa` from it, never the other way round.

3. Browsers: `npx playwright install chromium firefox webkit`. On a distro
   Playwright does not support, WebKit may need libraries it was built against;
   CI uses `--with-deps` on Ubuntu.

Every script refuses a `DATABASE_URL` whose host is not loopback.

## Running

```bash
export DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa
npm run qa                       # all steps; builds first if .next is missing
QA_REBUILD=1 npm run qa          # rebuild first; do this after any src/ change
npm run qa -- crawl --quick      # one step; --quick = 375 and 1440 only
npm run qa -- crawl --browsers=chromium --only=/admin/ --personas=admin
npm run qa -- lighthouse         # LH_RUNS=3 by default
npm run qa -- baseline --out=docs/qa/after
```

The server listens on `QA_PORT` (3500). Its environment is fixed: `MAIL_MODE=log`
(mail lands in `logs/mail/`), `PAYMENTS_MODE=free`, `SCHEDULERS=off`, Razorpay,
Google, SMTP and DeepSeek keys empty, `TRUST_PROXY=1` (so each login can carry its
own `X-Forwarded-For` and does not share the 8-logins-per-15-minutes bucket).
Process env beats the repo `.env`, which may hold the live URL; a canary row proves
the server reads the QA database before anything runs.

Output goes to `e2e/.artifacts/qa/<step>/` (git-ignored): `report.md`,
`results.json`, and for the crawler a screenshot and a Playwright trace per
failing page × width (`trace: retain-on-failure`; open with
`npx playwright show-trace <zip>`).

## What the crawler covers

- **Routes**: every `src/app/**/page.tsx`, so a new page is picked up by itself.
  Dynamic segments use real ids from the database (a persona's own proposals,
  timesheets, drives, interns, companies…). The first id runs at every width;
  extra ids (more data situations) at 375 and 1440.
- **Roles**: signed out, intern, employer, admin, college admin. Signed-out
  visits the public set (marketing + auth pages). A role visits its own routes.
  The access probe sends signed-out and each role to every *other* role's static
  routes and fails if one renders.
- **Widths**: 360, 375, 393, 412, 768, 1024, 1280, 1440, 1920 for the main
  personas; 375 / 768 / 1440 for the situation accounts. Chromium everywhere;
  WebKit at 375 and 1440; Firefox at 1440. Widths ≤ 768 use touch + mobile emulation
  (Chromium, WebKit).
- **Per page**: no Next error boundary or "Something went wrong", no blank page,
  no console error or uncaught exception, no 4xx/5xx or failed request from our
  origin, `scrollWidth <= innerWidth + 1` (the three widest elements are named),
  and axe (WCAG 2.0/2.1 A + AA) with 0 serious or critical.

Flags: `--quick`, `--browsers=`, `--personas=`, `--widths=`, `--only=<route substring>`, `--no-axe`.
`QA_TRACE=0` turns traces off; `QA_CONCURRENCY` (default 4) sets parallel contexts.

## Data situations

Created by `qa:seed`, all with password `Qa#Situations2026` unless noted
(`e2e/lib/personas.mjs` is the list):

| Persona | Situation |
|---|---|
| `intern-hired` (`ritika.launchtest@…`, `Launch#2026pw`) | complete profile, hired, approved + draft timesheet, payout, drive member |
| `employer-main` (`neha@acmerobotics-launchtest.in`, `Launch#2026pw`) | 2 projects, offers sent/accepted/hired, interviews in each state, cart, drive calls with and without a link |
| `admin` (`e2e-admin@findtern.test`, `E2e#Admin2026`) | super admin |
| `college` (`tpo@jklu.edu.in`, `Findtern@2026`) | placement officer, 72-student roster, live drive |
| `intern-empty` | account only: no onboarding row |
| `intern-one` | one skill, one proposal, one interview, one notification |
| `intern-heavy` | 60 skills, 12 experiences, 52 proposals, 52 interviews, 52 payouts, 120 notifications |
| `intern-longtext` | ~200-character names, Hinglish, emoji, CJK/Arabic text |
| `intern-lowscore` | score 4.5, approval Pending (below 6, not listed to employers) |
| `intern-hidden` | `profile_visibility = hidden` |
| `employer-empty` | onboarding done, nothing else |
| `employer-one` | one project, one proposal, one interview |
| `employer-heavy` | 55 projects, 55 proposals, 55 interviews, 50 cart/shortlist items, 120 notifications |
| `employer-usd` | US company, USD offers |
| `employer-longtext` | ~200-character company, contact and project names |

## Reading results

`report.md` groups repeats: the same persona, route, kind and message at several
widths is one row with the width list. A row is a defect candidate; confirm it
(re-run `--only=<route> --personas=<key> --widths=<w>`, open the trace), then
log it in `bug-ledger.md`. Known environment limits (not defects) are listed at the
top of the ledger.

## Not covered here

Real payments (`PAYMENTS_MODE=free` throughout), Google OAuth and Calendar (the
keys are empty), live SMTP, the legacy argon2 path on the real server.
