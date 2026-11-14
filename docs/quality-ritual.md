# Quality ritual

Two habits and one number. They keep the product feeling finished without a big redesign.

In plain words:

1. **Every week, each person fixes one small rough edge in 30 minutes.** Not a project. One thing you noticed (a cramped label, a missing empty state, a slow button) that you can fix and ship before the timer runs out.
2. **Before every release, walk the four journeys like a user.** Intern, employer, college, admin. Read the emails too. Use two browsers and two screen sizes.
3. **Once a month, run the funnel query and write the numbers down.** It shows whether the polish is helping people get further. It only counts, and never shows who.

What this is not: no A/B tests (traffic is too small to give clean answers) and no new tracking on signed-in pages. The funnel query reads the database that already exists.

Rules that apply to every fix and every release check (from the UI polish brief, section E):

- **Allowed:** progress toward a real goal (profile, activation, hours), dated milestones built from stored facts, optional breaks, reminders the user can turn off.
- **Not allowed:** streaks or anything that decays, guilt copy, fake urgency or countdowns, invented scores or ranks, hidden fees, cancelling that is harder than signing up, celebrating a payment.

---

## 1. Weekly: 30 minutes each, label `polish`

- **Who and when:** every person on the team, once a week. Set a 30-minute timer.
- **Pick:** one thing you personally noticed this week while using the product. Not from a backlog meeting.
- **Do:** fix it, run `npx tsc --noEmit`, `npm run lint` and the tests that touch it, and show the before and after (a screenshot is enough).
- **Track:** open an issue or pull request for it and give it the label **`polish`** (create the label once). Close it when it ships. The weekly count is the number of closed `polish` items, and the target is one per person per week.
- **Too big?** If it will not fit in 30 minutes, stop, write it up as an issue with the label `polish-later` and the screenshot, and pick something smaller. Do not borrow time from next week.
- **Check the bar:** compare your change against `/intern/dashboard`, `/admin/dashboard` and `/employer/dashboard`. A fix that makes a screen look flatter than those three is not done.

## 2. Every release: the four-journey walk

Do it on the release candidate, before it goes live. One person walks; a second person signs the table at the end.

### Set up (once per walk, about 10 minutes)

The walk runs against a **local copy of the data, never the live database**. `e2e/lib/env.mjs` refuses any database host that is not on this machine.

```bash
# 1. A local, scrubbed copy of the database (see e2e/README.md and e2e/seed-situations.mjs)
export DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa   # your local QA database
npm run db:migrate
npm run qa:seed                       # creates the QA accounts and scrubs real personal data (skip if the QA accounts already exist)

# 2. A production build on a local port, with mail written to a file and payments switched to free
QA_REBUILD=1 npm run qa:serve         # serves http://localhost:3500 (QA_PORT to change it)
```

`npm run qa:serve` starts the app with `MAIL_MODE=log`, so **no real email is sent**. Every email lands in `logs/mail/YYYY-MM-DD.log` in the repository folder. Keep that file open in a second window while you walk.

Stop `qa:serve` before running `npm run qa` (both use port 3500), or point a single step at the running server with `E2E_BASE_URL=http://localhost:3500 node e2e/keyboard.e2e.mjs`.

Sign-in details for the QA accounts are in `e2e/lib/personas.mjs` (intern `intern-hired`, employer `employer-main`, admin `admin`, college `college`). Each role signs in on its own page: `/login`, `/login?as=employer`, `/login?as=college`, `/admin/login`.

### The matrix

Walk each journey in **Chromium and Firefox, at 1440 px and 390 px wide** (browser dev tools, device toolbar). That is 4 passes per journey. Playwright has both browsers installed (`npx playwright install chromium firefox` if not).

Do the full steps once in Chromium at 1440. In the other three passes, check that every step still works and looks right; do not skip a step because it passed once.

For each pass, look for:

- the page loads without a blank flash, a layout jump, or a spinner that never ends;
- nothing is cut off, overlaps, or needs sideways scrolling at 390 px (tables may scroll inside their own box);
- every button and link can be reached and used with the keyboard (Tab, Enter, Esc), and the focus ring is visible;
- empty, loading and error states read like a person wrote them;
- the guardrails above hold (no streak, no fake urgency, no invented numbers).

### Emails: read them

After each step marked **MAIL**, open today's file in `logs/mail/` and check the new entry: right recipient (`To:`), the subject makes sense, the text reads cleanly, there is no `undefined` or raw `{{placeholder}}`, and every link starts with the local origin (`http://localhost:3500`) and opens the right page. Example subjects to expect: "Verify your Findtern email", "Interview invitation | Select a time slot on Findtern", "You’re hired | Internship confirmed on Findtern", "Timesheet submitted for approval | Findtern", "Payout sent | Findtern". If an expected email is missing, or one arrives twice, that is a fail.

### Release checklist

Copy this table into the release notes (or into a file under `e2e/.artifacts/walkthrough/<release-date>/`). Save one screenshot per journey, browser and width, named `<journey>-<browser>-<width>.png` (for example `intern-firefox-390.png`), in the same folder. Write pass/fail per journey and browser/width, and point to the evidence.

