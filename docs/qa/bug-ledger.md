# Bug ledger (release/master-merge)

Severity: P0 = blocks a flow, data loss or security; P1 = wrong behaviour a
user will hit; P2 = cosmetic. Status: open → fixed (awaiting retest) → closed,
or deferred (with reason). Fix commits name the ID: `fix(QA-001): ...`.
The tester (nextjs-findtern-1a) owns this file; the builder appends status
lines only.

| ID | Sev | Role | Route | Width / browser | Status | Summary |
|---|---|---|---|---|---|---|
| QA-001 | P1 | employer, intern | /employer/drives/[id] (accept a drive call) | any | closed | Production build without the Google calendar token: `src/lib/college/meetings.ts` returns `link: null` (the Jitsi stand-in is dev-only), yet `requestMeeting` still accepts the call, so the student gets an accepted call with no join link. Expected: refuse with "Calendar not connected; ask Findtern to connect it" (and the admin sees it in attention), never a silent null. Found by the Opus session during WP1 (e2e 7/9 under `next start`). |
| QA-002 | P2 | intern (also any CountUp user) | /intern/dashboard | any width, Chromium; only with `prefers-reduced-motion: reduce` | open | React error #418 (hydration mismatch, text) in the console on every load. `src/components/app/count-up.tsx`: the server renders `display` (state starts at 0), but under reduced motion the client's first render already returns the formatted final `value`, so the server HTML and the first client render differ. React recovers by client-rendering the subtree, so the user sees no wrong number, but it is a console error, a wasted re-render, and a flash of 0 on slower devices for exactly the users who asked for less motion. |

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
