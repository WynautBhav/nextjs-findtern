# Bug ledger (release/master-merge)

Severity: P0 = blocks a flow, data loss or security; P1 = wrong behaviour a
user will hit; P2 = cosmetic. Status: open → fixed (awaiting retest) → closed,
or deferred (with reason). Fix commits name the ID: `fix(QA-001): ...`.
The tester (nextjs-findtern-1a) owns this file; the builder appends status
lines only.

| ID | Sev | Role | Route | Width / browser | Status | Summary |
|---|---|---|---|---|---|---|
| QA-001 | P1 | employer, intern | /employer/drives/[id] (accept a drive call) | any | closed | Production build without the Google calendar token: `src/lib/college/meetings.ts` returns `link: null` (the Jitsi stand-in is dev-only), yet `requestMeeting` still accepts the call, so the student gets an accepted call with no join link. Expected: refuse with "Calendar not connected; ask Findtern to connect it" (and the admin sees it in attention), never a silent null. Found by the Opus session during WP1 (e2e 7/9 under `next start`). |
| QA-002 | P2 | intern | /intern/dashboard, /intern/record (any page with a Thread "action" node) | any width, Chromium; only with `prefers-reduced-motion: reduce` | closed (28 Oct, tester A: fix(QA-002b) verified) | React error #418 (hydration mismatch) in the console on every load. `src/components/app/count-up.tsx`: the server renders `display` (state starts at 0), but under reduced motion the client's first render already returns the formatted final `value`, so the server HTML and the first client render differ. React recovers by client-rendering the subtree, so the user sees no wrong number, but it is a console error, a wasted re-render, and a flash of 0 on slower devices for exactly the users who asked for less motion. |

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
- Retest (tester A, 28 Oct): **closed**. Production build of wp/qa-a on 733c683 (includes
  fix(QA-002b)), own database clone, Chromium. `QA_REBUILD=1 npm run qa -- motion`: 0
  findings; text length identical with and without reduced motion on all ten page×width
  combinations. Repeat run `E2E_PORT=3501 node e2e/retest-qa002.mjs` (6 loads per page ×
  {390, 1440}, `reducedMotion: "reduce"`): `/intern/dashboard`, `/intern/record`,
  `/intern/earnings`, `/employer/dashboard`, `/admin/dashboard` all 0/6 loads with a console
  or page error (was 6/6 on dashboard and record). The server HTML (fetched without JS)
  carries the real figures on every page (e.g. earnings ₹15,010 / ₹13,200), not a 0.

### QA-003 to QA-016
- Source: the builder's design briefs (docs/design/briefs.md, "Found while
  briefing: not design"), seen on the SEED DB while taking the baseline.
- Logged by the orchestrator on 28 Oct after the tester session exited;
  severities are the orchestrator's calls. Steps and traces to be added on
  reproduction against the 5436 QA copy.
