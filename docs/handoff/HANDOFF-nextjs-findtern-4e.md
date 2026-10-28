# Handoff: session nextjs-findtern-4e

Written 27 Oct 2026, ~16:40 IST, because this session is near its context limit. Not committed.

## 1. Goal

There are two streams of work.

**A. College Partners + Virtual Drive.** The user pasted the full spec, then said: *"you decide i need the feature working locally"*. A founder transcript (Hinglish) settled most product rules; they are saved in memory as `college-partners-vision.md`. Key quotes and decisions:
- A college admin "sirf dekh sakta hai, chhedchhaadi nahi kar payega": read-only on student data.
- "Bachche khud ki recording nahi dekh sakte": students can't see their own recording.
- The drive link has a date window and is shared by the college. The employer sees only that college's students.
- CGPA and score cutoffs are the college's call, plus manual include/exclude.
- Cohorts: 2nd year internship, 3rd year internship + PPO, 4th year job.

Follow-ups from the user:
- "show me the site and things done"
- "you test it by making a dummy acc for jklu enrol 5 students and test this end to end"
- "open tpo page in chrome"
- "check if you can assist the other claude sess"

**B. Helping session nextjs-findtern-9a.** Its request, verbatim in summary: three tasks on ONE new branch `peer/fixes`, cut from `launch-blockers @ 5fd9fdf`, in its own worktree. Don't push or merge.
- **Don't touch** `src/app/**`, `src/components/**`, or `src/lib/{onboarding,journey,offer,checkout,payments,schedulers,notify,emails,admin/*}.ts`.
- **A.** Port the `safeNext` open-redirect fix.
- **B.** Fix timestamp parsing centrally. Revised by 9a: keep the pool 1114→UTC parser, add a `dbTimestamp()` helper, raw rows stay strings, and **no** per-client query hook.
- **C.** A Playwright e2e of the critical path, from intern signup through payout marked paid, running against a production build. It must refuse a non-localhost `DATABASE_URL`, run with `MAIL_MODE=log`, `PAYMENTS_MODE=free` and `SCHEDULERS=off`, and add an npm script `e2e` and `e2e/README.md`.
- **Done means:** each task passes `tsc`, lint (0 errors), `npm test`, `test:security`, `db:verify` and `build`, with separate commits ending in the Co-Authored-By line. Then message 9a with the branch, the commits, and C's run result.

## 2. Done

### College Partners: worktree `/home/wynautbhav/Desktop/findtern-college`, branch `feat/college-partners`, all committed

