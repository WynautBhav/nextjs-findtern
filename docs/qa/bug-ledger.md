# Bug ledger (release/master-merge)

Severity: P0 = blocks a flow, data loss or security; P1 = wrong behaviour a
user will hit; P2 = cosmetic. Status: open → fixed (awaiting retest) → closed,
or deferred (with reason). Fix commits name the ID: `fix(QA-001): ...`.
The tester (nextjs-findtern-1a) owns this file; the builder appends status
lines only.

| ID | Sev | Role | Route | Width / browser | Status | Summary |
|---|---|---|---|---|---|---|
| QA-001 | P1 | employer, intern | /employer/drives/[id] (accept a drive call) | any | closed | Production build without the Google calendar token: `src/lib/college/meetings.ts` returns `link: null` (the Jitsi stand-in is dev-only), yet `requestMeeting` still accepts the call, so the student gets an accepted call with no join link. Expected: refuse with "Calendar not connected; ask Findtern to connect it" (and the admin sees it in attention), never a silent null. Found by the Opus session during WP1 (e2e 7/9 under `next start`). |
| QA-002 | P2 | intern | /intern/dashboard, /intern/record (any page with a Thread "action" node) | any width, Chromium; only with `prefers-reduced-motion: reduce` | open (reopened 28 Oct: db3cafe fixed CountUp only; real cause is `Thread`'s NodeMark, below) | React error #418 (hydration mismatch) in the console on every load. `src/components/app/count-up.tsx`: the server renders `display` (state starts at 0), but under reduced motion the client's first render already returns the formatted final `value`, so the server HTML and the first client render differ. React recovers by client-rendering the subtree, so the user sees no wrong number, but it is a console error, a wasted re-render, and a flash of 0 on slower devices for exactly the users who asked for less motion. |

| QA-003 | P1 | admin | /admin/interns/[id] | any | open | Candidate detail shows the full Aadhaar and PAN numbers. Expected: masked to the last 4, with an explicit reveal that is audit-logged. Sensitive-data exposure even though admin-only. |
| QA-004 | P1 | intern | /intern/record vs /intern/dashboard, /interviews, /profile, /proposals/[id] | any | open | Two different Findtern scores for the same intern: 8.8 (Coding 9.3) on Home/Interviews/Profile/Offer, 8.2 (Coding 8.5) on Record. One page computes from the wrong source. Find which is stored and fix the other. |
| QA-005 | P1 | employer | /employer/timesheets/[id] | any | open | A timesheet with 0 days filled could be approved. Expected: approve is refused (or disabled) until every day has a status, as the intern-side submit rule requires. |
| QA-006 | P1 | employer (signup via college drive) | /drive/[token] → employer signup | any | open | Signing up from a drive link loses the drive (`next` not carried), and the route has no error handling on its query. Source reading by the builder; verify in the browser. |
| QA-007 | P1 | employer, admin | /employer/orders; /admin/dashboard, /admin/proposal-tracker, /admin/reports, /admin/transactions, /admin/companies | any | open | Money/hire counts disagree across pages: orders "3 payments due" vs "Nothing outstanding"; admin hires 0 vs 13; transactions "Received ₹0" vs orders ₹2,80,000; companies list 0 projects/proposals vs detail 3/9. Likely one root cause (₹0 free-mode test orders, or a status filter, counted differently per page). Verify and fix at the source, then each symptom. |
| QA-008 | P2 | employer | /employer/dashboard | any | open | Hero says "4 things need you" above a 2-item "Waiting on you" list; the two counts come from different rules. |
| QA-009 | P2 | admin | /admin/reports | any | open | "Avg hiring speed −9.8 days": a negative duration; the date pair is reversed or includes unhired rows. |
| QA-010 | P2 | intern | /intern/opportunities/[id] | any | open | Role detail tells a hired intern "You have an offer for this role"; should reflect the hire. |
| QA-011 | P2 | intern | /intern/settings | any | open | A paid intern with saved bank details sees an empty bank form and no read-only saved state. |
| QA-012 | P2 | employer | /employer/account | any | open | "Profile complete" shown while required escalation-contact fields are empty. |
| QA-013 | P2 | college | /college/drives | any | open | A closed drive is sorted above the live one. |
| QA-014 | P2 | employer | /employer/intern/[id] | any | open | Preferred cities not deduplicated ("Bengaluru, Bengaluru, Remote"). Builder fixes within the employer redesign. |
| QA-015 | P2 | intern | /intern/record | any | open | A raw ISO date ("2026-10-30") is shown instead of the DD/MM/YYYY format. Builder fixes within the intern redesign. |
| QA-016 | P2 | admin | /admin/account | any | open | Two different password rules stated on the same page. Builder fixes within the admin redesign. |
| QA-100 | P1 | all (marketing) | every marketing page, e.g. `/`, `/faq`, `/pricing` | 375, Chromium | open | Header is wider than the phone: the menu button spans x=344 to 384, so `scrollWidth` is 384/385 and the page scrolls sideways (the larger logo from NC-r2 is the likely cause). Found by the marketing sub-run, verified by Tester B. |
| QA-101 | P1 | employer (signup) | /employer/signup | 375 | open | Phone number input is 50 px wide beside a 269 px country-code select; the number shows as "98'" and cannot be read or checked while typing. The intern signup form is fine (175 px). |
| QA-102 | P1 | everyone | marketing footer, auth pages, onboarding | 375 | open | The floating "Ask me" button (141 x 64) and its prompt bubble cover real content: the right end of the Password field on employer signup, the "Employer sign in" link at the end of the intern signup, the footer copyright line and the "Copy email" icon on /faq and /about. The page has no bottom padding to scroll them clear. |
| QA-103 | P2 | admin | /admin/payouts ("Mark paid or failed") | 375 | open | The payout editor opens inside the horizontally scrolling table: "Failed", the reference label and "Cancel" are cut off; the admin has to scroll sideways to reach them. Also fires a 400 to the API when "Done" is pressed with no reference (the message is correct, but the check is server-side only). |
| QA-104 | P2 | admin | /admin/interns/[id], payouts, candidate lists | 375 | open | Tap targets far under 44 px: skill "Remove" buttons 12 x 12, skill level selects 25 px high, Save / Add / Apply 36 px, "Edit contact" 36 px. |
| QA-105 | P2 | employer (USD), signed out | `/`, `/about` | any | open | With USD selected the stats strip still says "₹5,000 Fixed per-hire fee" while /pricing says "$50". Found by the marketing sub-run. |
| QA-106 | P2 | everyone | `/pricing` calculator | any | open | Hours are 5 days x 4 weeks = 160 h and 6 x 4 = 192 h; the owner decision (and plan) is a flat 22 or 26 days a month, i.e. 176 h and 208 h at 8 h a day. Needs the owner's confirmation which number the marketing page should show. |
| QA-107 | P2 | intern | /intern/onboarding | any | open | Reloading the page returns to "Step 1 of 8" although the entered data is kept and the later steps are unlocked; the user has to press Continue seven times to get back. |
| QA-108 | P2 | intern | /intern/proposals/[id] and the accept dialog | any | open | Copy reads wrongly with the company hidden: "This tells The company yes for a start on ..." (capital T mid-sentence) and "Waiting for Hidden company to complete the payment." |
| QA-109 | P2 | intern | /intern/onboarding step 1 | any | open | An emergency number already used by any other account is refused ("This number is already in use on Findtern. Use a different emergency contact."). Two siblings cannot give the same parent's number. Product call: allow duplicates for the emergency number. |
| QA-110 | P2 | everyone using Safari (WebKit) | signup, employer signup, any form with the OTP proof | http only | open | The signup OTP proof cookie (`ft_otp`) is set `Secure` from `NODE_ENV === "production"` instead of the request-aware `isHttps()` the session cookie uses, so WebKit drops it on an http deployment and "Create account" answers "Verify your email before creating the account" right after a verified code. Real HTTPS production is not affected; a non-TLS staging or an internal `next start` is. |
| QA-111 | P1 (unverified) | everyone using Safari | `/` | any, WebKit (Playwright, Linux) | open | Playwright's WebKit build crashes ("Page crashed") on the home page, 100% of 6 loads at 375 and 1440 px. Every other marketing and app route loads. Bisect: the document alone (no JS, no CSS, no subresources) crashes; the same document with the `<video>` element removed loads. Very likely the build lacking media codecs, not the app, so this needs a check on a real iPhone or Safari before it is cleared. |
| QA-112 | P2 (unconfirmed) | employer | /employer/checkout, /employer/orders (bug-sheet S1-r121) | any | open | "Whole engagement" for a 2-month offer at 26,400 a month shows engagement ₹24,000 + fee ₹5,000 = ₹29,000, cheaper than the monthly option's first payment ₹31,400; after paying, Orders says "Paid so far ₹29,000, Still to pay ₹29,000, Next instalment 17 Sept 2026" (a past date). The offer is a QA-seed row whose stored fields disagree (`totalPrice` 24,000 against 2 x `monthlyAmount` 26,400), so this is not proven on an offer sent through the form. Retest with a fresh offer before fixing. |
| QA-113 | P2 | employer | /employer/send-proposal?intern=<id> | 375 | open | The form is reachable for a candidate whose meeting is still open (the cart correctly says "available once the meeting is completed"); only after the 9 s policy dialog does the server answer 409 "The offer opens once the interview has happened.", shown as a toast. Block the form, or show the reason inline. |
| QA-114 | P2 | employer (non-India) | /employer/onboarding | 375 | open | Country UAE: State and City are free-text; "Billing PIN code - Only needed for an Indian billing address" still errors "PIN code must be 6 digits" for 5 digits; the escalation phone code stays +91 ("Indian numbers must be 10 digits"). |
| QA-115 | P2 | employer | /employer/proposal/[id] | 1440 | open | "Withdraw offer" on an accepted-unpaid offer acts on one click with no confirmation. |
| QA-116 | P2 | employer | candidates, dashboard, projects, proposals, schedule, orders | 375 | open | Tap targets under 44 px: Shortlist 112 x 40, Send proposal 162 x 40, Quick view 121 x 40, Compare 114 x 40, view toggles 36 x 36, skill chips 38 high, "Show everyone" 24 high, "Manage" 60 x 20, project filter tabs 40, Edit / Withdraw / View 36, Join meeting / Reschedule / Leave feedback 36, project-name links 23 high. Full list in `docs/qa/b/bs7-employer-results.md` (D7). |
| QA-117 | P2 | employer | candidate cards, quick view, project cards | 375 | open | Text cut off: the rating label "AI interview" shows as "AI intervie..."; the Scope / Work mode / Timezone labels on project cards are clipped by their containers. |

## Details

### QA-001
- Steps: production build (`next start`) with `GOOGLE_CLIENT_ID` set but no
  row for `CALENDAR_TOKEN_OWNER` in `employer_google_tokens`; as an
  employer in a live drive, request a call; as the student, accept.
- Actual: `drive_meetings.meeting_link` is null; the student's card shows
  no Join button.
- Trace: n/a (API-level; the regression script prints each check).
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus, fix(QA-001)).
  `requestMeeting` refuses with "Calendar not connected; ask Findtern to
  connect it." when no link can be made (no row is written, so no
  notification goes out); accepting a call that has no link is refused (409)
  for older rows; the admin dashboard lists "Google calendar not connected"
  first when Google is configured with no `CALENDAR_TOKEN_OWNER` token, or
  when production has no Google config. college-partners.e2e under
  `next start` now asserts the refusal and skips accept/join/cancel with a
  reason (7 pass, 2 skipped); on `next dev`, 9/9.

