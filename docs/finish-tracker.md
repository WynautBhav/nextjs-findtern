# Finish tracker: flawless look + full functionality

Started 27 Oct 2026. Launch is delayed until this is done. The owner reviews
at the end, with no checkpoints in between.

Branch: `launch-blockers` (continues from the launch triage). Separate
branch, not to be touched: `feat/college-partners` (worktree
`~/Desktop/findtern-college`). The restyle will need merging into it later.

## Scope (owner, 27 Oct)
1. **Look:** the signed-in app matches the marketing site (same type scale,
   brand green + amber, same logo/header feel), following `DESIGN.md`
   (plan of 8 Oct, with the owner's decisions recorded there).
2. **Functionality:** everything legacy (`/home/wynautbhav/FindTern`) has,
   i.e. every OPEN item in `LEGACY_PARITY_REPORT.txt`, plus every row of
   bug sheet 7 (`~/Downloads/Findtern New - Bugs(7).xlsx`: Sheet1, Sheet2,
   NEW CHANGES).
3. **Product decisions:** what the bug sheet says. Where it is silent,
   legacy behaviour (parity first).

## Decisions taken from bug sheet 7
| Topic | Rule | Source |
|---|---|---|
| Profile hiding | 30-day limit stays; explain it on the Guaranteed Internship page | S1 r13 |
| Declines | 3+ declined offers → not eligible for refund; keep the rule and add it to the guarantee's "does not cover" | NC r7 |
| Timezone | Employer timezone from location (profile, booking, proposal); intern always sees IST, with DST handled | S2 r3, r7 |
| Booking slots | Next quarter hour, then +1 h and +2 h (12:34 → 12:45, 1:45, 2:45) | S2 r2 |
| Aadhaar image | **Mandatory** (overrides the older S1 r45) | NC r18 |
| Work mode | Only the picked chip is shown as selected; the implied set is still stored | NC r20 |
| Skill suggestions | Mix of tech and non-tech, not non-tech only | NC r19 |
| Dates | DD/MM/YYYY everywhere; one date picker | NC r24 |
| Bank details | Asked on the About step; bank name is a dropdown | NC r25, r27 |
| Marksheet upload | Optional | NC r26 |
| City / state / country | Dropdowns everywhere (intern + employer onboarding, project) | NC r22, r37, r38 |
| Candidate photos | Hidden from employers (initials) | NC r41 |
| Emails | Intern-facing communicate@, employer-facing admin@ (the coffee hero goes to admin@) | NC r8, r10, r11 |
| In-app FAQ / contact | Links from the app (intern + employer) | NC r29, r39 |
| "Ask me" chat launcher | Bigger, with a prompt bubble | NC r30, r40 |
| Logo | Real logo everywhere, larger | NC r2, r31, r32 |
| Sidebar | Collapsible with an arrow | S2 r4 |
| Not covered by the sheet | Legacy rule: no "Leave" day status (INW-05); a timesheet can be sent once every day is filled (INW-24); interns can withdraw a submitted sheet (INW-18); ops roles get interns:write (ADP-17); analytics on signed-in pages (SYS-04); a saved meeting link marks the meeting scheduled (ADP-07); city filter on preferred cities (EMB-15); sessions extend while active (INT-38) | parity |
| Config, not code | Google `redirect_uri_mismatch` and "account creation nhi hora" on Vercel: register the Vercel OAuth URI; staging `MAIL_MODE=log` means no OTP mail | NC r16, r17 |

## Phases
- [ ] **F0 Foundations**: one card, one status map, `ui/button`, delete the
      local primitives, tokens, empty states (DESIGN.md §2)
- [x] **F1 One shell** (`8ea52ba`): intern / employer / admin on one shell; real logo;
      collapsible sidebar; one breakpoint (lg); marketing-matched header
- [ ] **F2 Loading / empty / error**: `loading.tsx` per segment, no bare
      `catch {}`
- [ ] **F3 Tables**: one DataTable
- [ ] **B7 Bug sheet 7**: every row (checklist below)
- [ ] **P-INT / P-INW / P-EMB / P-EMH / P-ADP / P-ADM / P-SYS / P-DB**: parity
      items per area
- [ ] **F4–F6** Admin / employer / intern screens, redesigned on the system
- [ ] **F7** Motion + dark mode
- [ ] **F8** Polish: screenshots on desktop + mobile, a11y, reduced motion
- [ ] **V** Full browser run of every role, all checks, new go/no-go

## Log
- 27 Oct: tracker created. Bug sheet 7 parsed (S1 135 rows, S2 6, NC 40,
  13 screenshots mapped).
- 27 Oct: F1 done in `8ea52ba`: ConsoleShell for all roles (real logo,
  collapsible rail, one top bar, help links, cart badge), LogoMark, PageHead
  / HeroBand / StatTile, intern home rebuilt as the reference, DESIGN.md §0
  rules. Four workers then started in parallel worktrees: intern, employer,
  admin, public+auth+system. Each does its area's screens, parity items and
  bug-sheet rows. I merge, review and verify.
- 27 Oct: public/auth/system merged (`39f7511`; 50b0bbf, 189c438, 93df790,
  migration 0007_system_users_created_at). All checks + build green; 0007
  rehearsed on the live copy.

## Integration to-do (after the area branches merge)
- [ ] INT-05: intern onboarding emergency / second-contact checks →
      `phoneInUseAnywhere(cc, phone, { userId })` (src/lib/phone-owner.ts)
- [ ] DB-16: `api/intern/[id]/ai-interview/apply` notification insert →
      `onConflictDoNothing`
- [ ] EMH-32: employer escalation phone save → `phoneInUseAnywhere(..., { employerId })`
- [ ] Employer signup form carries `?next=` after signup
- [ ] DB-28 (cosmetic, `api/admin/google`): Google token scope literal
- [ ] Merge `peer/fixes` (College Partners session): safeNext open-redirect
      fix, `dbTimestamp` helper, Playwright critical-path e2e
- [ ] Confirm `/interns` full-page capture "blank boxes" is only the
      scroll-reveal in screenshots, not real (check with reduced motion)
- 27 Oct: merged employer (5 commits), admin (7 commits) and peer/fixes
  A+B (open-redirect fix, dbTimestamp). HEAD c450990: tests 361/361,
  security 79/79, build green. Waiting on the intern worker and the peer's
  e2e suite (C). The admin worker's out-of-scope list is in
  docs/handoff/HANDOFF-nextjs-findtern-9a.md §3.
- 27 Oct: **end-to-end suite green on the merged, restyled build.** `npm run e2e`
  against `findtern_live` (447 users, migrated 0000–0007): 19/19, every step
  asserting DB rows and emails. Seven suite assumptions were stale, not product
  bugs — all corrected in the suite:
  - intern signup needs a personal domain (legacy allowlist, `shared/schema.ts:9`);
  - a project needs 4–7 skills (legacy);
  - onboarding has two steppers (desktop + `lg:hidden`), so `.first()` was hidden;
  - Aadhaar image is mandatory (bug sheet 7, NC r18);
  - "Request my AI interview" is now "Apply for the AI interview";
  - "Choose this" is now "Pick this time";
  - payout create takes `scheduledFor` as `YYYY-MM-DD` and `opsNote`.
  Verified by the run: password stored as argon2 (never plaintext), OTP consumed,
  uploads re-encoded to WebP, score 8.0 → ₹200/hr, monthly amount in rupees not
  paise, offer email never names the company, no company name reaches the intern
  before hire, timesheet approval notifies, stipend email sent.
- 27 Oct: **working hours now come from the calendar** (`workingDaysInMonth`,
  `scheduledMonthlyHours(schedule, leaves, monthRef)`). Mon–Sat October 2026 is
  27 working days (216 h), February 2026 is 24 (192 h); the flat 26-average
  charged both 208 h. Wired to the offer's start month in offer creation, offer
  edits, and both composer previews; no date → published average (unchanged).
  Deliberate limit: later instalments still bill the figure in the accepted
  offer (legacy reads the same field); month-by-month instalments are a policy
  change, not done.
- 27 Oct: reviewed the owner's follow-up list (book meeting, timezone, sidebar,
  open-roles initials, "ask for a new one", IST/DST, calendar hours, redirect
  after send, proposal gate during interview). Nine of ten were already shipped
  by the area merges; only calendar hours was missing. Evidence per item above
  in the code: `suggestedSlots`, `timezoneForLocation`, `ConsoleShell`,
  `CompanyInitials`, `slot-picker`, `format.test.ts` DST pins,
  `send-proposal-form` redirect, candidate page + cart + API 409 gate.