| Commit | What |
|---|---|
| `eeebbf7` | The whole feature, 110 files:<br>• migration `drizzle/0007_college_partners.sql` (13 additive tables)<br>• `src/lib/college/*` (access, eligibility, tokens, consent, scope, meetings, nudge, push, roster, membership)<br>• `college` session role in `src/lib/security/session.ts`<br>• `/college/**` console, `/drive/[token]`, `/employer/drives/**`, `/intern/college`, `/admin/colleges`, marketing section, `public/sw.js`<br>• docs in `docs/college-partners/` (brief, reference board, threat model, decisions incl. Incruiter questions, load test)<br>• `e2e/college-partners.e2e.mjs`<br>• `loadtest/college/*` (k6 + SSE probe)<br>• `scripts/seed-colleges.ts`<br>• `safeNext` hardening + `src/lib/security/safe-next.test.ts` |
| `640075c` | Fix: raw-SQL `last_seen_at` read 5h30 stale (`AT TIME ZONE 'UTC'` in `scope.ts`'s `loadMembers`) |
| `ac6406f` | Fix: the roster import counts only newly verified students. Adds `e2e/college-real-onboarding.mjs` (40-step real-signup run) |
| `1736ec4`, `fbf2b58` | Lint cleanup; new open decision in `docs/college-partners/decisions.md` (#10: drive visibility vs profile completeness) |

The walkthrough page with screenshots, private, is at https://claude.ai/artifact/VJ2Nep3FkotnM3CVQJrVKV. Its source is in the session scratchpad.

### Peer fixes: worktree `/home/wynautbhav/Desktop/findtern-peer`, branch `peer/fixes`

| Commit | What |
|---|---|
| `5799fa8` | **Task A.** `safeNext` in `src/lib/google.ts` rejects control characters; adds `src/lib/security/safe-next.test.ts`. Full gate passed. |
| `716e96d` | **Task B.** `src/lib/db/index.ts` gets `utcTypes` (pool parser, 1114 as UTC) and an exported `dbTimestamp()`; adds test `src/lib/db/timestamp-utc.test.ts` (TZ=Asia/Kolkata, seed DB on 5432, skips if unreachable). Full gate passed. |

**Update (~16:50 IST):** 9a merged A + B into `launch-blockers` as `c450990` (tests 361/361, security 79/79, build green). 9a's instruction for C: commit it on `peer/fixes` when done and message them. If context runs out first, leave C committed, even partly, and note its state here.

**Update (~17:10 IST): Task C is DONE.** It's committed on `peer/fixes` as `0df517d`.
- `npm run e2e` passes 19/19. The full gate is green (tsc, lint 0 errors, test 251, security 71, db:verify, build).
- 9a has been sent the results; they merge it.
- Nothing is in progress for peer/fixes. §3 below is historical.

## 3. In progress

**Task C (peer/fixes)** is being built by a background sub-agent started at ~16:35 in `/home/wynautbhav/Desktop/findtern-peer`. It writes only uncommitted files:
- `e2e/run.mjs`
- `e2e/critical-path.e2e.mjs`
- `e2e/README.md`
- `"e2e"` in `package.json`

It targets `postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e`, a migrated copy of the seed DB, and port 3300.

If this session dies, the agent's work may be partial. **Next step:**
1. Open the worktree and `git status`.
2. Read `e2e/*`.
3. Run `DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e npm run e2e`.
4. Fix test bugs only, staying inside `e2e/` and `package.json`.
5. Run the full gate.
6. Commit C as its own commit with the Co-Authored-By line.
7. Message nextjs-findtern-9a: branch `peer/fixes`; commits `5799fa8`, `716e96d` and C's hash; per-step PASS/FAIL with reasons, saying which failures come from the in-progress UI.

I have **not yet replied to 9a** that B was redone its way. Include that in the final message.

## 4. Remaining (riskiest first)

1. **Task C e2e.** The onboarding final submit may need document uploads (PAN/Aadhaar images) through `/api/uploads`, and the UI is being restyled by 4 workers. Expect some steps to be API-driven, and say so in the README.
2. Report back to 9a (see §3).
3. **College Partners open product decisions** (`docs/college-partners/decisions.md`):
   - name reveal inside drives
   - college billing model
   - freezing eligibility on a live drive
   - drive visibility vs profile completeness
   - the questions for Incruiter (500 interviews in one hour, bulk price)
4. **College Partners known gaps:**
   - the college picker is not inside the onboarding wizard (it lives on `/intern/college` and a dashboard card)
   - real push delivery is untested on a phone
   - `ui/button.tsx` `Button` renders a `<span>`, which isn't keyboard-reachable; pre-existing and not fixed

## 5. Decisions & gotchas

- **Two private Postgres DBs.** The `findtern` role has no CREATEDB on the system Postgres (5432), so I run my own instance: `pg_ctl -D /home/wynautbhav/Desktop/findtern-college/.pgdata` on **port 5433**.
  - DBs: `findtern` (college worktree demo) and `findtern_e2e` (peer C).
  - Stop it with `pg_ctl -D …/.pgdata stop`.
  - `.pgdata/` is in the main repo's `.git/info/exclude`.
- **Dev server.** The College worktree runs `next dev` on **:3200**. Its `.env.local` points to 5433 with `MAIL_MODE=log` and `SCHEDULERS=off`, plus VAPID keys. I deleted the copied `.env` because it holds real SMTP and Google credentials.
- **Raw timestamps.** Drizzle `db.execute()` returns timestamps as **zone-less strings**, because Drizzle sets per-query parsers. A pool `types` parser cannot change that. `new Date(str)` reads it as local time, 5h30 off in IST. Use `AT TIME ZONE 'UTC'` in SQL, or `dbTimestamp()` on peer/fixes.
- **Unqualified columns in subqueries.** Inside a single-table `db.select({...})`, Drizzle renders `${col}` unqualified (`"id"`), so a correlated subquery binds to the inner table. Use `q(table, col)` from `src/lib/college/sql.ts`. Raw `db.execute` qualifies correctly.
- **Error pages return 200.** `notFound()` and error boundaries still return HTTP 200 (root `loading.tsx` streams first), so curl-only smoke tests lie. Always use browser assertions.
- **Rate limits are in memory**, per server process:
  - signup: 5/hour/IP
  - OTP send: 5/15 min/IP
  - login: 8/15 min
  
  Restart the server to reset them. For crawls, mint sessions instead of logging in (`loadtest/college/mint-sessions.ts`).
- **`npm run db:verify` is hard-wired to 5432.** For the 5433 DB run `DATABASE_URL=… node --experimental-strip-types scripts/db-verify.ts`. With more than 9 users it switches to lenient "full dataset" mode.
- **Impeccable engine.** It is gitignored and lives only in the main checkout: `/home/wynautbhav/Desktop/nextjs-findtern/.opencode/skills/impeccable/scripts/impeccable`. Run it with cwd set to the worktree.
- **`next build` rewrites `next-env.d.ts`.** Run `git checkout next-env.d.ts` before committing.
- **Ruled out:** a per-client pg query hook that rewrote raw rows into Dates. It worked, but 9a rejected it as hidden behaviour.

## 6. Verification state

- **College Partners (`feat/college-partners` @ `fbf2b58`):**
  - `tsc` clean
  - lint 0 errors
  - `npm test` 274/274
  - `test:security` 92/92
  - `db:verify` (5433) passed
  - `e2e/college-partners.e2e.mjs` 9/9
  - `e2e/college-real-onboarding.mjs` 40/40
  - k6 at 500 students: p95 23 ms, 0 errors
  - axe: 0 WCAG AA violations
  - **Unverified:** the e2e has not been re-run since `640075c` (reseeding would break the demo link), and the real-onboarding script's shortlist-wait edit has not been re-run since it was made.
- **peer/fixes @ `716e96d`:**
  - `tsc` clean
  - lint 0 errors
  - `npm test` 251 pass
  - `test:security` 71
  - `db:verify` passed
  - `build` OK
  - **Task C unverified.**

## 7. Resume prompt

```
You are continuing session nextjs-findtern-4e's work. Read docs/handoff/HANDOFF-nextjs-findtern-4e.md in /home/wynautbhav/Desktop/nextjs-findtern first.

Your job: finish Task C for session nextjs-findtern-9a on branch peer/fixes in the worktree /home/wynautbhav/Desktop/findtern-peer (tasks A=5799fa8 and B=716e96d are committed). Constraints: only create/edit files under e2e/ and the "e2e" script in package.json; never edit src/app/**, src/components/**, src/lib/**; never push or merge; never point anything at a non-localhost DB.

1. `git status` and read e2e/run.mjs, e2e/critical-path.e2e.mjs, e2e/README.md (a sub-agent may have left them partial).
2. Make sure the private Postgres on :5433 is up (`pg_ctl -D /home/wynautbhav/Desktop/findtern-college/.pgdata status`, start if needed) and DB findtern_e2e exists (migrated seed copy).
3. Run `DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e npm run e2e`. The flow: intern signup+OTP (from logs/mail/<date>.log) → onboarding submit → free activation → AI interview request → admin scores (throwaway super_admin via scripts/make-admin.ts) → employer signup+OTP → company setup → project → book interview → intern picks slot → employer offer → intern accepts → employer free monthly checkout → hired → intern timesheet submit → employer approves → admin payout created + marked paid → intern earnings shows it. Assert DB rows + emails per step and that the company name never reaches intern emails before hire. Fix test bugs; report product bugs with evidence.
4. Gate: npx tsc --noEmit; npm run lint (0 errors); npm test; npm run test:security; npm run db:verify; npm run build; then `git checkout next-env.d.ts`.
5. Commit C separately, message ending "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
6. SendMessage to nextjs-findtern-9a: branch peer/fixes, commits (5799fa8, 716e96d, C's hash), that B was redone as they asked (pool parser + dbTimestamp helper, no hook), and C's per-step results with reasons for any failures.
```
