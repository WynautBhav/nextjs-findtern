# Plan: merge into master with close to zero bugs (28 Oct 2026)

For the orchestrator (Fable) and the worker sessions (Opus, Sonnet). Read
this first, then `docs/handoff/HANDOFF-nextjs-findtern-9a.md`,
`docs/finish-tracker.md`, `DESIGN.md` §0 and `AGENTS.md`.

## Owner's instructions (28 Oct)
- Merge into master. Work together on end-to-end testing of everything
  **except real payments** (use `PAYMENTS_MODE=free` for flows that need a
  payment).
- **Close to 0 bugs**, tested on phones and other screen sizes.
- Improve the dashboards and their sub-screens: components, feel, space
  use, presentation. "current implementation is weak". Research what top
  designers use; installing skills is allowed (read their source first).
- Re-test whatever changes. Stop only when done. Finish with a full, detailed
  report.
- **Never touch the Hostinger (live) database**, not even read-only dumps.
  Use only the local copy and the Neon staging DB.
- **Don't use `~/Desktop/ftss` screenshots** (stale). Use the legacy code at
  `/home/wynautbhav/FindTern` as the reference.
- **The GitHub repo is PUBLIC.** Never commit IPs, open ports, firewall or
  pg_hba state, or any credentials. Never push
  `backup/launch-blockers-prescrub`.
- **DECIDED (owner, 28 Oct): working hours are a flat 22 (Mon–Fri / Sun–Thu)
  or 26 (Mon–Sat) days a month, as legacy and the marketing calculator do.**
  Commit 0fa5627's calendar-day billing is reverted (WP0 below).

## Current state
- Branch `release/master-merge` = `launch-blockers` @ 57e1c61. Pushed as
  `origin/launch-blockers`. All checks green there: tsc, lint 0 errors,
  test 398, test:security 79, db:verify, build, e2e 19/19.
- `feat/college-partners` (worktree `~/Desktop/findtern-college`, 5 commits
  on top of 55e4b37) is NOT merged. A trial merge gives 10 conflicts,
  because it edited the three old shells that `launch-blockers` replaced
  with `src/components/layout/console-shell.tsx`.
- Databases you may use:
  - local `findtern_live` (27 Oct live copy, migrated to 0007);
  - local seed `findtern` (db:verify);
  - Neon staging (`~/findtern-dumps/.neon.env`; reachable on office wifi).
- The dump `~/findtern-dumps/findtern-live-20261027.dump` can seed a private
  Postgres per session: `initdb` + `pg_ctl` on its own port, as
  findtern-college does on :5433. The local `findtern` role can't
  `CREATE DATABASE`.
- Safe server env for any `next start` (the repo `.env` has the LIVE URL,
  so process env must override it): `DATABASE_URL=<local or neon>`,
  `MAIL_MODE=log`, `SCHEDULERS=off`, `PAYMENTS_MODE=free`, and empty
  `RAZORPAY_*`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1`, `GOOGLE_CLIENT_ID=`,
  `DEEPSEEK_API_KEY=`. Emails land in `logs/mail/<date>.log`.
- Test logins (local `findtern_live`):
  - `ritika.launchtest@gmail.com` / `Launch#2026pw` (hired intern)
  - `neha@acmerobotics-launchtest.in` / `Launch#2026pw` (employer)
  - `e2e-admin@findtern.test` / `E2e#Admin2026` (super admin)
- Existing suite: `DATABASE_URL=<local> npm run e2e` (Playwright, 19
  steps; see `e2e/README.md`). The college branch has its own
  `e2e/college-partners.e2e.mjs`.

## Definition of done (check against this, not against "feels done")
1. 0 open P0/P1 bugs. Every P2 listed with a reason in
   `docs/qa/bug-ledger.md`.
2. Every row of bug sheet 7 (`docs/bug-sheet-7.tsv`, untracked) re-tested
   and marked pass or fail.
3. A crawler of every route for every role (intern, employer, admin,
   college admin, signed out) finds:
   - no error screens, console errors, failed requests or sideways scroll;
   - at 360, 375, 393, 412, 768, 1024, 1280, 1440 and 1920 px;
   - in Chromium + WebKit (+ Firefox smoke).
4. axe (`@axe-core/playwright`): 0 serious or critical issues. A
   keyboard-only pass and reduced motion checked.
5. Lighthouse on the dashboards (mid-range phone, 4G): performance ≥ 85,
   accessibility ≥ 95.