## Open findings from the e2e pass
- [ ] **`pricing_plans` is empty on the migrated live DB** (legacy never had the
      table; only `scripts/seed.ts` fills it). Pricing correctly falls back to
      the published bands (`lib/score.ts`), but Admin → "Pricing and fees" will
      render empty until the rate card is seeded on production. Decide whether
      to seed it at cutover or leave the bands as the only rate card.
- [ ] A local `.env` still points at the production database; the e2e refuses it, but any
      `next start` must override env in-process.
- 28 Oct: owner decisions: merge into master with close to 0 bugs on every
  screen size, redesign the dashboards, no Hostinger DB access (local copy +
  Neon only), no ftss screenshots, flat 22/26-day working hours (calendar
  billing reverted). Orchestration moved to docs/handoff/PLAN-master-merge.md:
  Fable orchestrates on `release/master-merge`; Opus session
  (nextjs-findtern-6a) does WP1 college merge + WP2 design on `wp/opus`;
  Sonnet session (nextjs-findtern-1a) does WP3 harness, WP4 test pass and
  WP6 CI on `wp/qa`.
- 28 Oct: WP1 merged (`a2b8de1`): College Partners is in, the college role
  runs on ConsoleShell, migrations 0000–0007 (both 0007 files) rehearsed on
  a fresh 27 Oct copy. Found by Opus: `src/lib/college/meetings.ts` hands out
  a Jitsi stand-in link only when NODE_ENV != production, so a production
  build without the Google calendar token gives accepted campus-drive calls
  NO join link. Launch-day item: connect the calendar (`CALENDAR_TOKEN_OWNER`)
  before the first drive, and QA-log it as P1 if the UI shows an empty link.
