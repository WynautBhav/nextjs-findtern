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

| QA-003 | P1 | admin | /admin/interns/[id] | any | closed | Candidate detail shows the full Aadhaar and PAN numbers. Expected: masked to the last 4, with an explicit reveal that is audit-logged. Sensitive-data exposure even though admin-only. |
| QA-004 | P1 | intern | /intern/record vs /intern/dashboard, /interviews, /profile, /proposals/[id] | any | open | Two different Findtern scores for the same intern: 8.8 (Coding 9.3) on Home/Interviews/Profile/Offer, 8.2 (Coding 8.5) on Record. One page computes from the wrong source. Find which is stored and fix the other. |
| QA-005 | P1 | employer | /employer/timesheets/[id] | any | closed | A timesheet with 0 days filled could be approved. Expected: approve is refused (or disabled) until every day has a status, as the intern-side submit rule requires. |
| QA-006 | P1 | employer (signup via college drive) | /drive/[token] → employer signup | any | closed | Signing up from a drive link loses the drive (`next` not carried), and the route has no error handling on its query. Source reading by the builder; verify in the browser. |
| QA-007 | P1 | employer, admin | /employer/orders; /admin/dashboard, /admin/proposal-tracker, /admin/reports, /admin/transactions, /admin/companies | any | closed | Money/hire counts disagree across pages: orders "3 payments due" vs "Nothing outstanding"; admin hires 0 vs 13; transactions "Received ₹0" vs orders ₹2,80,000; companies list 0 projects/proposals vs detail 3/9. Likely one root cause (₹0 free-mode test orders, or a status filter, counted differently per page). Verify and fix at the source, then each symptom. |
| QA-008 | P2 | employer | /employer/dashboard | any | open | Hero says "4 things need you" above a 2-item "Waiting on you" list; the two counts come from different rules. |
| QA-009 | P2 | admin | /admin/reports | any | closed | "Avg hiring speed −9.8 days": a negative duration; the date pair is reversed or includes unhired rows. |
| QA-010 | P2 | intern | /intern/opportunities/[id] | any | open | Role detail tells a hired intern "You have an offer for this role"; should reflect the hire. |
| QA-011 | P2 | intern | /intern/settings | any | open | A paid intern with saved bank details sees an empty bank form and no read-only saved state. |
| QA-012 | P2 | employer | /employer/account | any | open | "Profile complete" shown while required escalation-contact fields are empty. |
| QA-013 | P2 | college | /college/drives | any | open | A closed drive is sorted above the live one. |
| QA-014 | P2 | employer | /employer/intern/[id] | any | open | Preferred cities not deduplicated ("Bengaluru, Bengaluru, Remote"). Builder fixes within the employer redesign. |
| QA-015 | P2 | intern | /intern/record | any | open | A raw ISO date ("2026-10-30") is shown instead of the DD/MM/YYYY format. Builder fixes within the intern redesign. |
| QA-016 | P2 | admin | /admin/account | any | closed | Two different password rules stated on the same page. Builder fixes within the admin redesign. |
| QA-100 | P1 | all (marketing) | every marketing page, e.g. `/`, `/faq`, `/pricing` | 375, Chromium | closed | Header is wider than the phone: the menu button spans x=344 to 384, so `scrollWidth` is 384/385 and the page scrolls sideways (the larger logo from NC-r2 is the likely cause). Found by the marketing sub-run, verified by Tester B. |
| QA-101 | P1 | employer (signup) | /employer/signup | 375 | closed | Phone number input is 50 px wide beside a 269 px country-code select; the number shows as "98'" and cannot be read or checked while typing. The intern signup form is fine (175 px). |
| QA-102 | P1 | everyone | marketing footer, auth pages, onboarding | 375 | closed | The floating "Ask me" button (141 x 64) and its prompt bubble cover real content: the right end of the Password field on employer signup, the "Employer sign in" link at the end of the intern signup, the footer copyright line and the "Copy email" icon on /faq and /about. The page has no bottom padding to scroll them clear. |
| QA-103 | P2 | admin | /admin/payouts ("Mark paid or failed") | 375 | closed | The payout editor opens inside the horizontally scrolling table: "Failed", the reference label and "Cancel" are cut off; the admin has to scroll sideways to reach them. Also fires a 400 to the API when "Done" is pressed with no reference (the message is correct, but the check is server-side only). |
| QA-104 | P2 | admin | /admin/interns/[id], payouts, candidate lists | 375 | open | Tap targets far under 44 px: skill "Remove" buttons 12 x 12, skill level selects 25 px high, Save / Add / Apply 36 px, "Edit contact" 36 px. |
| QA-105 | P2 | employer (USD), signed out | `/`, `/about` | any | open | With USD selected the stats strip still says "₹5,000 Fixed per-hire fee" while /pricing says "$50". Found by the marketing sub-run. |
| QA-106 | P2 | everyone | `/pricing` calculator | any | open | Hours are 5 days x 4 weeks = 160 h and 6 x 4 = 192 h; the owner decision (and plan) is a flat 22 or 26 days a month, i.e. 176 h and 208 h at 8 h a day. Needs the owner's confirmation which number the marketing page should show. |
| QA-107 | P2 | intern | /intern/onboarding | any | open | Reloading the page returns to "Step 1 of 8" although the entered data is kept and the later steps are unlocked; the user has to press Continue seven times to get back. |
| QA-108 | P2 | intern | /intern/proposals/[id] and the accept dialog | any | open | Copy reads wrongly with the company hidden: "This tells The company yes for a start on ..." (capital T mid-sentence) and "Waiting for Hidden company to complete the payment." |
| QA-109 | P2 | intern | /intern/onboarding step 1 | any | open | An emergency number already used by any other account is refused ("This number is already in use on Findtern. Use a different emergency contact."). Two siblings cannot give the same parent's number. Product call: allow duplicates for the emergency number. |
| QA-110 | P2 | everyone using Safari (WebKit) | signup, employer signup, any form with the OTP proof | http only | open | The signup OTP proof cookie (`ft_otp`) is set `Secure` from `NODE_ENV === "production"` instead of the request-aware `isHttps()` the session cookie uses, so WebKit drops it on an http deployment and "Create account" answers "Verify your email before creating the account" right after a verified code. Real HTTPS production is not affected; a non-TLS staging or an internal `next start` is. |
| QA-111 | P1 (unverified) | everyone using Safari | `/` | any, WebKit (Playwright, Linux) | open | Playwright's WebKit build crashes ("Page crashed") on the home page, 100% of 6 loads at 375 and 1440 px. Every other marketing and app route loads. Bisect: the document alone (no JS, no CSS, no subresources) crashes; the same document with the `<video>` element removed loads. Very likely the build lacking media codecs, not the app, so this needs a check on a real iPhone or Safari before it is cleared. |
| QA-112 | P2 (unconfirmed) | employer | /employer/checkout, /employer/orders (bug-sheet S1-r121) | any | closed | "Whole engagement" for a 2-month offer at 26,400 a month shows engagement ₹24,000 + fee ₹5,000 = ₹29,000, cheaper than the monthly option's first payment ₹31,400; after paying, Orders says "Paid so far ₹29,000, Still to pay ₹29,000, Next instalment 17 Sept 2026" (a past date). The offer is a QA-seed row whose stored fields disagree (`totalPrice` 24,000 against 2 x `monthlyAmount` 26,400), so this is not proven on an offer sent through the form. Retest with a fresh offer before fixing. |
| QA-113 | P2 | employer | /employer/send-proposal?intern=<id> | 375 | open | The form is reachable for a candidate whose meeting is still open (the cart correctly says "available once the meeting is completed"); only after the 9 s policy dialog does the server answer 409 "The offer opens once the interview has happened.", shown as a toast. Block the form, or show the reason inline. |
| QA-114 | P2 | employer (non-India) | /employer/onboarding | 375 | open | Country UAE: State and City are free-text; "Billing PIN code - Only needed for an Indian billing address" still errors "PIN code must be 6 digits" for 5 digits; the escalation phone code stays +91 ("Indian numbers must be 10 digits"). |
| QA-115 | P2 | employer | /employer/proposal/[id] | 1440 | open | "Withdraw offer" on an accepted-unpaid offer acts on one click with no confirmation. |
| QA-116 | P2 | employer | candidates, dashboard, projects, proposals, schedule, orders | 375 | open | Tap targets under 44 px: Shortlist 112 x 40, Send proposal 162 x 40, Quick view 121 x 40, Compare 114 x 40, view toggles 36 x 36, skill chips 38 high, "Show everyone" 24 high, "Manage" 60 x 20, project filter tabs 40, Edit / Withdraw / View 36, Join meeting / Reschedule / Leave feedback 36, project-name links 23 high. Full list in `docs/qa/b/bs7-employer-results.md` (D7). |
| QA-117 | P2 | employer | candidate cards, quick view, project cards | 375 | open | Text cut off: the rating label "AI interview" shows as "AI intervie..."; the Scope / Work mode / Timezone labels on project cards are clipped by their containers. |
| QA-118 | P1 | employer | /employer/drives | 375, Chromium + WebKit | closed | The page's content is 668 px wide inside a 375 px screen and the shell clips it: the drive card's right edge and its closing date ("closes Wed, 4 N…") are cut off, with no way to scroll to them. The crawler's `scrollWidth` check cannot see this (the shell uses `overflow: clip`). |
| QA-119 | P2 | employer | /employer/intern/[id] | 375, both | closed | The price line "+ ₹5,000 per hire · set by the score band" runs to x=460 on a 375 px screen and is cut off at the card edge (page content 460 px wide, clipped). Same family as QA-118. |
| QA-120 | P2 | employer | /employer/proposals | 375 + 1440, both | closed | No row shows a visible action, only "⋯". DESIGN §0 wants one visible action chosen by state. Hired and Withdrawn rows get a menu with a single item ("Open offer"), and five different rows share the menu name "More actions for Product Intern". Keyboard, Esc and focus return work. |
| QA-121 | P2 | employer | /employer/schedule | 375 + 1440 | closed | Interview rows are cards with 2 to 4 visible buttons (Booked: Join meeting, Send reminder, Reschedule, Profile), no "⋯" and no single main action, against the aligned-row rule in DESIGN §0. At 375 the buttons stack into four lines per card. |
| QA-122 | P2 | employer | /employer/orders | 375 + 1440 | closed | A "Not paid" hire shows the same Timesheets / Contract / Full-time offer as a paid one and no Pay action; paying is only reachable from the header's amber "1 payment due". The wrong action for the state. |
| QA-123 | P2 | employer | /employer/orders, /employer/checkout, /employer/proposals | any | closed | Orders says "next instalment 17 Sept 2026" (41 days in the past); Checkout says "Due 6 Dec 2026" for a different hire; Proposals' "Payment due 0" sits next to "1 payment due" on Dashboard and Orders. Probably one seed row (start 17 Sept, never paid) but a past date must not be called "next". QA-007's three causes themselves are closed. |
| QA-124 | P2 | employer | /employer/cart (Shortlist), /employer/checkout | 375 | closed | The shortlist count reads 4 (header), 2 (tab) and "4 shortlisted" (heading) at once; the active "Shortlist" tab still lists cards that already have a proposal. Each card carries four buttons and repeats "₹5,000 per hire". The step chevrons wrap with a stray chevron at the start of line two. |
| QA-125 | P2 | employer | /employer/candidates | 375 + 1440 | closed | Two search boxes stacked ("Search & add skills…" and "Skill, city or keyword"); at 375 the first candidate starts below the first screen; the filter panel still has Apply and Reset buttons (DESIGN §0: filters apply on change). |
| QA-126 | P2 | employer | /employer/send-proposal | any | open (narrowed 28 Oct: dates fixed) | "Hours per month" and "Monthly amount" are plain text inputs with no `inputmode`, so phones open the letters keyboard. |
| QA-127 | P2 | employer | /employer/schedule | any | closed | The DD/MM/YYYY filter ignores "2026-10-31", "1/1/26" and "31/10" without any message, and applies "99/99/2026" as if it were a date ("No interviews match these filters"). |
| QA-128 | P2 | employer | booking dialog on /employer/cart | 375 | closed | After "Send meeting request" the confirmation says the meeting "shows on your Schedule once they do [pick]", but it is already on Schedule as "Waiting on candidate"; a second toast, "Stuck somewhere? Ask me", appears over the confirmation. |
| QA-129 | P2 | employer | /employer/checkout, /employer/send-proposal | any | closed | Copy tells from DESIGN §0: "Names unlock once the hire is paid."; the empty Send-a-proposal screen says the same thing three times ("Pick a candidate first." / "No candidate selected" / "You: pick a candidate first"). |
| QA-130 | P2 | employer | timesheets list, projects, proposals, orders | 375 | closed | Meta lines cut with an ellipsis where they could wrap: "17 Sept – 16 Oct 20…", "Remote · Up to 60 days · Full-ti…", "Ritika Verma · Data Analy…". |
| QA-131 | P2 | employer | proposals and schedule filter tabs; every dialog | 375 | closed | The tab strips scroll sideways with the last tab cut mid-word ("Paymer") and no hint; every dialog's close "×" is 16 x 16 px; the Approve / Send back choice is 40 px high. Extends QA-116. |
| QA-132 | P2 | employer | /employer/timesheets/[id] | any | closed | "Approve timesheet" commits on one tap with Approve pre-selected and no confirm; the page itself says it "can't be undone". |
| QA-133 | P2 (harness) | tester, employer | /employer/timesheets, /employer/timesheets/[id] | any | closed | `e2e/seed-situations.mjs:244` writes day statuses "present" / "off"; the app uses Present / Absent / Fixed off / Holiday. On every seeded sheet the review shows Present 0, Hours 0 and "Not filled 7" per week while the grid says "P present" and the list says "0 / 30 days present". Real submissions are fine. The review screen cannot be tested on the personas until this is fixed. |
| QA-134 | P2 | admin (and seed) | /admin/dashboard | any | closed | After the QA-009 fix "Avg hiring speed" skips rows whose `hired_at` is before `created_at` without saying so: 2 of 9 hired rows on a fresh seed (7 are reversed), 13 of 18 on the live copy. The tile shows no n. The seed writes the reversed dates. |
| QA-135 | P2 | everyone | /login, /employer/login (and likely the other sign-in pages) | any | closed | The tab title is "Sign in \| Findtern \| Findtern": the brand twice. |
| QA-136 | P2 | employer | /employer/candidates, every console page | 375 | closed | The floating "Ask me" button (kept on phones by design) still sits over the right half of the "Skill, city or keyword" search box at scroll 0. QA-102's fix covers marketing, auth and onboarding only. |
| QA-137 | P1 | intern | /intern/onboarding step 1, /intern/profile checklist (bug sheet 7 S1 r22, r41, r45) | any | open | Onboarding refuses to continue without an Aadhaar card image ("Upload a photo or scan of your Aadhaar card.") and the profile checklist item is "Aadhaar and PAN, with card images". The sheet says the Aadhaar number and the PAN image are mandatory and the Aadhaar image is not; the legacy app required only the PAN image. |
| QA-138 | P1 | everyone behind one shared address (colleges, offices) | sign-up code, sign-up, intern/employer login | any | open | The limiter keys on the client address alone: the 6th sign-up code request from one address in 15 minutes gets 429, the 6th sign-up in an hour and the 9th login in 15 minutes too. A campus lab or an office is one address, so a drive of 30 students cannot sign up, and it is the likeliest cause of bug sheet 7 NC r35 / r36 ("new account cannot log in", "several emails at once"). |
| QA-139 | P2 | employer | /employer/orders → /employer/checkout?proposal=… | any | closed | "Pay ₹29,000" on the unpaid hire (Ritika Verma) opens a Checkout that lists a different hire (Qab Tester, Month 2 of 2) at ₹26,400, and ₹29,000 cannot be derived from the offer (₹26,400 a month, total 24,000 on the row). Probably the QA seed's row, but the link's `?proposal=` should select that hire or say why it cannot be paid. |
| QA-140 | P2 | admin | /admin/orders, /admin/projects, /admin/notification-history, /admin/intern-invoices | 1440 | open | The tables do not fit: Orders is 1473 px wide in a 1102 px card, so the "Paid at" column and what follows are cut and need a sideways scroll; Projects 1185, Notification history 1197, Intern invoices 1110. At 375 the Analytics, Money, Roles and Notification-history tables also still scroll sideways. |
| QA-141 | P2 | admin | /admin/proposal-tracker, /admin/companies, /admin/projects, /admin/payouts, /admin/notification-history | 375 + 1440, both engines | open | Filter bars collide or overflow. Proposal pipeline: the Company and Candidate selects run past the card's right edge (423 to 510 px at 1440, 85 to 105 at 375), the search placeholder is cut, "More filters" sits under the "Rows" control. Companies, Projects, Notification history: the "Rows" label overlaps the select before it. Payouts: the "CSV" button touches "Rows". |
| QA-142 | P2 | admin | /admin/roles | 375 | open | Each staff row's role select is 62 px wide and shows "Adı", "Exe", "Exe", "Exe": the three Executive roles cannot be told apart on a phone (301 px only for the signed-in user's row). |
| QA-143 | P2 | admin | /admin/notification-history, /admin/settings | 375 | open | Text runs off the card instead of wrapping: the notification text ("A company invited you to an int…") in every history row, and the button label "Create plans from the built-in rate car…" (24 px past its box). |
| QA-144 | P2 | admin | every admin page (sidebar) | 1440 x 900 and shorter | open | The 20-item sidebar does not fit: at 900 px high Send notification, Notification history, Pricing and fees, Legal texts and Roles and access are below the fold, at 768 px Reports and Website content too. The nav scrolls but nothing says so beyond one clipped item. |
| QA-145 | P2 | admin | /admin/interns, /admin/companies (row "Deactivate", "Hide") | 1440 + 375 | open | Each row carries four inline controls ("Live Hide", "Active Deactivate") with the destructive one always in view, and the confirmation is the browser's own `window.confirm`, not an in-page dialog. An automated click on "Deactivate" looks like a dead button (no request, no dialog). |
| QA-146 | P2 | admin | candidates, users, projects, proposal pipeline, orders, payouts, promo codes, roles | 375 | open | Tap targets far under 44 px: name links 20 to 24 px high, "Select row" 16 x 16, role-matrix checkboxes 24 px (90 of them), promo-code toggles 37 x 21, "Excel template" and "CSV" links 24 px. QA-104 still stands; the payout editor itself is fine now (QA-103). |
| QA-147 | P2 | admin (and probably the intern side) | /admin/interns/non-disclosure | any | open | The page requests `/cdn/assets/sprites-core-jxe2m7va.svg` and gets a 404: pasted legacy HTML references an icon sprite that does not exist here (`<use href>`), so its icons are blank. |
| QA-148 | P2 | intern, admin | notification text (candidate bell, Admin > Notification history) | any | open | Notification templates use emoji and exclamation marks, which DESIGN §0 lists as copy tells: "🚀 Spotlight's on you, Qab - 1 profile view and counting!" (`src/app/employer/intern/[id]/page.tsx:155`) and "🎉 Hurray {name}! Your AI interview is complete…" (`src/lib/admin/score-live.ts:55`). Both are ported legacy wording, so it is a decision as much as a defect. |
| QA-149 | P2 | admin | /admin/reports/money | 375 + 1440 | open | The only admin page that still has a "Filter" button (Company, Candidate, Status), against "filters apply on change". |
| QA-150 | P2 | everyone | /drive/<unknown token> | any | fixed (awaiting retest) | An unknown or malformed drive token answers HTTP 200 with the "not found" page instead of 404 (a soft 404: crawlers and monitors see a healthy page). Left over from QA-006. |

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
- Retest (tester B, 28 Oct): **closed**. Production build of wp/qa-b on 22054b0, live-copy DB, candidate with Aadhaar and PAN
  (`docs/qa/b/repro/qa003-retest.mjs`, `qa003-leak.mjs`). (1) The page shows "Aadhaar number •••• 8183" and "PAN •••• 327F" with a
  Reveal button each. (2) The full numbers are in neither the HTML (128 KB) nor the RSC payload (45 KB) of `/admin/interns/[id]`;
  8 admin pages x HTML and RSC (candidates list, users, payouts, transactions, tracker, companies, reports) are clean too (16/16).
  (3) Reveal as Super Admin shows the full value; one `identity.reveal` row per click ({"field": "aadhaar"} or "pan", with the admin id,
  target intern); two clicks, two rows. (4) Roles: Executive - Sales and Executive - Accounts (no `interns:write`): no Reveal button on
  the page, and the API answers 403 "Your role doesn't allow this" with 0 audit rows; Executive - Operations and the default **Admin**
  role both have `interns:write` (the ADP-17 grant in `roles-grants.ts`) and can reveal, 1 audit row each. So the brief's "default admin
  has no `interns:write`" is not so: the default Admin keeps it by design. (5) The route also needs the CSRF token (a bare POST gets 403).
  Not covered: CSV exports. Evidence: `docs/qa/b/screens/qa003r-admin-masked.png`, `qa003r-admin-revealed.png`.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master a49952d): **re-verified, stays closed**: the full numbers are absent from the HTML (125 KB) and the RSC payload (44 KB) of `/admin/interns/[id]` and 7 other admin pages (16 of 16 checks); two reveals, two `identity.reveal` rows; Executive - Sales and Executive - Accounts get 403 "Your role doesn't allow this" and no Reveal button; Executive - Operations and the plain **Admin** role can reveal, one audit row each, because both hold `interns:write` (ADP-17 grant in `roles-grants.ts`). A "plain admin refused" case therefore cannot be shown: only roles without `interns:write` are refused.

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
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus, fix(QA-004)). Record's "Findtern Score published" came from each proposal's frozen ai_ratings snapshot (one card per proposal, 8.2); it is now one card from the current score in intern_onboarding.extra_data (findternScore + ratings), dated by approvedAt, as Home, Profile and Interviews read it; recordAsText follows. Snapshots stay on the offers that froze them. Seed: Record and Home both 8.8. Unit test in journey.test.ts.

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
- Status (builder, 28 Oct): fixed, awaiting retest (master, fix(QA-005)). `PATCH /api/timesheets/[id]/decision` now refuses `approved` with 409 and the count (plus `missingDates`) while any day of the period has no status, using the same `unfilledDays` rule as the intern's submit; sending back is unchanged. On the review page the Approve button is disabled with the reason ("N days have no status. Set each day in the grid, or send the sheet back…") until the days are filled.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master dc941df): **closed**. Fresh seed (3 employers' submitted sheets with 30 blank days) and the live copy (a submitted sheet with 22 blank days), Chromium at 375 and 1440, WebKit at 1440 and 375 (`qa005-retest.mjs`, `qa005-ui-fill.mjs`). (1) The review page shows "30 days have no status. Set each day in the grid, or send the sheet back for the intern to fill in." and "Approve timesheet" is disabled; "Send back" still works (a seed sheet went to `rejected`). (2) `PATCH /api/timesheets/<id>/decision {decision: "approved"}` answers 409 "30 days have no status yet. Set each day, or send the sheet back for the intern to fill in, before approving." with 30 `missingDates` (first 2026-08-31); the sheet stays `submitted`. (3) Filling the days works both ways: by SQL, and through the real grid (Adjust days; each day is a status select, "Save 30 changes"): afterwards the button is enabled, the in-place confirm "Yes, approve and lock" appears and the sheet becomes `approved`. The browser console shows the expected 409 when the API is called directly. Evidence: `docs/qa/b/screens/qa005r-chromium-375-3503-blocked.png`, `qa005r-adjust-days-editor.png`, `qa005r-ui-filled.png`.

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
- Status (builder, 28 Oct): fixed, awaiting retest (master, fix(QA-006)). The drive page's "Create an employer account" now carries `?next=/drive/<token>`; the employer signup page passes `next` to the form, which goes there after the account is created (else onboarding, as before), the same as the intern signup. Google path unchanged. The soft 404 and the doubled title are not in this fix.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master dc941df): **closed**, Chromium at 375 (full path) and WebKit at 375 (link only: the full WebKit signup over http still fails, QA-110). Signed out, `/drive/<token>` offers "Create an employer account" with `href="/employer/signup?next=%2Fdrive%2F<token>"`; the click opens that signup page; a new account (OTP from the mail log) lands on `/drive/<token>` with a session cookie (`ft_sid`), no sign-in or create-account links, and an "Enter drive" control; `/employer/dashboard` redirects to onboarding, i.e. the account is signed in. Not tried: pressing "Enter drive" before onboarding is finished. Still there, as the builder said: an unknown token answers HTTP 200 with the "not found" page (QA-150). The doubled title is gone ("Campus drive | Findtern"). Evidence: `qa006r-chromium-drive-signedout.png`, `qa006r-chromium-landed.png`.

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
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus: 5af9f5a companies q(); ddac6ea seed writes paid/hired + one isPaidRow; 8cbad37 Orders lede names accepted offers). Fresh seed: companies, transactions, reports and Orders agree (9 hires, ₹10,20,000 received).
- Retest (tester B, 28 Oct): **closed**, all three causes, production build on 22054b0.
  Part 1 (live copy): `/admin/companies` shows Heavy Data Co with 55 projects, 55 proposals, 15 hires (was 0/0/0) and its money
  (`docs/qa/b/repro/qa007-retest.mjs`, screenshot `qa007r-companies-3502.png`). Part 2 (fresh seed rebuilt from `scripts/seed.ts`): the
  seed now writes `hired` (9) beside `accepted` (4); admin Hired 9 on dashboard and tracker, Transactions "Received ₹10,20,000 · 9 paid receipts" =
  Reports "Revenue collected ₹10,20,000"; Northwind's company row ₹2,70,000 = its Orders page "3 hires · ₹2,70,000 paid". Part 3: an
  employer with two accepted-unpaid offers (Swiggy Instamart Labs, seed) reads "2 accepted offers to pay for · 2 payments due" on Orders,
  "2 payments due / 2 accepted, to pay" on the dashboard, "Payment due 2" on Proposals and "2 ready to pay" on Checkout: all agree
  (`qa007-accepted.mjs`). Left over, not QA-007: the live copy shows dashboard funnel "Hired 5" beside tracker "Hired 18" because the funnel counts
  distinct candidates (18 hired proposals, 5 candidates; checked in SQL), and Transactions says ₹7,624 where Reports says ₹7,623 (₹7,623.95 rounded
  two ways). The employer-side residue is QA-123.

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
- Retest (tester B, 28 Oct): **closed**. "Avg hiring speed" reads 1.9 days (live copy) and 4.8 days (fresh seed), labelled "Offer sent to accepted";
  no negative figure on either (`qa009-016-retest.mjs`). The raw data still has `hired_at` before `created_at` (average -3.3 days live, -15.3 days seed),
  which the fix now filters out; see QA-134 for the missing n.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master a49952d): **re-verified, stays closed**: "Avg hiring speed" 1.9 days (live copy) and 4.8 days (fresh seed), no negative figure, with the n shown (QA-134).

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
- Retest (tester B, 28 Oct): **reopened**. The page's hint is now the single shared one ("At least 8 characters, with a lowercase letter, an
  uppercase letter, a number and a special character."), but a rejected change prints a different rule: `src/app/api/admin/account/password/route.ts:18`
  returns "Use 8+ characters with upper and lower case letters and a number." (no special character). Steps: as an admin on `/admin/account`,
  enter the right current password and "Abcdefg1" twice, press Change password. Actual: the server rejects it (the stored hash does not change)
  and shows the second sentence, which "Abcdefg1" already satisfies. All six weak variants (lowercase only, 7 characters, no special, no upper, no lower,
  no number) are rejected, so the rule is enforced; only the message is wrong. Fix: use `PASSWORD_HINT` in the route. Evidence:
  `docs/qa/b/screens/qa016r-weak-password-error.png`, `docs/qa/b/repro/qa016-error-text.mjs`, `qa016-enforce.mjs`.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**. On `/admin/account` the hint reads "…a special character (like ! or @)." and the rejection reads "Use at least 8 characters, with a lowercase letter, an uppercase letter, a number and a special character (like !…" for "Abcdefg1" and for all five other weak passwords; none changed the stored hash (`qa016-message.mjs`, `qa016-enforce.mjs`). Evidence `docs/qa/b/screens/qa016r2-weak-password-error.png`.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master a49952d): **re-verified, stays closed**: "Abcdefg1" and five other weak passwords get the same sentence as the hint ("Use at least 8 characters, with a lowercase letter, an uppercase letter, a number and a special character (like ! or @)."), and none changes the stored hash.

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
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus 9b81744). Cause was not the logo: GetStartedMenu concatenated its className, so `hidden` lost to `inline-flex` and the button showed below sm. 375/375 on /, /faq, /pricing.
- Retest (tester B, 28 Oct): **closed**. Production build on 22054b0, 375 px: `/`, `/faq`, `/pricing`, `/about` in Chromium and `/faq`, `/pricing`, `/about` in
  WebKit all report `scrollWidth` 375 and the menu button's right edge at 355 (`docs/qa/b/repro/qa100-102-retest.mjs`). WebKit `/` still crashes (QA-111).

