# Bug ledger (release/master-merge)

Severity: P0 = blocks a flow, data loss or security; P1 = wrong behaviour a
user will hit; P2 = cosmetic. Status: open → fixed (awaiting retest) → closed,
or deferred (with reason). Fix commits name the ID: `fix(QA-001): ...`.
The tester (nextjs-findtern-1a) owns this file; the builder appends status
lines only.

| ID | Sev | Role | Route | Width / browser | Status | Summary |
|---|---|---|---|---|---|---|
| QA-001 | P1 | employer, intern | /employer/drives/[id] (accept a drive call) | any | open | Production build without the Google calendar token: `src/lib/college/meetings.ts` returns `link: null` (the Jitsi stand-in is dev-only), yet `requestMeeting` still accepts the call, so the student gets an accepted call with no join link. Expected: refuse with "Calendar not connected; ask Findtern to connect it" (and the admin sees it in attention), never a silent null. Found by the Opus session during WP1 (e2e 7/9 under `next start`). |

## Details

### QA-001
- Steps: production build (`next start`) with `GOOGLE_CLIENT_ID` set but no
  row for `CALENDAR_TOKEN_OWNER` in `employer_google_tokens`; as an
  employer in a live drive, request a call; as the student, accept.
- Actual: `drive_meetings.meeting_link` is null; the student's card shows
  no Join button.
- Trace: not yet (tester to attach on retest).
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus, fix(QA-001)).
  `requestMeeting` refuses with "Calendar not connected; ask Findtern to
  connect it." when no link can be made (no row is written, so no
  notification goes out); accepting a call that has no link is refused (409)
  for older rows; the admin dashboard lists "Google calendar not connected"
  first when Google is configured with no `CALENDAR_TOKEN_OWNER` token, or
  when production has no Google config. college-partners.e2e under
  `next start` now asserts the refusal and skips accept/join/cancel with a
  reason (7 pass, 2 skipped); on `next dev`, 9/9.