- 28 Oct: QA-001 fixed (`b981263`, merged): a drive call is refused when no
  Meet link can be made; the admin dashboard's attention band shows
  "Google calendar not connected". On Vercel staging (no Google config, prod
  mode) that warning is permanent and expected.
- 28 Oct: WP3 harness merged (`e1cf091`); QA-001 closed by the tester;
  QA-002 (CountUp hydration mismatch under reduced motion, also hit
  /intern/record) fixed in `db3cafe`, awaiting retest. GitHub refused the
  branch push: the gh token lacks the `workflow` scope needed for
  .github/workflows/ci.yml; owner runs `gh auth refresh -s workflow`.
  Environment-only (not bugs): uploads 404 on local copies; admin login
  rate-limits after ~3 rapid logins per IP.
- 28 Oct: the first tester session exited after WP3 (harness merged, QA-001
  closed; its QA-002 retest check merged as `cc0b76b`). A new Sonnet session
  (nextjs-findtern-48) took over as tester with a private QA Postgres on
  :5436 (findtern_qa, migrated 27 Oct copy) prepared by the orchestrator.
- 28 Oct (after an ~8 h orchestrator gap): merged Tester A (QA-002 closed
  on retest), Tester B (QA-003..016 reproduced with steps/traces; QA-007 is
  three causes, one a real SQL defect in admin/companies; bug sheet 7 walked:
  147 pass, 1 fail, 18 unclear, 16 n/a; QA-100..117 from the 375 px pass,
  three P1: header overflow, employer-signup phone field, Ask-me covering
  inputs), and the builder's WP2 employer group (FilterTabs, RowMenu,
  aligned rows, Ask me in the top bar; slop scan 0 hits; approved with two
  density notes). HEAD f58fb33: tsc, lint 0 errors, test 426, security 100,
  build green. Tester A session 5a exited; 5b took over its worktree. The
  orchestrator's own QA Postgres on :5436 was removed (tmp filesystem full).
  Ledger: 34 entries, 2 closed, 7 P1 open.