| Journey | Steps | Expected | Pass/fail (chromium 1440 / 390, firefox 1440 / 390) | Evidence path |
|---|---|---|---|---|
| **Intern** | 1. `/signup`, fill the form. **MAIL** (verification code). 2. Verify, land on onboarding. 3. Complete the profile steps; the fee is not mentioned until the profile is complete. 4. `/intern/dashboard`: next step and progress are shown. 5. Activate (QA server uses free mode). **MAIL** (payment). 6. Open `/intern/opportunities`, `/intern/interviews`, `/intern/proposals`. 7. Reset a password from `/forgot-password`. **MAIL**. | Every step moves forward without errors. Progress on the dashboard matches what was done. Emails arrive once each. | | |
| **Employer** | 1. Sign in at `/login?as=employer`. 2. `/employer/dashboard`. 3. `/employer/candidates`: filter, shortlist one, compare two (`/employer/compare`). 4. Create a project, send a proposal. **MAIL** (to the intern). 5. Schedule an interview. **MAIL**. 6. Approve a timesheet at `/employer/timesheets`. 7. `/employer/cart`, `/employer/checkout`, `/employer/orders`. **MAIL** (payment). | Lists load, filters narrow, compare scrolls at 390 px, checkout completes in free mode, orders shows the new row. | | |
| **College** | 1. Sign in at `/login?as=college`. 2. `/college` home. 3. `/college/roster`, `/college/students`, `/college/seats`. 4. `/college/drives`. 5. `/college/earnings`; start a payout request if the account has a balance. **MAIL** if a payout is requested. | Numbers on the home page match the roster and seats pages. Tables stay usable at 390 px. | | |
| **Admin** | 1. Sign in at `/admin/login`. 2. `/admin/dashboard`: the to-do list loads; press `J` / `K` to move. 3. Press **Ctrl K** (or **⌘K**): the palette opens, the shortcut hint is visible in the top bar, and "Keyboard shortcuts" lists the keys. 4. Open a candidate and a company from the palette. 5. `/admin/payouts`, `/admin/proposal-tracker`, `/admin/notifications`. 6. Mark a payout paid. **MAIL** ("Stipend transferred successfully"). | The palette opens from the keyboard, shows the hint, and every page opens. The mail log shows the payout email. | | |

### Automated checks to run first (so people only look at what machines cannot)

```bash
npx tsc --noEmit
npm run lint
npm test
npm run test:security
npm run build
npm run e2e                          # the full hiring story, on port 3300
npm run qa -- keyboard               # keyboard-only pass, including the admin palette hint
npm run qa -- crawl --quick          # every page at both widths
```

`npm run qa -- keyboard` runs `e2e/keyboard.e2e.mjs`. It signs in as the admin in Chromium and Firefox, checks that the top bar shows a visible **Ctrl K** (**⌘K** on Mac) hint, opens the palette with the shortcut, and opens the "Keyboard shortcuts" list. Add `--palette` to run only that part.

### When something fails

Write one line in the table (what, where, browser and width), save the screenshot, and file an issue. A fail in a journey step (cannot sign up, cannot pay, email missing) stops the release. A visual fail (spacing, a cut-off label) goes to the weekly `polish` list unless it hides a button or a number.

## 3. The funnel: do more people get further?

`scripts/funnel-7day.sql` is **read-only**: one `SELECT`, no writes. For each signup week it counts the interns who signed up, then how many, **within 7 days of signing up**, finished their profile, activated, got a score and got hired. It shows counts and percentages only, never names, emails or ids.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/funnel-7day.sql
```

Run it against a **read replica or a local copy**, never with credentials that can write. Change the date in the `params` line at the top to move the window. Only interns who signed up at least 7 days ago are counted, so no row is half-finished.

What each stage means, and what the database can and cannot say:

| Stage | Where it comes from | 7-day timestamp? |
|---|---|---|
| Signup | `users.created_at`, `users.role = 'intern'` | Yes |
| Profile complete | `intern_onboarding.extra_data->>'profileSubmittedAt'`, set once at "Complete & Submit" | Yes (stored as text in JSON). Counts "submitted", not "passes every admin check". |
| Activated | `intern_payments.status = 'paid'` with `paid_at` (free, promo and admin-marked rows included) | Yes. Old accounts with only `extra_data.payment.isPaid` have **no date**, so they appear in the separate `activated_legacy_undated` column and are not in the 7-day count. |
| Scored | **No score date is stored.** The query uses the one-time notification `ai_interview_scores_live` (`notifications.created_at`) as a **proxy**. | Proxy only. It can undercount, because the notification is best-effort in code. |
| Hired | `proposals.hired_at` (first one per intern) | Yes. A hire that ended early still counts. |

How to read it: each column is its own rate against `signups`, not a chain. Compare the same column before and after a release. A change of a few points on a small week is noise; look for the same direction two weeks running. Remember the QA copy holds scrubbed, partly synthetic data, so its numbers are for checking that the query runs, not for reporting results.

Write the numbers into the release notes beside the walk-through table.

## 4. After the first run

The first live run of this ritual is done by the orchestrator, with a log and screenshots saved to the artifacts folder. Fix what the run finds in this document (a wrong step, a missing command) the same day, so the next person can follow it as written.