- Retest (tester, 28 Oct): **closed**. `e2e/retest-qa001.mjs` on a production build
  (`next start`), `GOOGLE_CLIENT_ID` set to a placeholder, no `employer_google_tokens`
  row, own database clone, wp/qa on 16e3b64: 8/8 pass.
  (1) employer call request → 409 "Calendar not connected; ask Findtern to connect it.",
  `college_drive_meetings` row count unchanged; (2) a planted requested call with
  `meeting_link` NULL → accept gives 409 and the row stays `requested`;
  (3) `/admin/dashboard` shows "Google calendar not connected" as the first item in the
  attention list with a Connect button to /admin/settings (screenshot
  `e2e/.artifacts/qa/qa-001-admin-dashboard.png`). Re-run it with
  `DATABASE_URL=<clone> QA_PORT=3601 QA_GOOGLE=1 node e2e/retest-qa001.mjs`.

### QA-002
- Role / route / width: intern (`ritika.launchtest@gmail.com`), `/intern/dashboard`,
  390 and 1440 px, Chromium 156, production build. Also expected wherever
  `<CountUp>` renders (employer and admin dashboards use it too).
- Steps: open the page in a context with `reducedMotion: "reduce"`
  (`e2e/motion.e2e.mjs`, or DevTools → Rendering → Emulate prefers-reduced-motion:
  reduce) and read the console.