### QA-101
- Steps: 375 px, signed out, open `/employer/signup` (`node docs/qa/b/repro/inspect.mjs anon /employer/signup 375`).
- Actual: country-code select 269 x 44, phone input 50 x 44 (placeholder cut to "98'"). Same row on `/signup` is 144 + 175.
- Evidence: `docs/qa/b/screens/inspect-anon--employer-signup-375.png`. Severity **P1** (a required field is unreadable while typing).
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus 4dd433e). Select 112 px, number 207 px at 375.
- Retest (tester B, 28 Oct): **closed**. `/employer/signup` at 375: country-code select 112 px, phone input 207 px, `inputmode=numeric`,
  `autocomplete=tel-national`, in Chromium and WebKit. Screenshot `docs/qa/b/screens/qa101r-employer-signup-375-chromium.png`.

### QA-102
- Steps: 375 px; wait 3 s for the bubble; scroll to the bottom of `/signup`, `/employer/signup`, `/faq`, `/about`.
- Actual: the launcher (141 x 64, fixed) sits over the right end of the Password field (employer signup), over the
  "Employer sign in" link (intern signup footer) and over the footer's last line and copy-email icon; the bubble
  ("Questions about Findtern? Ask me") stays up until dismissed.
- Expected: bottom padding equal to the launcher height, or the launcher hides on forms.
- Evidence: `docs/qa/b/screens/inspect-anon--employer-signup-375.png`, `flow-intern-signup-filled-375-chromium.png`;
  marketing sub-run X2 in `docs/qa/b/bs7-marketing-results.md`. Severity **P1** (covers an input and a link).
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus e9b743f). Launcher hidden below lg on auth/onboarding, no bubble on forms, bubble auto-dismisses after 12 s, footer bottom padding clears the launcher.
- Retest (tester B, 28 Oct): **closed for the cases logged**. At 375 in Chromium and WebKit, scrolling `/signup`, `/employer/signup` and `/login` in 250 px steps:
  the launcher never overlaps an input, link or button, and at the very bottom of `/signup`, `/employer/signup`, `/faq`, `/about` and `/login` nothing is under it.
  The "Agree and send" dialog button is tappable (the launcher is hidden under the modal; the proposal went through in both engines). On `/faq` and `/about` it
  passes over accordion rows and footer links while the page scrolls, which is what a floating button does; not counted. The same button still covers the right half of a search box
  inside the app at scroll 0 (QA-136). Evidence: `qa102r-employer-signup-bottom-375-*.png`.

