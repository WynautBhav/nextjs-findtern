# Migration readiness: live legacy findtern.in vs the new app (1 Nov 2026)

**Verdict: NO-GO today, GO once B1–B3 are done and the pre-flight list (P1–P6) is ticked.** No feature of the legacy intern, employer or admin area is missing, and the migration, build and all test gates pass. The blockers are one payment setting, one login decision that affects 58% of interns, and the temporary test-pay code.

What was compared: master `848c715` (production build, local) against live findtern.in, same three accounts (candidate, employer, admin), in one headed Chrome tab. The new app ran on a copy of the **27 Oct** dump, so numbers created since then show as drift, not bugs. Not tested: real Razorpay, Google login, the Vercel staging URL, production-only config.

Live findtern.in was **read-only**: only GETs and the three login POSTs reached it. The guard aborted every other write, and it blocked none because the walk never clicked an action button. Browser pages walked: legacy 21 + 16 + 22, new 16 + 19 + 31.

## Blockers

| # | What | Evidence | Fix |
|---|---|---|---|
| B1 | **Razorpay capture.** Legacy sends `payment_capture: 1` on every order (`FindTern/server/routes.ts:1154`); the new order call omits it (`src/lib/razorpay.ts:32`) and nothing captures later. If the dashboard default is Manual, payments stay "authorized", the app hires on the signature, and Razorpay auto-refunds about 5 days later. | Read in both code bases. | Add `payment_capture: 1` (one line, covers both order routes), or confirm Automatic capture in the Razorpay dashboard. Then make one real small payment and check it shows as captured. |
| B2 | **Google-created accounts have no usable password.** Legacy gave them a random 28-character password nobody saw. **257 of 442 interns (58%)** match that pattern. With `GOOGLE_LOGIN` unset at launch, they can only get in through Forgot password. | 27 Oct dump query; legacy `routes.ts:3191,3258`. | Decision for the owner: test Google sign-in on staging and set `GOOGLE_LOGIN=on` at cutover (preferred), or announce "use Forgot password" and confirm `MAIL_MODE=send` works first. |
| B3 | **Test-pay button still in master** (runbook P7): `testPayEnabled` in 5 files. It is off with a `rzp_live_` key, but the runbook says remove it. | `grep testPayEnabled src`. | Remove the switch, both buttons and the `testPay` branches. |

## Fix soon (not day-one blockers)

| ID | What | Status |
|---|---|---|
| M1 | **Dashboard tells every existing intern they have unfinished steps.** `profileCompletion` requires `ndaAcceptedAt`; legacy never wrote it, and 0 of 317 rows have it. A paid, scored intern sees "Profile (current step)" and "Visible to employers: not started". Payment and open-roles gates are safe (`isOnboarded` exempts scored rows), and the employer pool is unaffected: 179 candidates on legacy, 179 in the new app. Expect support tickets. | Confirmed in browser and data. Fix: count the agreement as done for activated or scored interns. |
| M2 | **Legacy upload names:** `.jfif` is not served by the new file route (`src/lib/security/store.ts:193`). 3 of 4,494 local files. The local folder dates from 14 Oct, so count on the live folder. | Confirmed on local copy. |
| M3 | **Google env names.** Legacy accepts `GOOGLE_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_ID`; the new app reads only the first (`src/lib/google.ts:69`). If the live `.env` uses the old names, Google sign-in and Meet links fail silently. | Code confirmed. Check the live `.env` names. |
| M4 | **Schedulers are in-process** and need `SCHEDULERS=on` on one long-lived process. They will not run on Vercel. Nothing alerts if the timer dies. | Runbook P2 covers the flag. |
| M5 | **Admin figures differ from legacy on intern invoices.** Legacy shows 317 rows as Pending (Paid ₹0, Pending ₹1,22,451). The database has 290 `paid` rows totalling ₹2,623.95, and the new page shows exactly that (discounts ₹7,22,086.05). Tell accounts. | Verified against the database. |
| M6 | Edit-offer API accepts values the create route refuses (shift, timezone, laptop, start date): `src/app/api/proposals/[id]/route.ts:27-48`. | Agent-read. |
| M7 | Per-hire "Timesheets" link ignores `?intern=` (`timesheets/page.tsx:36`); employers now see intern drafts; hires with no monthly payment on file cannot be paid online. | Agent-read. |
| M8 | Accepting an offer expires the intern's open offers from every employer (legacy: same employer only). Looks deliberate. | Owner to confirm. |
| M9 | Interview-time `payout` and `files/legacy` edge cases, missing alert click-throughs, and about 20 LOW polish items. | Full list in the sweep tables. |