- Expected: no console errors.
- Actual (exact text): `Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
  Not reproduced with normal motion (the crawler's default context is clean).
- Cause (from reading `count-up.tsx`, not yet confirmed in a dev build): the
  server and the first client render differ under reduced motion, as above.
  Suggested fix: render the same value on both sides for the first render
  (e.g. `useSyncExternalStore` with a `getServerSnapshot` of `false`, or render
  `value` unconditionally on the server and only animate after mount).
- Trace / screenshot: `e2e/.artifacts/qa/motion/intern-hired-1440-reduced-trace.zip`
  and `…-reduced.png` (written by `npm run qa -- motion`).
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus, fix(QA-002)).
  `CountUp` now starts `display` at the final value, so the server and the
  first client render agree whatever the motion setting; the count from 0
  starts after mount (motion allowed only). Same root cause also threw #418
  on `/intern/record` (768/1440), which renders two `CountUp`s. Checked on a
  production build with `reducedMotion: "reduce"`: `/intern/dashboard`,
  `/intern/record`, `/intern/earnings`, `/employer/dashboard`,
  `/admin/dashboard` at 390 and 1440, 0 page errors. The other
  `useReducedMotion` users only vary motion `initial` props, not text.
- Retest (tester, 28 Oct): **reopened**. Production build of wp/qa on d207313 (includes
  db3cafe), `npm run qa -- motion`: 4 findings, all React #418: `/intern/dashboard` and
  `/intern/record` at 390 and 1440. `/intern/earnings`, `/employer/dashboard` and
  `/admin/dashboard` are clean, and the CountUp figures are now in the server HTML, so
  db3cafe did fix what it targeted. Repeat run (6 loads each, 390 and 1440, Chromium):
  reduced motion 6/6 errors on dashboard and record, 0/6 on earnings; normal motion 0/36.
  Not reproduced on `next dev` (no hydration message at all), so check on a production build.
- Cause (confirmed by correlation, not by a patched build; the tester does not edit
  `src/`): `src/components/app/thread.tsx` `NodeMark` renders
  `{isAction && !reduce ? <motion.span aria-hidden .../> : null}`. `useReducedMotion()` is
  `null` during SSR, so the server HTML contains the pulse span; a reduced-motion client's
  first render omits it, so the child list differs. The pulse span (`bg-accent-400/50`) is in
  the server HTML of exactly the two failing pages (dashboard 1, record 2) and of none of
  `/intern/earnings`, `/timesheets`, `/interviews`, `/proposals`, which have no Thread.
  The same file's `animated = !reduce && i < ANIMATED_NODES` and the `initial=` props in
  `Thread`, `ScoreBar` and `ProofCard` branch on `reduce` too, but only change style attributes,
  which React does not report in production; they do ship `opacity:0` in the server HTML to
  reduced-motion users until hydration (a flash, the same class as the CountUp one).
- Suggested fix: do not branch the markup on `reduce`. Always render the pulse span and hide
  it with CSS (`motion-reduce:hidden`), and drive the other reveals from CSS or from state set
  after mount, so the server and first client render are identical.
- Re-run: `QA_REBUILD=1 npm run qa -- motion`; trace
  `e2e/.artifacts/qa/motion/intern-hired-1440-reduced-trace.zip`.
- Status (builder, 28 Oct, QA-002b): fixed, awaiting retest (wp/opus,
  fix(QA-002b)). No markup branches on `useReducedMotion()` any more:
  Thread's action pulse is always rendered (`motion-reduce:hidden`, and its
  animation doesn't run under reduce); Thread, ScoreBar and ProofCard start
  states no longer depend on `reduce` (instant transitions instead), and a
  `[data-reveal]` rule in globals.css shows the end state to reduced-motion
  readers before hydration. ScoreBar grows by scaleX from a fixed width.
  `npm run qa -- motion` on my build: 0 findings (was 6:
  animation-not-reduced on the pulse after the first pass).

### QA-003 to QA-016
- Source: the builder's design briefs (docs/design/briefs.md, "Found while
  briefing: not design"), seen on the SEED DB while taking the baseline.
- Logged by the orchestrator on 28 Oct after the tester session exited;
  severities are the orchestrator's calls. Steps and traces to be added on
  reproduction against the 5436 QA copy.

### Tester B (nextjs-findtern-qa-b), 28 Oct: reproductions of QA-003 to QA-016

Method: production build of `release/master-merge` @ 733c683, two private databases
on one local Postgres: **LIVE-COPY** (27 Oct dump, scrubbed and given the personas by
`npm run qa:seed`) and **SEED** (`scripts/seed.ts` + `db:seed-colleges`). Chromium,
1440 px unless stated. Every repro is a script in `docs/qa/b/repro/` (`lib.mjs` has the
logins; `SEED=1` selects the seed accounts and server). Screenshots are in
`docs/qa/b/screens/`; Playwright traces are written to `e2e/.artifacts/qa-b/<name>-trace.zip`
(git-ignored; re-run the script to regenerate, open with `npx playwright show-trace`).
"Severity" lines below are Tester B's call against the ledger's own definition
(P1 = wrong behaviour a user will hit).

### QA-003
- Reproduced: **yes**, both DBs. Role admin, `/admin/interns/[id]`, 1440 px.
- Steps: sign in as admin, open any candidate that has Aadhaar and PAN
  (`node docs/qa/b/repro/qa003.mjs <internId>`).
- Expected: Aadhaar and PAN masked to the last 4, with an audit-logged reveal.
- Actual: the card prints the full 12-digit Aadhaar and the full 10-character PAN
  in the page text (the script's regex finds both; no masked form and no
  reveal/show control on the page).
- Evidence: `docs/qa/b/screens/qa-003-admin-intern-*.png`; trace `qa-003-*-trace.zip`.
- Severity: **P1 confirmed** (sensitive identifiers rendered to every admin role that can
  open the candidate page, and sent in the HTML). Also worth checking in the fix: the
  CSV export and `/api/admin/interns/[id]` payloads.

### QA-004
- Reproduced: **yes**, on both DBs (so the seed is not needed for the two-score case).
- Steps: intern login; read the score on `/intern/dashboard`, `/intern/profile`,
  `/intern/interviews`, then `/intern/record` (`node docs/qa/b/repro/qa004.mjs`).
- Actual, LIVE-COPY hired intern: dashboard, profile and interviews show Findtern Score 8.0
  with Coding 8; Record shows Coding 7 (Overall 8). SEED intern: 8.8 / Coding 9.3 on the
  other pages, Record Coding 8.5.
- Root cause: two stores. The other pages read the intern's **current** score and ratings
  from `intern_onboarding.extra_data` (`findternScore`, `ratings`). Record's "Findtern Score
  published" cards come from `deriveProofs()` in `src/lib/journey.ts`, which reads the
  **per-proposal snapshot** `proposals.ai_ratings` (written when each proposal was sent,
  `api/employer/[id]/proposals/route.ts:239`). After a re-score the snapshots are stale.
  Record also emits **one score card per proposal** (the live-copy intern has two
  identical cards; the seed intern has 28 proofs), so the same score is "published" repeatedly.
- Suggested fix: Record shows one score card from `extra_data` (current), dated by
  `approvedAt`; keep snapshots only where the *offer* is shown (employer and intern proposal pages).
- Evidence: `docs/qa/b/screens/qa-004-record-*.png`, `qa-004-dashboard-*.png`; trace `qa-004-*-trace.zip`.
- Severity: **P1 confirmed** (Record is the exported artefact: `recordAsText` writes the stale figure).

### QA-005
- Reproduced: **yes**, SEED only (`node docs/qa/b/repro/qa005.mjs`, employer owning a submitted sheet).
- Steps: employer opens a submitted timesheet whose days are all unfilled, clicks Approve.
- Actual: the page itself says "30 days were left empty. Worth asking about before you
  approve." but Approve is enabled and the click succeeds (status `approved`, `approved_at` set).
  `PATCH /api/timesheets/[id]/decision` checks only `status === "submitted"`; it never checks the days.
- Reachability: the intern submit route refuses unfilled days, and the employer edit route can only
  set a status from the enum, so the new-app flow cannot produce a submitted sheet with empty days.
  The LIVE-COPY has no such sheet (both submitted sheets have 30/30 days filled). The 0-day sheets
  are SEED rows, and any legacy row like them.
- Severity: **P1 kept as logged, low likelihood** (P2 if you count only reachable states). The server-side
  rule is missing, so a legacy row or a hand-made request can still approve. Fix at the decision route
  (409 with the count of unfilled days), keep the UI warning, disable Approve until filled.
- Evidence: `docs/qa/b/screens/qa-005-timesheet-zero-days.png`, `qa-005-after-approve.png`; trace `qa-005-trace.zip`.

### QA-006
- Reproduced: **yes** (link target; 375 px, signed out; `node docs/qa/b/repro/qa006.mjs <token>`).
- Steps: open a live drive link signed out, tap "Create an employer account".
- Actual: the link is `/employer/signup` with no `next`, while "Sign in to enter" next to it carries
  `?next=/drive/<token>`. `EmployerSignupForm` takes no `next` and always does
  `router.push("/employer/onboarding")` (`src/components/employer/employer-signup-form.tsx:152`), so the
  drive is lost even if `next` were passed. (The Google path in the signup page does read `next`.)
- Extra, same route: an unknown or too-short token renders the 404 screen with **HTTP 200**
  (soft 404; `/nonexistent` correctly gives 404), and the title is doubled: "Campus drive | Findtern | Findtern"
  (the page's own title already ends in the layout template's suffix). The reading of "no error handling on its
  query" holds: the `select` is not wrapped, so a database error is an unhandled 500.
- Severity: **P1 kept** by the ledger's definition (a new employer from a drive loses the drive at
  signup; it is recoverable by reopening the link). The soft 404 and the title are P2.
- Evidence: `docs/qa/b/screens/qa-006-drive-signedout-375.png`; trace `qa-006-trace.zip`.

### QA-007 (root cause: three causes, not one)
- Reproduced: **yes**, on SEED. On the LIVE-COPY only the companies list reproduces.
  The four mismatches do **not** share one root cause. They split like this:
  1. **Companies list 0/0/0 vs detail 3/9/0: a real code defect, one cause.**
     `src/app/admin/companies/page.tsx:25-28` builds `projectCount`, `proposalCount`, `hireCount` and
     `paidTotal` as correlated subqueries that interpolate `${schema.employers.id}`. In a single-table
     `db.select`, Drizzle prints that as a bare `"id"` (verified: it emits
     `where p.employer_id = "id"`), which binds to the inner table's own `id`, so every count is 0 and
     "Paid" is "-". The repo already documents this bug class and has `q()` in `src/lib/college/sql.ts`
     for it. Also reproduces on the LIVE-COPY: "Heavy Data Co" (55 projects) shows 0. `admin/projects`
     is **not** affected (its select has a join, so the column is qualified). Fix: use `q(schema.employers, schema.employers.id)`.
  2. **Admin hires 0 vs 13, and transactions "Received ₹0" vs orders ₹2,80,000: seed data, plus one real
     inconsistency in the vocabulary.** The seed writes employer payments with status `captured` and
     marks 13 proposals `accepted` with none `hired` (`scripts/seed.ts`: `isHired = status === "accepted"`,
     `status: "captured"`). The app writes and reads `paid` / `hired` everywhere (`payments.ts`,
     admin dashboard, transactions, reports, companies), so those pages correctly show ₹0 and 0 hires for
     that data. The pages that disagree are the two that accept **both** words: `isPaidRow` in
     `src/lib/admin/invoice-rows.ts` (admin Orders: "Collected ₹2,80,000, 8 paid") and
     `src/app/employer/orders/page.tsx:146`. So one definition of "paid" is not shared: the code has
     `paid` strictly in about nine places and `paid|captured` in two. The LIVE-COPY has only `paid` rows,
     so nothing disagrees there, and no ₹0 free-mode order was needed to explain any symptom.
     A payment can never be `captured` while its proposal stays `accepted` in the real flow
     (settlement sets both), so the seed describes a state the app cannot produce.
     Suggested: fix the seed (`paid`, and `hired` for paid placements), and give "paid" one shared predicate
     (or drop `captured` from the two readers if no legacy row uses it; the 27 Oct dump has none).
  3. **Employer Orders "3 payments due" vs "Nothing outstanding": a real, smaller defect.**
     The "N payments due" button counts **accepted-but-unpaid offers** (`payableCheckout`), while the
     "Still to pay" tile sums the ledger of **hired** placements only (`placementLedger` over `hired`).
     A new employer whose first offer has just been accepted sees "1 payment due" next to
     "Nothing outstanding". Reproduces on SEED (3 due, 0 hires) and is reachable in real data.
     The tile should say "Nothing outstanding on hires" or include the accepted offers' total.
- Severity: item 1 **P1 confirmed**; item 2 is a seed/data defect, P2 for the shared-predicate cleanup;
  item 3 **P2** (the pages are each correct for what they define, the labels contradict).
- Evidence: `docs/qa/b/screens/qa-007-*-3503.png` (SEED) and `-3502.png` (LIVE-COPY);
  scripts `qa007.mjs`, `qa007-companies.mjs`, `qa007-projects.mjs`; traces `qa-007-*-trace.zip`.

### QA-008
- Reproduced: **yes**, SEED (`docs/qa/b/screens/qa-008-employer-dashboard-3503.png`). Employer dashboard
  hero "4 things need you" over a 2-row "Waiting on you" list ("3 payments due", "1 meeting waiting").
  Cause: the hero sums the **item counts** of each task row (`waiting = tasks.reduce((n, t) => n + t.count, 0)`,
  `src/app/employer/dashboard/page.tsx:128`) while the list shows one row per task type. On the LIVE-COPY
  both say 1, so it only shows when a row has a count above 1. Severity **P2 confirmed**.
  Fix: say "3 payments and 1 meeting need you", or count rows in both places.

### QA-009
- Reproduced: **yes**, on both DBs, but on `/admin/dashboard` (the ledger says `/admin/reports`; the metric
  "Avg hiring speed" is not on Reports). SEED shows −9.8 days, LIVE-COPY −1.4 days.
- Cause: `src/app/admin/dashboard/page.tsx:214-221` averages `coalesce(hired_at, updated_at) - created_at`
  over `accepted`/`hired` proposals with no guard. SEED: 8 of 13 rows have `updated_at < created_at`;
  LIVE-COPY: 5 of 17 hired rows have `hired_at < created_at`. Fix: filter or clamp `>= created_at`
  (and prefer a real accepted-at timestamp, since `updated_at` moves on any edit).
- Severity: **P2 confirmed**. Evidence: `docs/qa/b/screens/qa-009-dashboard-*.png`.

### QA-010
- Reproduced: **yes, with a correction.** A **hired** intern is told "You are doing this role now." (correct).
  The wrong text is for every other status: an `accepted` offer (SEED) says "You have an offer for this
  role." and the pill says "Offer received", and the same applies to rejected, withdrawn and expired offers.
  Cause: `src/app/intern/opportunities/[id]/page.tsx:75-83` special-cases only `hired` and `sent`.
- Severity: **P2 confirmed**, wording should be per status ("You accepted this offer", "You declined it", ...).
- Evidence: `docs/qa/b/screens/qa-010-opportunity-accepted-3503.png`, `...-hired-3502.png`.

### QA-011
- Reproduced: **no.** On the LIVE-COPY the hired intern with saved bank details sees the bank form
  **filled** (name, holder, account, IFSC); on SEED the intern has payouts but no saved bank details, so an
  empty form is correct. The seed pays a stipend to someone with nothing on file, which a real
  flow does not allow. Recommendation: close as a seed-data artefact.
- Residual, optional (P3): the saved full account number is shown unmasked in an editable input.
- Evidence: `docs/qa/b/screens/qa-011-settings-*.png`; script `qa011.mjs`.

### QA-012
- Reproduced: **yes**, both DBs. `/employer/account` shows "Profile Complete" while all four escalation
  fields (marked required) are empty. In the LIVE-COPY all 16 onboarded employers have an empty escalation
  contact (the field is newer than they are), so every existing company hits this. The badge follows
  `onboardingCompleted` only. Severity **P2 confirmed**; also decide whether saving the form then blocks on the
  now-required fields.
- Evidence: `docs/qa/b/screens/qa-012-account-*.png`; script `qa012.mjs`.

### QA-013
- Reproduced: **yes**, SEED with a second drive added (a revoked drive that starts later than the live one,
  made by SQL; use UTC for the timestamps, the columns have no time zone). College `/college/drives` lists
  "Winter drive 2026 (closed) · Link closed" above "Summer internship drive 2027 · Live".
  Cause: `drivesOverview` in `src/lib/college/drives.ts` is `ORDER BY starts_at DESC`, regardless of state.
  Severity **P2 confirmed**. Fix: order by state (live, upcoming, ended, closed) then start.
- Evidence: `docs/qa/b/screens/qa-013-college-drives-3503.png`; script `qa013.mjs`.

### QA-014
- Reproduced: **yes**, SEED intern (`preferred_locations = ["Bengaluru","Bengaluru","Remote"]`):
  `/employer/intern/[id]` shows "Prefers Bengaluru, Bengaluru, Remote". The page maps each entry to its first
  comma part and joins them (`page.tsx:554`) with no de-duplication, so the same thing happens in real
  data for two entries in one city and different states ("Mumbai, Maharashtra" + "Mumbai, Gujarat").
  The LIVE-COPY has no such row. Severity **P2 confirmed**.
- Evidence: `docs/qa/b/screens/qa-014-intern-detail-3503.png`.

### QA-015
- Reproduced: **yes**, both DBs. `/intern/record` shows "Start 2026-09-17" (LIVE-COPY) and "Start 2026-10-30"
  (SEED). `deriveProofs` passes `offer.startDate` through raw (`src/lib/journey.ts:486`). Also: the same block reads
  `offer.durationWeeks` and `offer.hoursPerWeek`, which the app's offer shape does not carry
  (it has `duration: "3m"` and `monthlyHours`), so those two facts never appear. Severity **P2 confirmed**.
- Evidence: `docs/qa/b/screens/qa-015-record-*.png`.

### QA-016
- Reproduced: **yes**, both DBs. `/admin/account`, Password panel header: "8 or more characters, with upper and lower
  case letters and a number." Directly under "New password": "At least 8 characters, with a lowercase letter, an
  uppercase letter, a number and a special character." The header copy is hard-coded in
  `src/app/admin/account/page.tsx:48` (and again in `staff-roles-manager.tsx:492`); the hint is the shared
  `change-password-form.tsx`. Severity **P2 confirmed**; the form hint is the one that matches the policy.
- Evidence: `docs/qa/b/screens/qa-016-admin-account-*.png`.

### QA-004 (addendum, Tester B)
- Re-score proof: as admin I set all four ratings to 9 on an intern (`node docs/qa/b/repro/admin-score.mjs <id>`).
  Immediately after: `/intern/dashboard` and `/intern/profile` show Findtern Score 9.0 and Coding 9.0;
  `/intern/record` still shows Coding 7/10 (the snapshot on the intern's proposals). Confirms the cause above.

### QA-100
- Steps: Chromium with mobile emulation at 375 px, open `/faq` (or `/`, `/pricing`, any marketing page); read the
  "Open menu" button bounds and `document.documentElement.scrollWidth` (`node docs/qa/b/repro/verify-x1.mjs`).
- Expected: the button's right edge at 355 or less (20 px gutter); `scrollWidth` equals `innerWidth`.
- Actual: button spans x=344 to 384; `scrollWidth` 385 (the layout viewport grows to 385). In my non-mobile WebKit
  context the same pages report 375/375, so confirm on a real phone.
- Evidence: `docs/qa/b/bs7-marketing-results.md` (X1), trace `e2e/.artifacts/qa-b/verify-x1-chromium-trace.zip`.
- Severity: **P1** (every marketing page scrolls sideways on a phone; the done-definition bans sideways scroll).

### QA-101
- Steps: 375 px, signed out, open `/employer/signup` (`node docs/qa/b/repro/inspect.mjs anon /employer/signup 375`).
- Actual: country-code select 269 x 44, phone input 50 x 44 (placeholder cut to "98'"). Same row on `/signup` is 144 + 175.
- Evidence: `docs/qa/b/screens/inspect-anon--employer-signup-375.png`. Severity **P1** (a required field is unreadable while typing).

### QA-102
- Steps: 375 px; wait 3 s for the bubble; scroll to the bottom of `/signup`, `/employer/signup`, `/faq`, `/about`.
- Actual: the launcher (141 x 64, fixed) sits over the right end of the Password field (employer signup), over the
  "Employer sign in" link (intern signup footer) and over the footer's last line and copy-email icon; the bubble
  ("Questions about Findtern? Ask me") stays up until dismissed.
- Expected: bottom padding equal to the launcher height, or the launcher hides on forms.
- Evidence: `docs/qa/b/screens/inspect-anon--employer-signup-375.png`, `flow-intern-signup-filled-375-chromium.png`;
  marketing sub-run X2 in `docs/qa/b/bs7-marketing-results.md`. Severity **P1** (covers an input and a link).

### QA-103
- Steps: admin, 375 px, `/admin/payouts?status=pending`, tap "Mark paid or failed" on a row (`node docs/qa/b/repro/admin-payout.mjs`).
- Actual: the editor is inside the table's scroll container ("Scroll sideways to see every column"): "Fail..." is cut
  at the right edge, "Bank reference (required wh..." and "Cancel" are partly out of view. Pressing "Done" with no
  reference shows the right message but only after a 400 from the API. With a reference the payout is marked paid (14 pending to 13).
- Evidence: `docs/qa/b/screens/admin-payout-dialog-375.png`; trace `admin-payout-trace.zip`. Severity **P2** (works after scrolling).

### QA-104
- Steps: admin, 375 px, `/admin/interns/[id]` (`node docs/qa/b/repro/admin-controls.mjs /admin/interns/<id> 375`).
- Actual (px): "Remove React" 12 x 12, "Level for React" select 25 high, "Add" 60 x 36, "Save" 63 x 36,
  "Save ratings and links" 36 high, "Edit contact" 36 high. Payouts: "Apply" 36 high.
- Evidence: `docs/qa/b/screens/admin-controls--admin-interns-*-375.png`. Severity **P2**.

### QA-105 / QA-106
- From the marketing sub-run (`docs/qa/b/bs7-marketing-results.md`, X3 and Observations). QA-105: with "Prices in" set to USD
  the home and About stats strip still reads "₹5,000". QA-106: calculator copy "8 h x 5 d x 4 weeks = 160 hours".
  Not re-measured by me beyond reading the page text; severity as logged.

### QA-107
- Steps: intern 375 px, fill steps 1 to 3, reload `/intern/onboarding` (`node docs/qa/b/repro/onb-resume.mjs`).
- Actual: "Step 1 of 8 · About you"; fields and uploads are kept ("Replace Aadhaar card"), steps 2 to 8 stay unlocked.
- Expected: reopen on the first unfinished step. Severity **P2**.

### QA-108
- Evidence: accept dialog "This tells The company yes for a start on 6 Nov 2026." (`docs/qa/b/screens/intern-accept-dialog-375-webkit.png`);
  dashboard activity "Waiting for Hidden company to complete the payment." Severity **P2** (copy).

### QA-109
- Steps: sign up two interns, give the second the first one's emergency number at step 1.
- Actual: 409 `{"error":"This number is already in use on Findtern. Use a different emergency contact.","fields":{"emergencyPhone":...}}`
  and the wizard jumps back to step 1. Same rule for a mobile number ("Phone number already in use", correct) and for an Aadhaar
  number ("already linked to another account", correct). Only the emergency number looks like a wrong rule. Severity **P2**, product call.

### QA-110
- Steps: WebKit (Playwright) against a production build over http: signup, enter the emailed code.
  Network: `send-otp` 200, `verify-otp` 200, then `POST /api/auth/signup` 400 "Verify your email before creating the account".
  Chromium (which accepts Secure cookies on localhost) passes. Cause: `src/lib/signup-otp.ts` sets the proof cookie with
  `secure: process.env.NODE_ENV === "production"`, where `src/lib/auth.ts` uses `isHttps()` (honours `x-forwarded-proto`).
  The same applies to the employer signup. My WebKit runs worked around it by creating the account in Chromium.
- Severity **P2** (only non-TLS deployments); fix: use `isHttps()` for the proof cookie.

### QA-111
- Steps: `node docs/qa/b/repro/webkit-home.mjs 375` (and 1440), then `webkit-home-bisect.mjs`, `webkit-home-novideotag.mjs`.
- Actual: "page.goto: Page crashed" on `/` 6 of 6. `/faq /pricing /about /contact /interns /employers /login /blog` load.
  Document only (JS off, CSS blocked, subresources aborted): still crashes. Same document with `<video>` removed: loads.
- Reading: Playwright's Linux WebKit has no H.264 pipeline, which is the usual cause; real Safari should be fine,
  but it is the home page and the owner will open it on an iPhone, so please check once on a device.
- Severity: **P1 until cleared on a real device** (then close as environment).

### Tester B: employer-side findings (QA-112 to QA-117, plus additions to QA-102, QA-107, QA-110)
- Source: the employer sub-run, `docs/qa/b/bs7-employer-results.md` (defects D1 to D11 with steps and screenshots), 375 px in
  Chromium and WebKit and 1440 px; scripts `docs/qa/b/repro/bs7-employer-*.mjs`. I read the evidence and the screenshots it
  cites, but did not re-run every step myself, except where noted.
- **QA-102 addition (D1, D11):** the same "Stuck somewhere? Ask me" bubble sits on the **"Agree and send"** button of the
  proposal policy dialog at 375 (Playwright: the bubble "intercepts pointer events", 57 retries; only the left ~55 px of the 293 px
  button can be tapped and the label is hidden). The dialog is modal, so the bubble cannot be dismissed. It also covers Edit / Delete on
  project cards, the "No hires yet" dashboard tile, the next candidate's score, and the Skills field on employer onboarding step 2.
  This is the one that makes **QA-102 P1** rather than cosmetic. Screenshot: `docs/qa/b/screens/bs7-emp-phone-sendprop-policy-chromium.png`.
- **QA-107 addition (D10):** employer onboarding also reopens at step 1 after a reload, values kept. Screenshot `bs7-emp-onb-step2-375.png`.
- **QA-110 addition (D3):** the employer signup fails the same way in WebKit over http (verify-otp 200, then employer signup 400).
  The employer sub-run also tried stripping `Secure` from the cookie and it still failed, so the cause above is likely but not proven; confirm on https or a real iPhone.
- **Not logged (environment):** `/api/intern/avatar` 404s on candidates and compare (D9) and on every intern page: uploads are not served locally (known non-bug in the brief).
- **Not tested by either of us:** Google sign-in and calendar (no keys), real payments, live email, the AI-interview provider.