### QA-103
- Steps: admin, 375 px, `/admin/payouts?status=pending`, tap "Mark paid or failed" on a row (`node docs/qa/b/repro/admin-payout.mjs`).
- Actual: the editor is inside the table's scroll container ("Scroll sideways to see every column"): "Fail..." is cut
  at the right edge, "Bank reference (required wh..." and "Cancel" are partly out of view. Pressing "Done" with no
  reference shows the right message but only after a 400 from the API. With a reference the payout is marked paid (14 pending to 13).
- Evidence: `docs/qa/b/screens/admin-payout-dialog-375.png`; trace `admin-payout-trace.zip`. Severity **P2** (works after scrolling).
- Retest (tester B, 28 Oct, master 6c4b000): **closed**. At 375 the payout rows stack and "Edit payout status" opens an inline card inside the row (Paid / Failed, bank reference, note, Done / Cancel, all 44 px); "Done" without a reference says "Add the bank reference to mark it paid."; with one, pending 13 becomes 12 (`adm-payout.mjs`, `docs/qa/b/screens/adm-payout-dialog-375.png`).

### QA-104
- Steps: admin, 375 px, `/admin/interns/[id]` (`node docs/qa/b/repro/admin-controls.mjs /admin/interns/<id> 375`).
- Actual (px): "Remove React" 12 x 12, "Level for React" select 25 high, "Add" 60 x 36, "Save" 63 x 36,
  "Save ratings and links" 36 high, "Edit contact" 36 high. Payouts: "Apply" 36 high.