- 28 Oct (morning): master is the integration line and is pushed to GitHub
  after every verified merge (owner decision; `release/master-merge` kept
  equal to it as the rebase target). The push had been blocked by a broken
  gh keyring (four entries incl. a nameless one; git's helper pointed at a
  removed gh 2.100.0). Fixed by logging out all accounts, clearing the
  keyring, one fresh `gh auth login -s workflow`; GitHub confirms
  WynautBhav with `workflow`. First pushes: 0cb5433, c6cff74 (CI now also
  runs on master), 2a90cef. Vercel staging rebuilt from master.
  Merged today: QA-007 (3 causes), QA-100/101/102, QA-003 (masked identity,
  audited reveal), QA-009, QA-016; Tester B closed six of them, reopened
  QA-016 (hint vs validator), logged QA-118 (P1, drives overflow at 375) and
  QA-119..136 from the employer redesign pass. Ledger: 6 P1 closed, 4 P1
  open, 38 P2 open. Opus on the admin group; Tester A (5b) stuck on a prompt.
- 28 Oct: **staging /admin/colleges errored**: Neon was at migration 0005
  while the code expected 0007 (the college tables didn't exist). Ran
  db:migrate against Neon (dry run in a rollback first; 0006, both 0007s and
  the backfill applied; 9 rows in _ft_migrations). `vercel.json` now runs
  `scripts/migrate.ts` before `next build` (`afe01c7`), so a deploy can never
  run ahead of its schema again. CI: first master run failed only because
  `test:security` passed a directory to `node --test` (Node 24 on the
  runner); fixed with a glob in `750824f`.
- 28 Oct (late morning): admin group complete (part 1 + part 2 + polish,
  105 shots at 390/768/1440, slop scan 0; reviewed and approved: one focal
  number + attention band first, tables fit 1440, inline row actions, real
  pagination). Tester B closed 18 of 19 retests (QA-133 harness-side open,
  QA-126 narrowed), resolved the 18 unclear bug-sheet rows, logged QA-137/
  138/139 and 12 owner questions (docs/qa/owner-questions.md). QA-139
  re-graded P1 by the orchestrator (Pay opens a different hire's checkout).
  CI on 6c4b000 failed only on the e2e Approve step: QA-132 added an inline
  confirm; suite updated in b8240a8. Ledger: 6 P1 closed, 7 P1 open (3 fixed
  awaiting retest + QA-139 + 3 older), ~22 P2 open after the retest wave.
- 28 Oct (midday, new orchestrator session wynautbhav-f3): Tester B's
  retests merged (`25aa398`: QA-139 and QA-112 closed, QA-003/009/016
  re-verified; bug sheet 7 now 153 pass, 2 fail, 11 unclear, 16 n/a).
  The orchestrator fixed the two unassigned employer-side P1s itself:
  QA-005 (approval refused with 409 while any day has no status; Approve
  disabled with the reason) and QA-006 (drive signup carries `next` and
  returns to the drive), and the QA-133 seed vocabulary; merged as
  `dc941df`, chain green (tsc, lint 0 errors, test 433, security 101,
  db:verify, build), pushed. QA-004 handed to Opus inside the intern
  group. Open P1 now: QA-004 (Opus), QA-005/006 (awaiting retest),
  QA-111 (needs a real Safari), QA-137 and QA-138 (both wait on owner
  answers 9 and 10 in docs/qa/owner-questions.md).
- 28 Oct (late morning): QA-005, QA-006 and QA-133 closed by Tester B on
  dc941df. QA-150 (soft 404 on unknown drive tokens, also blog slugs) took
  two attempts: a metadata-time lookup could not set the status (metadata
  streams), so the root `loading.tsx` is gone and only the four consoles
  keep a loading boundary; verified 404 locally on a production build.
  The local e2e Postgres on :5433 was migrated to 0007 (it lacked the
  college tables). Master pushed; Tester B retests QA-150 then waits for
  the intern merge.