6. Before/after screenshots (390 / 768 / 1440) for every redesigned screen;
   DESIGN.md updated to match.
7. A pull request into master with a GitHub Actions workflow (tsc, lint,
   test, test:security, build, e2e against a CI Postgres) passing. Vercel
   staging (Neon) smoke-tested, including on the owner's phone. Then merge.
8. A report published as a shareable page and saved to
   `docs/release-report.md`. Contents:
   - changes by area, in plain language;
   - the test matrix results;
   - the bug ledger summary;
   - before/after screenshots;
   - axe and Lighthouse numbers;
   - known issues;
   - owner decisions;
   - outstanding launch-day steps:
     - close the database port and rotate the password;
     - Google OAuth URI;
     - the legacy argon2 patch;
     - pricing-plan seeding.

## Work packages, hardest first (difficulty → suggested model)
| # | Package | Difficulty | Notes |
|---|---|---|---|
| WP0 | Revert calendar-day working hours to the flat 22/26 rule | Low | `src/lib/offer.ts` (`scheduledMonthlyHours`, `billableWorkingDays`, `workingDaysInMonth`), its callers in the proposal routes and the two employer forms, and `offer.test.ts`. Owner decision 28 Oct. |
| WP1 | Fold `feat/college-partners` into `release/master-merge` | **High** (judgement, conflicts, a 4th role) | Port the college nav, login and admin pages onto ConsoleShell + DESIGN.md §0. Resolve the 10 conflicts. Its `0007_college_partners.sql` sits beside our `0007_system_*` (different names, both apply). Check its drizzle `meta/_journal.json` + `0005_snapshot.json` against ours. Run the full chain + both e2e suites. Rehearse migrations on the local copy and on Neon (never Hostinger). |
| WP2 | Design upgrade: dashboards + sub-screens (intern, employer, admin, college) | **High** (taste, research, information design) | Research first: reference dashboards (Linear, Stripe, Vercel, Wellfound, Internshala), the Watermelon registry, and the impeccable skills already installed (critique, audit, layout, typeset, polish, adapt, harden); any new skill is read before installing. Per screen, write: user's job / what deserves space / wasted space / table vs card vs detail. Then redesign. Before/after shots. Update DESIGN.md. |
| WP3 | Test harness | Medium | Playwright device-profile matrix, the route crawler (assert no error boundary, console errors, 4xx/5xx or overflow), axe on every page, data situations (empty, one, many, long text, unicode), Lighthouse CI on the dashboards, baseline screenshots. Lives in `e2e/` + `docs/qa/`. |
| WP4 | Full test pass + bug ledger | Medium, volume | Run the matrix and the 135+6+40 bug-sheet rows. Log bugs: ID, severity, steps, trace, screenshot. The tester never edits `src/`. |
| WP5 | Bug fixing | Medium to High (case by case) | Fix by ledger ID, one commit each, re-tested by whoever didn't fix it. Small items left over in HANDOFF §3/§4. |
| WP6 | CI + PR + staging | Medium | `.github/workflows/ci.yml` with a Postgres service; push; open the PR; run migrations on Neon; deploy to Vercel staging; smoke test. |
| WP7 | Fresh-eyes review of the full diff | Medium | A reviewer that built none of it reads `master..release/master-merge` for bugs. Its findings go into the ledger. |
| WP8 | Report + cleanup | Low | Write the report, merge after the owner approves, delete the merged branches and `.claude/worktrees/` (about 8 GB). Keep `feat/college-partners` until it's merged. |

Suggested split (the orchestrator decides):
- High-judgement work (WP1, WP2 design decisions, the tricky WP5 fixes,
  WP7) → the stronger model.
- Volume work (WP3 harness code, WP4 test execution and logging, mechanical
  WP5 fixes, WP6, WP8) → the cheaper model.
- Keep builder and tester different sessions.

## Coordination rules
- One integration branch: `release/master-merge`. Each session works in its
  own git worktree, on its own branch cut from it, and hands merges to the
  orchestrator. No two sessions edit the same file at once; the
  orchestrator assigns file ownership.
- Every commit passes: tsc → lint (0 errors) → test → test:security →
  db:verify → build. UI changes also need a screenshot check at 390 and
  1440. End every commit message with "Co-Authored-By: <model>
  <noreply@anthropic.com>".
- Only one session at a time should run a long `npm run lint` or `build`
  in the main checkout. `.claude/` is already excluded from lint and tsc.
- Ports: give each session its own `next start` port (3100 is the old
  default; the e2e suite uses 3300).