- Evidence: `docs/qa/b/screens/admin-controls--admin-interns-*-375.png`. Severity **P2**.
- Retest (tester B, 28 Oct): **still open**, narrowed. The payout editor and filters are 44 px now, but list links, row checkboxes and promo toggles are still small; see QA-146.

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
- Retest (tester B, 28 Oct, production build of wp/qa-b on master a49952d): **QA-112 closed** (a fresh seed, both engines): with consistent offers Checkout's numbers add up. An accepted offer of ₹40,000 a month for 3 months shows "First month ₹45,000" (₹40,000 + ₹5,000 hiring fee), "Whole engagement, paid once, now ₹1,25,000" (3 x ₹40,000 + ₹5,000) and "Hiring fee (one-time)". The original ₹24,000 + ₹5,000 came from a seed row whose `totalPrice` (24,000) disagrees with its `monthlyAmount` (26,400 x 2); offers sent through the form compute the total from the months. S1 r121 is PASS.

### Tester B, 28 Oct (second pass): the redesigned employer screens, QA-118 to QA-136
- Build: production build of wp/qa-b on 22054b0 (the builder's employer redesign plus the QA-007/100/101/102/003/009/016 fixes), live-copy DB, employer
  `neha@acmerobotics-launchtest.in`; Chromium and WebKit at 375, Chromium at 1440. Judged against DESIGN.md §0 (the "No AI slop" list and the type floor), by
  doing the job: candidates, shortlist, send proposal, book a meeting, review a timesheet, orders. Scripts in `docs/qa/b/repro/emp2-*.mjs`; screenshots
  `docs/qa/b/screens/emp2-*.png`; traces in `e2e/.artifacts/qa-b/` (git-ignored).
- **What worked** (not logged): the whole path runs in both engines at 375: shortlist, Review and send, the policy dialog (tick, wait ten seconds, "Agree and send"),
  the proposal lands in the list as "Waiting on candidate", a meeting request goes out, a submitted timesheet is approved or sent back with a note, Orders and
  Checkout read correctly for an accepted-unpaid employer. Every "⋯" menu opens with Enter, moves with the arrow keys, closes on Esc and returns focus to its button
  (8 rows, Chromium 1440 and WebKit 375); menu items are 44 px; outside click closes. Filters on Proposals apply on change (select, search, tabs); Schedule's timezone
  select applies on change; Candidates' project select applies on change. No overflow, no 4xx/5xx, no console errors apart from the known avatar 404. The builder's
  candidate-row rework removed the truncated locations and the rate/button collision I saw on the first build.
- **Why my first automatic check missed QA-118/119**: the shell clips with `overflow: clip`, so `documentElement.scrollWidth` stays 375 even when `main` is 668 wide.
  Compare `main.scrollWidth` with `main.clientWidth` instead (`emp2-clip.mjs` does; it finds exactly these two pages and nothing else at 375 in either engine).

### QA-118
- Steps: employer, 375 px (Chromium or WebKit), open `/employer/drives`.
- Expected: the drive's name, college and closing date all readable, wrapping inside the card.
- Actual: `main` scrollWidth 668 (WebKit 645) against 375; the card text ends at x=615; "JK Lakshmipat University, Jaipur · closes Wed, 4 N" is cut at the screen edge and the
  card's right border is off-screen. Nothing scrolls.
- Evidence: `docs/qa/b/screens/emp2-chromium-375-drives.png`; `node docs/qa/b/repro/emp2-clip.mjs chromium 375`.
- Severity **P1**: the closing date is the one fact the employer needs from the row, and it is the only content on the page.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** at 375 in Chromium and WebKit: `main.scrollWidth` equals `clientWidth` (375) on every employer route including `/employer/drives` (was 668 / 645) (`emp2-clip.mjs`); screenshot `emp3-chromium-375-drives.png`, `emp3-webkit-375-drives.png`.

### QA-119
- Steps: employer, 375 px, open any candidate from `/employer/candidates` (`/employer/intern/[id]`).
- Actual: under "Price ₹200/hr" the line "+ ₹5,000 per hire · set by the score band" spans x=178 to 460 (WebKit 174 to 454); the screen is 375, so "set by the score band" is cut off.
- Expected: the line wraps inside the card. Evidence: `docs/qa/b/screens/emp2-chromium-375-detail-intern.png`. Severity **P2** (the fee is also shown on the form and in the cart; the cut line is the
  decision screen's only disclosure of it).
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** at 375 in both engines: `emp2-clip.mjs` finds nothing wider than the shell on `/employer/intern/[id]` (was 460 / 454); `emp3-chromium-375-detail-intern.png`.

### QA-120
- Steps: employer, `/employer/proposals` at 375 and at 1440; open each row's "⋯" with the keyboard.
- Actual: no row has a visible action. "Waiting on candidate" rows: menu "Open offer / Edit offer / Withdraw offer". "Hired" and "Withdrawn" rows: a menu with the single item
  "Open offer". Five rows are named "More actions for Product Intern" (the role, not the candidate), so a screen-reader user cannot tell them apart.
- Expected (DESIGN §0): one visible action chosen by the row's state, the rest in the menu; a one-item menu is a visible link.
- Evidence: `docs/qa/b/screens/emp2-chromium-1440-proposals.png`, `emp2-chromium-375-proposals.png`; `emp2-interact.mjs`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**. 1440 and 375: "Waiting on candidate" rows show "Edit offer" plus "⋯", "Hired" rows show "Timesheets" with no menu, "Withdrawn" rows nothing. Menu names now carry the candidate ("More actions for Data Analyst Intern, UP"); two rows still share one name only because they are two offers to the same candidate on the same project. Keyboard, Esc and focus return unchanged. The tab "Payment due" is now "Accepted, to pay". At 1440 the fifth tab ("Closed") wraps to a second line beside the search box: cosmetic. `emp3-chromium-1440-proposals.png`.

### QA-121
- Steps: employer, `/employer/schedule` at 1440 and 375.
- Actual: Booked: Join meeting + Send reminder + Reschedule + Profile; Waiting: Send reminder + Offer new times + Profile; Expired: Offer new times + Profile; Completed:
  Leave feedback + Profile. They are separate cards, not an aligned list, with no "⋯". At 375 each card is about 400 px tall.
- Expected: the Proposals pattern (rows, one action, a menu). Evidence: `emp2-chromium-1440-schedule.png`, `emp2-chromium-375-schedule.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** at 1440 and 375: every interview card has one visible action (Booked: Join meeting; Waiting: Send reminder; Expired: Offer new times; Completed: Leave feedback) and a "⋯" ("More actions for this interview"). `emp3-chromium-1440-schedule.png`.

### QA-122
- Steps: employer with a hire that has no payment yet (live copy: Ritika Verma, "Not paid"), `/employer/orders`.
- Actual: that row offers Timesheets, Contract and Full-time offer, exactly like the paid row; there is no Pay. The only way to pay is the amber "1 payment due" at the top, which opens Checkout
  (and Checkout lists a different hire; see QA-123). "2 months · 1 paid" wraps to "1 / paid" at 1440.
- Evidence: `emp2-chromium-1440-orders.png`, `emp2-chromium-375-orders.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** for what it logged: the unpaid hire's row now has an amber "Pay ₹29,000" (`emp3-chromium-1440-orders.png`). Its target is wrong, see QA-139.

### QA-123
- Steps: employer (live copy), read the lede on `/employer/orders`, then `/employer/checkout`, then the tabs on `/employer/proposals`.
- Actual: Orders "₹29,000 still to pay on hires, next instalment 17 Sept 2026"; today is 28 Oct. Checkout "Ready to pay: Qab Tester, Month 2 of 2, Due 6 Dec 2026". Proposals "Payment due 0",
  Dashboard hero "1 payment due" beside "0 accepted, to pay". The hero's copy explains that accepted offers and running placements both count, but the Proposals tab counts only the first.
- Likely cause: the QA seed's second hire (Ritika, 17 Sept start, three months, nothing paid), so confirm with a fresh offer. Whatever the data, a past date should read "overdue since 17 Sept".
- Evidence: `qa007r-orders-3502.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** for what it logged: the lede now reads "overdue since 17 Sept 2026", and the Proposals tab is "Accepted, to pay 0", so the three "payment due" meanings no longer collide. The remaining disagreement (Pay opens another hire at another amount) is QA-139.

### QA-124
- Steps: employer, shortlist one more candidate from `/employer/candidates`, then open `/employer/cart` at 375.
- Actual (first run): header badge 4, tab "Shortlist 2 | Proposed 3 | Accepted 1 | Hired 2", heading "4 shortlisted", and 4 cards of which 2 say "Proposal sent"; shortlisting one more made the badge 5 while the tab read 3. Each card repeats "₹5,000 per hire" and
  has Send proposal, Book meeting, Profile and Remove (four controls, about 360 px per card). "Accepted 1 > Hired 2" wraps with a chevron at the start of line two (also on Checkout).
- Expected: one count and one meaning; a row pattern like Proposals. Evidence: `emp2-chromium-375-cart.png`, `emp2f1-chromium-375-after-shortlist.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed** at 375: header badge 2, tab "Shortlist 2" and heading "2 shortlisted" agree; the two candidates who already have a proposal moved under "Already proposed 4"; each shortlist card has "Send proposal" plus "⋯" (Book a meeting, Open profile, Remove from shortlist). The tab "Proposed 5" counts proposals across the account, the list "Already proposed 4" only shortlisted people: explainable, not a defect. `emp3-chromium-375-cart.png`.

### QA-125
- Steps: employer, `/employer/candidates` at 375 and 1440.
- Actual: "Search & add skills…" (inside Required skills) and "Skill, city or keyword" (above the list) are two search boxes with different meanings and no label; at 375 the skills box,
  the explanatory strip and the toolbar fill about 870 px, so the first candidate is below the first screen; the filter panel keeps "Apply" and "Reset" (sliders and text need them).
- Expected (DESIGN §0): filters apply on change; the people list starts above the fold. Evidence: `emp2v-candidates-375-top.png`, `emp2-chromium-1440-candidates.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: one search box ("Keyword search"), required skills folded into a one-line summary with "Edit", the first candidate starts at about 690 px of an 812 px screen at 375; at 1440 "Apply" is gone and only "Reset filters" remains. `emp3v-chromium-candidates-top.png`.

### QA-126
- Steps: employer, `/employer/send-proposal?intern=…` at 375, and the booking dialog from the shortlist.
- Actual: "Start date" and "Slot 1/2/3 date" are `<input type="date">` (mm/dd/yyyy in the test browser; the control follows the browser's language, so en-IN would differ and I could not
  check a real phone); Schedule's date filter is a DD/MM/YYYY text field. "Hours per month" (value "160 h") and "Monthly amount" ("₹32,000") are `type=text` with no `inputmode`.
- Expected: one date control, DD/MM/YYYY (bug sheet 7, DESIGN §0); numeric keyboard for numbers. Evidence: `emp2f1-chromium-375-proposal-form.png`, `emp2f3-chromium-375-book.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **partly fixed, still open**: Start date and the three meeting-slot dates are now DD/MM/YYYY text fields (`inputmode=numeric`), same as Schedule's filter. "Hours per month" and "Monthly amount" are still `type=text` without `inputmode`, so a phone opens the letters keyboard (Chromium and WebKit).

### QA-127
- Steps: `/employer/schedule`, type each value in the DD/MM/YYYY field and tab out (`emp2-interact.mjs`).
- Actual: "31/10/2026" filters. "2026-10-31", "1/1/26" and "31/10" do nothing and say nothing. "99/99/2026" passes the pattern and answers "No interviews match these filters" / "Showing 0 of 6".
- Expected: a short "Use DD/MM/YYYY" message for text that is not a date. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed with a caveat**: "31/10/2026" filters; "2026-10-31", "1/1/26", "31/10" and "99/99/2026" are no longer applied (no false "0 interviews"), and the field carries the message "Use DD/MM/YYYY, for example 31/10/2026." as its validation text (shown when the user presses Enter), but nothing appears on blur (`emp3-verify2.mjs`).

### QA-128
- Steps: shortlist, "Book meeting", keep the three suggested times, "Send meeting request" (375, both engines).
- Actual: the confirmation says "…It shows on your Schedule once they do."; `/employer/schedule` already lists it as "Waiting on candidate" (waiting count 1 to 2, all 4 to 5). A second toast,
  "Stuck somewhere? Ask me", is on screen with it.
- Severity **P2** (copy that is wrong, and a help nudge over a confirmation). Evidence: `emp2f3-chromium-375-booked.png`.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: the confirmation reads "It is on your Schedule as "Waiting on candidate" until they pick one of your times." and no "Stuck somewhere?" toast appears. `emp3v2-chromium-booked.png`.

### QA-129
- Steps: `/employer/checkout`, and `/employer/send-proposal` with no candidate chosen, at 375.
- Actual: "Amounts are the terms each candidate accepted… Names unlock once the hire is paid." ("Unlock" is on the §0 copy-tell list). The empty state reads "Pick a candidate first." (subtitle),
  "No candidate selected" (title) and "You: pick a candidate first" (hint).
- Evidence: `emp2-chromium-375-checkout.png`, `emp2-chromium-375-send-proposal.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: "unlock" is gone from Checkout; the empty Send-a-proposal screen says it twice, not three times ("Choose a candidate… Open a candidate from the browser…"). One leftover: a "You:" prefix before "from their profile or your shortlist".

### QA-130
- Steps: 375 px: `/employer/timesheets`, `/employer/projects`, `/employer/proposals`, `/employer/orders`.
- Actual (ellipsis found by script): "18 Oct – 16 Nov 2026 · Robotics Software Intern" and "17 Sept – 16 Oct 2026 · …" cut to "17 Sept – 16 Oct 20…"; "On-site · Bengaluru, Karnataka · Up to 90 days";
  "Remote · Up to 60 days · Full-time path"; "Ritika Verma · Data Analyst Intern"; "Product Intern · Robotics Software Intern". There is room to wrap on every one.
- Evidence: `emp2v-timesheets-375.png`, `emp2-chromium-375-projects.png`; `emp2-verify.mjs`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: no ellipsised text on the timesheets, projects, proposals, orders or candidates pages at 375 (Chromium, WebKit).

### QA-131
- Actual (375): the Proposals and Schedule status tabs scroll sideways with the last label cut mid-word ("Paymer") and no fade; every dialog's "×" (policy, booking) is 16 x 16 px; the Approve / Send back
  switch on a timesheet is 40 px high; list/card toggles and "12 / 24 / 48" are 36 px. Cut-down QA-116 list otherwise unchanged (the 36 px buttons now grow to 44 on touch).
- Evidence: `emp2-chromium-375-proposals.png`, `emp2f2-chromium-375-policy-dialog.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: the Proposals and Schedule tab strips wrap (no sideways scroll, no cut label); the booking dialog's close button is 44 x 44; the Approve / Send back switch and the confirm button are 44 px (both engines).

### QA-132
- Steps: a submitted sheet (`/employer/timesheets/[id]`), 375: "Approve timesheet" is the pre-selected, full-width button; one tap approves (Chromium); "Send back" with a note works (WebKit; I did not check the empty-note case).
- Actual: no confirmation before an action the page calls "can't be undone". Evidence: `emp2f4-chromium-375-decision.png`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: "Approve timesheet" now opens an in-place confirm, "Yes, approve and lock" / "Cancel", with the line "It can't be undone."; I did not confirm it. `emp3v2-chromium-approve.png`.

### QA-133 (harness)
- Steps: `e2e/seed-situations.mjs:244` writes `status: "present"` / `"off"`. Open the employer's seeded submitted sheet: tiles read Present 0, Hours 0, Absent 0, Off 0; weeks read "Not filled 7";
  the grid says "P present" and "30 days, every one filled". The list says "0 / 30 days present · 0 h" for an Approved sheet.
- Proof that the app is fine: after `UPDATE timesheets SET entries = …` with Present / Fixed off, the same sheet reads Present 21, Hours 168, Off 9 and the list "21 / 30 days present · 168 h" (the intern UI, `submit/route.ts`, uses those words).
- Fix in the harness (normalise to the app's words). Not a product bug, but until fixed the review screen shows nonsense on every persona, which would also hide a QA-005 regression. Tell Tester A.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **still open**: `e2e/seed-situations.mjs:244` still writes "present" / "off".
- Status (builder, 28 Oct): fixed, awaiting retest (master, with fix(QA-005)). `e2e/seed-situations.mjs` writes `Present` / `Fixed off` with hours 8 / 0 and a note, the shape a real submission has.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master dc941df): **closed**. After `npm run qa:seed` on the live copy, the seeded approved sheet reads Present 21, Hours 168, Absent 0, Off / holiday 9, "30 days, every one filled", and the list "21 / 30 days present · 168 h" (Chromium 1440, WebKit 375; `qa133-retest.mjs`, `qa133r-*-detail.png`). `e2e/seed-situations.mjs` writes "Present" / "Fixed off" with hours 8 / 0 now. The seed no longer creates a submitted sheet for the employer persona (approved and draft only), so a review test needs one made by hand.

### QA-134
- Steps: `/admin/dashboard` on a fresh seed: "Avg hiring speed 4.8 days"; in SQL 7 of 9 hired rows have `hired_at < created_at`, so the tile averages 2. Live copy: 13 of 18 used, 1.9 days.
- Expected: the tile (or its tooltip) says "from n hires"; `scripts/seed.ts` writes `hired_at` after `created_at`. Severity **P2**.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: the tile now reads "Offer sent to hire, over 13 of 18 hires (the rest have a hire date before the offer)" on the live copy and "over 2 of 9 hires" on a fresh seed (`qa134-retest.mjs`). The seed still writes the reversed dates.

### QA-135
- Steps: `curl localhost:<port>/login | grep '<title>'`: "Sign in | Findtern | Findtern", and "Employer sign in | Findtern | Findtern". `/signup`, `/faq`, `/pricing`, `/about`, `/forgot-password` are single. Severity **P2** (tab titles, shares).
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed**: `/login` is "Sign in | Findtern", `/employer/login` "Employer sign in | Findtern".

### QA-136
- Steps: employer, `/employer/candidates` at 375 x 812, scroll 0.
- Actual: the "Ask me" button (141 x 56) sits over x=232 to 359 of the "Skill, city or keyword" box, which is its tap area; same on other console screens wherever content reaches the bottom-right corner.
  DESIGN §0 says phones keep the labelled button on purpose (bug sheet 7), so this is a placement issue, not a removal request: raise it above the tab/field row or let the page's last row clear it.
- Evidence: `emp2v-candidates-375-top.png`. Severity **P2** (QA-102's fix did not cover the console).
- Retest (tester B, 28 Oct, production build of wp/qa-b on master 6c4b000): **closed for the case logged**: at 375 the first input on `/employer/candidates` is no longer under the launcher (the search box now sits at y=549 to 593, the launcher at 736 to 792). The launcher still partly covers a candidate card's score at scroll 0, which a floating button always will. `emp3v-chromium-candidates-top.png`.

### QA-137
- Steps: a new intern (or the persona with no uploaded Aadhaar image), `/intern/onboarding` step 1 "About you": fill everything, add the PAN image, leave the Aadhaar image empty, Continue.
- Actual: "Upload a photo or scan of your Aadhaar card." blocks the step (`src/lib/onboarding.ts:1038`, `hasAadhaarImage`). `/intern/profile` shows the checklist item "Aadhaar and PAN, with card images", counted in "Profile completeness".
- Expected: Aadhaar number mandatory and PAN image mandatory (S1 r22), Aadhaar image not mandatory (S1 r45), the completeness list naming the PAN document (S1 r41). Legacy: `/home/wynautbhav/FindTern/client/src/pages/onboarding.tsx:797`
  validates only `panImage` ("Upload your PAN image"), the photo (`profileMedia`) and the two numbers; its completeness list does count both images, so r41 is the sheet's change.
- Also: reopening the wizard from "Edit profile" starts at step 1, so an intern with no Aadhaar image on file cannot reach a later step (S1 r60) until they upload one.
- Evidence: `docs/qa/b/screens/onb-step1-errors-375.png`, `docs/qa/b/screens/bs7-s1r60-wizard-location-step.png`; `bs7-unclear-peek.mjs`, `bs7-s1r60.mjs`. Severity **P1**: every new intern meets it, and it contradicts two rows of the owner's sheet.

### QA-138
- Steps (local server, one forwarded address): `node docs/qa/b/repro/nc35-shared-ip.mjs` asks for a sign-up code for seven different students from one address.
- Actual: students 1 to 5 get 200; students 6 and 7 get 429 "Too many requests". Limits in `src/lib/security/rate-limit.ts` (`otp` 5 per 15 min, `signup` 5 per hour, `login` 8 per 15 min), keyed by `bucketKey(ip)` in the intern and employer login, sign-up, `send-otp` and
  `verify-otp` routes; only the college login adds the email to the key. The counters are in memory, so on serverless each instance also counts on its own.
- Why it matters: the college-partner drive sends a whole class to sign up from one campus network; an office testing the staging site does the same (NC r35 and r36 in the owner's words: a new account that will not log in, several emails logging in at once).
  I could not reach staging, so the link to NC r35 / r36 is a hypothesis: ask what the screen said (429 "Too many requests" would confirm it).
- Fix options (builder's call): key sign-up codes by email plus address with a higher per-address ceiling; count only failed logins per address; a shared store. Severity **P1** for the drive launch.

### QA-139
- Steps: employer (live copy), `/employer/orders`, press "Pay ₹29,000" on the "Not paid" row (`/employer/checkout?proposal=7883…`).
- Actual: Checkout shows "Ready to pay: Qab Tester, Month 2 of 2, Due 6 Dec 2026, ₹26,400" and "Due now ₹26,400"; the hire the user clicked is not on the page. The proposal row: `status hired`, `monthlyAmount 26400`, `duration 3m`, `totalPrice 24000`, start 17 Sept 2026; Orders totals read "₹29,000 paid · ₹29,000 still to pay".
- Expected: the clicked hire, with an amount that adds up; or an honest "nothing to pay for this hire" and no Pay button. Likely a seed-row inconsistency like QA-112; retest with a freshly sent and accepted offer. Evidence: `docs/qa/b/screens/emp3v2-chromium-375-pay-target.png`, `emp3-chromium-1440-orders.png`. Severity **P2**.
- Status (builder, 28 Oct): fixed, awaiting retest (wp/opus, fix(QA-139)). Cause: Orders' "Pay" (QA-122) linked any hire with money due to checkout, but checkout bills only accepted offers and due months; a hire with nothing paid is neither, and checkout fell back to the first payable line. Now a named proposal shows only that line or "This placement can't be paid here" (selectCheckoutLines, unit-tested), and Orders shows Pay only for proposals checkout can bill; an unpaid hire it can't says "₹N unpaid · can't be paid online; write to communicate@findtern.in".
- Retest (tester B, 28 Oct, production build of wp/qa-b on master a49952d): **closed**, Chromium and WebKit at 375 (`qa139-retest.mjs`, `qa139-retest2.mjs`; screenshots `qa139r-*`, `qa139r2-*`). Live copy: the unpaid hire's Orders row now reads "₹29,000 unpaid · can't be paid online; write to communicate@findtern.in" with no Pay control; `/employer/checkout?proposal=<that hire>` shows "This placement can't be paid here" with "See what is due (1)"; the monthly placement (Qab Tester) opens exactly "Month 2 of 2, ₹26,400"; a made-up id gets the same "can't be paid here" page. Fresh seed (employer with two accepted offers): `?proposal=` of each accepted offer shows exactly that candidate (NP, then BB) with "See everything due (2)"; a hired-and-paid placement says "can't be paid here". Orders' header says "1 payment due" (live copy, the Qab month) and "2 payments due" (seed), and both match what Checkout lists. The lede still says "₹29,000 still to pay on hires, overdue since 17 Sept 2026" for the placement that cannot be paid online; that is the QA seed's row, not a new defect.

### Tester B, 28 Oct (third pass): the redesigned /admin screens, QA-140 to QA-149
- Build: production build of wp/qa-b on master 6c4b000, live-copy DB, Super Admin; Chromium and WebKit at 375, Chromium at 1440, all 27 admin pages plus a candidate and a company page (`docs/qa/b/repro/adm-*.mjs`; screenshots `docs/qa/b/screens/adm-*.png`). Judged the same way as the employer pass: against DESIGN.md §0, by doing the jobs: filter the candidate list, deactivate an account, mark a payout paid, change a password, open the roles list.
- **What worked:** nothing wider than the shell on any page at 375 or 1440, no console error beyond QA-147, no overlapping filter bars except those listed; rows stack below lg with a label in front of each figure; the DD/MM/YYYY fields are text fields on Orders, Proposal pipeline and Reports ("31/10/2026" applies, an ISO date is ignored); selects and search apply on change (candidates: "Pending" gives 300 of 524 at once; typing "Qab" applies without Enter); the dashboard is one focal point (99 items) over a list with one action each; the payout flow works end to end at 375 (reference enforced, 13 to 12 pending); QA-016's rule reads once on `/admin/account`.
- **Not judged:** the CSV and Excel exports, bulk actions, CMS editors (add / edit forms), notification sending (no mail goes out here).

### QA-140
- Steps: Super Admin, 1440 x 900, `/admin/orders` (also Projects, Notification history, Intern invoices); read `scrollWidth` against `clientWidth` of the card's scroller (`adm-sweep.mjs`).
- Actual: Orders 1473 > 1102: the "Paid at" header shows as "Pa", dates are cut ("28 Oct"), the columns after it need a sideways scroll. Projects 1185 > 1102, Notification history 1197 > 1102, Intern invoices 1110 > 1102. At 375: Analytics (three tables 480 to 552 > 341), Money (803, 768 > 341), Roles matrix (844), Notification history (565).
- Expected: "tables fit at 1440" (the builder's note); at 375 rows stack. Evidence: `adm-chromium-1440-orders.png`. Severity **P2**.

### QA-141
- Steps: `/admin/proposal-tracker` at 1440 and 375; `/admin/companies`, `/admin/projects`, `/admin/notification-history`, `/admin/payouts` at 375 (`adm-overlap.mjs chromium|webkit 375|1440`).
- Actual: Proposal pipeline: the "All companies" and "All candidates" selects end beyond the white card (clipped at its right edge), the search placeholder is cut ("Search candidate, company, projec"), at 375 "More filters" overlaps "Rows" by 33 x 18 px and the row-count control by 75 x 44. "Rows" overlaps the previous select by 10 to 26 px on Companies and Projects (both engines), 14 px on Notification history (WebKit). Payouts: "CSV" and "Rows" touch.
- Evidence: `adm-chromium-1440-proposal-tracker.png`, `adm-chromium-375-proposal-tracker.png`, `adm-chromium-375-projects.png`, `adm-chromium-375-payouts.png`. Severity **P2** (the busiest admin page; every control still works).

### QA-142
- Steps: `/admin/roles` at 375 (`adm-roles.mjs`): selected text of each staff select.
- Actual: Admin, Executive - Sales, Executive - Operations and Executive - Accounts are 62 px wide ("Adı", "Exe", "Exe", "Exe"); only the signed-in user's row is 301 px. At 1440 all are 192 px and read in full. Evidence: `adm-chromium-375-roles.png`. Severity **P2** (permissions screen; the wrong Executive role cannot be seen).

### QA-143
- Actual (375): `/admin/notification-history` rows show "Notification  A company invited you to an int" and "Your timesheet was rejected: Ple" running off the card, no wrap, no ellipsis; `/admin/settings` "Create plans from the built-in rate car…" ends 24 px past its button (`adm-overlap.mjs`). Evidence: `adm-chromium-375-notification-history.png`, `adm-chromium-375-settings.png`. Severity **P2**.

### QA-144
- Steps: 1440 wide at 900, 768 and 700 px high (`adm-nav.mjs`): count sidebar links inside the viewport.
- Actual: 20 links, 15 visible at 900, 13 at 768 (Reports and Website content hidden), 11 at 700; the nav is the scroller (`overflow-y: auto`, 1030 px of content); the only cue is a clipped item at the bottom. Evidence: `adm-nav-768.png`. Severity **P2**.

### QA-145
- Steps: `/admin/interns?q=Qab` at 1440, press "Deactivate" on a row (`adm-deactivate.mjs`).
- Actual: nothing visible happens in a browser driver, because the confirmation is `window.confirm` ("Deactivate this account? They will not be able to sign in until it is activated again."), auto-dismissed; accepting it sends `POST /api/users/<id>/deactivate` and the row flips to "Inactive / Activate" (I restored it). Each row shows "Live Hide" and "Active Deactivate" at once (four inline controls), no "⋯" menu anywhere in /admin.
- Expected: the in-page confirm used on the employer side ("Yes, approve and lock / Cancel"); destructive actions in a menu. Evidence: `admi-chromium-1440-deactivate.png`, `adm-chromium-1440-interns.png`. Severity **P2**.

### QA-146
- Actual (375, `adm-sweep.mjs`): `a` name links 20 to 24 px high on Candidates, Users, Projects, Proposal pipeline, Orders, Payouts, Notification history, Analytics; "Select row" 16 x 16 (Candidates); 24 x 24 checkboxes on Colleges, Messages, Notifications and 90 in the role matrix; promo-code toggles 37 x 21; "Excel template" and "CSV" 24 px. Severity **P2**.

### QA-147
- Steps: `/admin/interns/non-disclosure`: `404 /cdn/assets/sprites-core-jxe2m7va.svg` (Chromium and WebKit). Severity **P2**; check the intern-facing NDA page for the same blank icons.

### QA-148
- Steps: read the candidate's notification list in Admin > Notification history: "🚀 Spotlight's on you, Qab - 1 profile view and counting!". Sources above. Owner decision: keep legacy wording or write plain text. Evidence: `adm-chromium-1440-notifications.png`.

### QA-149
- Steps: `adm-applybtn.mjs` at 1440 over 17 admin lists and reports: only `/admin/reports/money` shows a "Filter" button next to Company, Candidate and Status. Severity **P2**.

### QA-150
- Steps: `curl -s -o /dev/null -w '%{http_code}' localhost:<port>/drive/nonexistenttoken1234567890abcdef` (also 30 x "x" and a 101-character token): 200, title "Campus drive | Findtern" (Chromium and curl).
- Expected: 404 (`notFound()`), with the same page. Severity **P2**. Note for the orchestrator: the intern pass IDs start at QA-151, not QA-150.
- Status (builder, 28 Oct): fixed, awaiting retest (master, fix(QA-150)). The drive lookup moved into a React-cached loader shared by `generateMetadata` and the page; an unknown, short or inactive token throws `notFound()` from the metadata, which resolves before the root `loading.tsx` streams the 200 shell, so the response is a real 404. One query per request as before.
- Retest (tester B, 28 Oct, production build of wp/qa-b on master fa3c613, built 10:47): **reopened**. `curl -si localhost:<port>/drive/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` still starts `HTTP/1.1 200 OK` (body: the "404 Page not found" page, `<meta name="robots" content="noindex">`, title "Findtern | Hire Pre-Screened Interns in India"). Same 200 for the made-up 36-character token, "abc", 101 x "a", ten "%00" and "..", in curl and in Chromium (`docs/qa/b/repro/qa150-retest.mjs`, `qa150r-chromium-unknown.png`). A live token still renders (200, "Enter drive", signup link with `next`). The same class is wider than drives: `/blog/no-such-post` and `/blog/zzzzzzzz` answer 200 with the not-found page, while `/nonexistent-page` and `/college-partners/zzzz` answer 404. Likely cause: the status line is committed when the root `loading.tsx` shell streams, so a `notFound()` thrown in `generateMetadata` (or in the page) arrives too late; the 404 routes that work are the ones where the lookup happens before the shell. Suggested fix: check the token and the blog slug in `middleware`/a route handler, or give these two segments their own `loading.tsx`-free layout so `notFound()` runs before streaming. Severity stays **P2** (noindex is present, so crawlers are told not to index, but monitors and link checkers see a healthy page).
- Status (builder, 28 Oct, second attempt): fixed, awaiting retest (master, fix(QA-150) #2). Cause confirmed as you read it, and the Next docs say the same: once `src/app/loading.tsx` streams the shell the status is 200 for good, and metadata streams too, so the first attempt could not work. Fix: the root `loading.tsx` is removed (the intern, employer and admin consoles keep their own; the college console gets one), so `notFound()` on the drive page, blog posts and opportunities runs before the first byte. Verified on a local production build: unknown drive tokens of 30, 36 and 101 chars and `abc`, `/blog/no-such-post`, `/opportunities/no-such-id` answer 404; `/`, `/login`, `/faq` answer 200. Side effect to check: marketing and auth pages no longer show a spinner during client navigation (the previous page stays until the next is ready).