Also open from the repo and config:
- **F1** Production Postgres `147.93.27.44:5432` accepts connections from the internet (SYS-16).
- **F2** The repo `.env` holds the production `DATABASE_URL` and live SMTP, Razorpay and Google secrets. Any script run with `--env-file=.env` hits production.
- **F5** The daily browser check fails: axe `label-content-name-mismatch` on every `/admin/*` page, from one shared component.

## What passed

| Check | Result |
|---|---|
| Migration rehearsal, 27 Oct dump | 0001–0008 apply; one skipped index (DB-06) and `0007` twice, as the runbook says; `0008` pg_trgm applies; second run changes nothing; 442 users kept. **`0008` was added after the 28 Oct rehearsal, so this is its first rehearsal.** Production needs the `pg_trgm` contrib package. |
| tsc, lint | exit 0 |
| Unit tests / security tests | 473 / 473, 112 / 112 |
| `next build` | OK |
| `npm run e2e` (hiring path, 19 steps) | 19 / 19 |
| `e2e/pay-race.mjs` | PASS: 3 parallel requests give one success and two 409s, one row each, for intern activation, employer pay, interview, proposal, full-time offer |
| Logins, same accounts on both | intern, employer and admin sign in on live and on the migrated copy |
| Horizontal overflow at 390px | none on 66 pages |
| Console and network errors | none for employer and admin. Candidate: `/api/intern/avatar` 404 on every page (no photo; legacy shows initials) and 2 legacy `/uploads` 404s from the missing local folder |

Not run: `db:verify` (it checks seeded demo accounts, not a live dump), design-critic and security-reviewer subagents.

## Side-by-side data (27 Oct data vs live today)

| Role | Matches | Differs, and why |
|---|---|---|
| Intern | Same account and name; every legacy intern route has a counterpart (20 legacy incl. aliases → 14 new) | Dashboard checklist (M1); alert count 50 vs 47 (drift) |
| Employer | Candidates 179 = 179; proposals 24 = 24; interviews 2 = 2; projects 5 = 5; orders empty on both; cart 31 rows = Shortlist 8 + Proposed 17 + Accepted 6 | Checkout shows 3 offers on legacy (filtered to project "My Finds") and all 6 on new; amounts follow the settled rules (free intern = ₹5,000 hiring fee only; ₹32,000 + ₹5,000 = ₹37,000 first month); alerts 50 on legacy (cap) vs 229 on new |
| Admin | Transactions ₹7,624; orders ₹5,000 and ₹762.71; dashboard revenue ₹7,623.95 = ₹2,623.95 + ₹5,000 | Intern invoices (M5); page sizes differ (10 vs 25), so list totals were not compared except where stated |

Legacy `/admin/website` maps to `/admin/cms`, and `/admin/contact` to `/admin/messages`. `/admin/roles` shows 28 rows on new and 5 + 4 on legacy: not compared further.

## Code sweep (three agents, legacy code read line by line, tables in the scratchpad)

Result: **no legacy intern, employer or admin screen, scheduler, email template, notification type or money action is missing.** 223 live route registrations in `server/routes.ts` (224 lines, one commented out) are each covered or grouped. The only notification not rebuilt is `saved_search_match` (SYS-09, undecided). Dropped on purpose: slider and plans CMS, per-employer Google connect, saved searches, admin "mark intern fee paid" (no legacy page used it).

I re-checked these agent claims myself (B1, B2, M1, M2, M3). The rest, including M6 and M7, rest on the agents' reading and are not confirmed in a browser. The parity report's older OPEN statuses are stale in many places, so update it before relying on it.

## Before the switch (runbook P1–P7)

Not checked by me: **P1** argon2 patch on legacy, **P2** production `.env` (add B2 and M3 to the list), **P3** live Razorpay keys and webhook secret (add B1), **P5** backup and restore test, **P6** someone with Razorpay dashboard access. **P4** and the build are fine. **P7** is B3.

## Test data left behind

Local only: databases `findtern_rehearsal` (migrated 27 Oct copy), `findtern_e2e` (migrated copy, scrubbed and seeded by `qa:seed`, plus the e2e and pay-race rows). Servers on 3100 and 3500 are stopped. Screenshots with real intern and company data are in the session scratchpad and were never committed.
