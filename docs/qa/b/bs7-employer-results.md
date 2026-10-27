# Bug sheet 7 - employer rows, tester B results

Run: 28 Oct 2026, production build on port 3502 (PAYMENTS_MODE=free, mail to log file). Desktop 1440x900 / 1280x900 and phone 375x812 (Chromium; critical path repeated in WebKit). Scripts: `docs/qa/b/repro/bs7-employer-*.mjs`. Screenshots: `docs/qa/b/screens/bs7-emp-*.png`.

Accounts used: the existing employer (India), three new India employers created at 375 px (company email on a test domain), one new UAE employer (+971, company country United Arab Emirates, so USD), and the synthetic intern. Data I changed on the existing employer: shortlisted 3 candidates, booked 1 meeting, sent 1 offer (edited it), withdrew 1 duplicate accepted-unpaid offer, created and deleted a throwaway project, and paid the intern's accepted offer in free mode (month 1 of 2). I toggled the synthetic intern's open-to-work off and back on (it is on again).

Not testable here: Google sign-in itself (OAuth is not configured on this server: the button goes to `/employer/login?oauthError=not_configured` and the page says "Google sign-in is not available right now. Use your email and password instead."). Legacy comparison was done by reading the legacy source filter list, not by pixel comparison.

## 1. Results

| sheet-row | result | finding | screenshot |
|---|---|---|---|
| S1 72 | PASS | "Sign up with Google" button (327x44 at 375 px) is on `/employer/signup`; click works but OAuth is unconfigured here (lands on login with a clear message). | docs/qa/b/screens/bs7-emp-google-click-375.png |
| S1 73 | PASS | Brand-new employer: `/employer/dashboard`, `/employer/candidates`, `/employer/cart`, `/employer/send-proposal` all redirect to `/employer/onboarding`, also after step 1 is saved but before a project exists. (`/employer/projects` and `/employer/orders` are not gated.) | docs/qa/b/screens/bs7-emp-gate-dashboard-after-1.png |
| S1 74 | PASS | "Compare" on a card adds it; 4th add shows "Compare full (4)"; `/employer/compare` shows 4 side by side with a leader marked. | docs/qa/b/screens/bs7-emp-compare-page-1440.png |
| S1 75 | PASS | After OTP verify the new account lands on `/employer/onboarding` ("Set up your hiring account", step 1 company, step 2 first project). | docs/qa/b/screens/bs7-emp-signup-after-chromium.png |
| S1 76 | PASS | Filter set matches legacy dashboard (skills, preferred city, include remote, laptop, hourly price, ratings: Findtern score / comm / coding / aptitude / AI interview, sort). Measured: r_coding=9 -> 27 results all coding>=9; r_communication=9 -> 12 all comm>=9; min score 9 -> 6; plan=standard -> 107, all "Free". | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 77 | PASS | Scanned every page of "Show everyone" (about 267 candidates): every card carries an AI interview score > 0 (no unscored candidate). | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 78 | PASS | Cards, cart, quick view show initials avatars ("PH", "QT"); no `<img>` in the list; `/api/intern/avatar` returned 403 for non-hired candidates, 200 only for the hired one. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 79 | PASS | Every card has "Profile" and "Quick view"; quick view has "Full profile"; cart has "Profile". | docs/qa/b/screens/bs7-emp-phone-quickview-chromium.png |
| S1 80 | PASS | Project skills input stops at 7: "7 added. Remove one to swap it out." (input disabled); label "At least 4, at most 7". Same on New project sheet. | docs/qa/b/screens/bs7-emp-proj-skills-375.png |
| S1 81 | PASS | Scope of work offers exactly "Up to 60 days / Up to 90 days / Up to 180 days" (onboarding and New project). | docs/qa/b/screens/bs7-emp-onb-step2-375.png |
| S1 82 | PASS | Switching project changes list and criteria: "Data Analyst Intern" -> 34 interns, skills React+SQL, city Bengaluru; "Robotics Software Intern" -> 49 interns, skills React. | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 83 | PASS | Cart has no hire/pay button; text says "Book a meeting ... then send a proposal; you pay only once a candidate accepts"; checkout only lists accepted offers. | docs/qa/b/screens/bs7-emp-cart-shortlisted-1440.png |
| S1 84 | PASS | Start date input `min` = tomorrow; forcing 2026-10-20 gives "Pick a date after today." | docs/qa/b/screens/bs7-emp-sendprop-pastdate-1440.png |
| S1 85 | PASS | India employer: "Billed in INR, set by your company's country", ₹ everywhere; UAE employer: "Billed in USD", "$2/hr", "$50 per hire", "$320 a month". No payment-type selector on the proposal. | docs/qa/b/screens/bs7-emp-wk-sendprop.png |
| S1 86 | UNCLEAR | "proposal need to be change" has no testable criterion. | - |
| S1 87 | PASS | At 01:50 IST the booking dialog suggested 2:00 am, 3:00 am, 4:00 am (next quarter hour, +1h, +2h); time pickers list only :00/:15/:30/:45 and are editable. | docs/qa/b/screens/bs7-emp-book-dialog-1440.png |
| S1 88 | PASS | Proposals list and proposal page have "Edit offer"/"Edit"; edit form opens with all fields (duration, schedule, hours, tz, text) and "Save changes" updated "Length 6 months" and the text. | docs/qa/b/screens/bs7-emp-proposal-edit-accepted-1440.png |
| S1 89 | PASS | "View" opens the full offer: hourly rate, monthly amount (includes GST), one-time hiring fee, schedule, leave, hours, timezone, mode, laptop, tasks, skills, meeting rules, assessment snapshot. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 91 | PASS | Company email is read-only ("Your sign-in email. It can't be changed here."); website `https://www.example.org` -> "The website must be on your company email's domain (acme-qa-test.in) ..."; subdomain/own domain accepted. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 92 | PASS | Empty escalation name/email/phone -> "An escalation contact name is required." / "...email is required." / "...phone is required."; form does not advance. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 93 | UNCLEAR | A question ("why up to 5 locations"). Observed: project locations now stop at "3 of 3 added" (matches the 3-location decision). | docs/qa/b/screens/bs7-emp-newproject-onsite-1440.png |
| S1 94 | PASS | Same filter set as row 76 (legacy list read from the old employer dashboard: skills, city, include remote, laptop, price, five min-ratings); each tested filter narrows correctly. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 95 | PASS | "Include remote candidates - Also show interns who only work remotely" checkbox in the Location filter (default on for remote projects). Caveat: no remote-only candidate in this data, so toggling gave 34 -> 34. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 96 | PASS | Compare page has no "zero placement surcharge" line (searched "surcharge"/"placement"); only "Per-hire charge ₹5,000". | docs/qa/b/screens/bs7-emp-compare-skills-1440.png |
| S1 97 | UNCLEAR | A question. Compare lists every skill the candidate has, no cap (a synthetic candidate with 68 skills shows all 68, matches first). | docs/qa/b/screens/bs7-emp-compare-skills-1440.png |
| S1 98 | PASS | No "+N more" anywhere in about 290 cards; cards show all skills (a 68-skill candidate shows all chips). | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 99 | PASS | Form, review and offer page show one "Monthly amount" ₹32,000 (does not change with 1/2/3/6 months); "Length 3 months" is separate. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 100 | UNCLEAR | No criterion beyond layout; intern's offer page renders sanely (stipend, joining date, schedule, company, responsibilities, instructions). | docs/qa/b/screens/bs7-intern-offer-1280.png |
| S1 101 | PASS | After sending, `/employer/proposals` lists the offer ("Waiting on candidate", ₹32,000 a month, 3 months, Starts 02/11/2026) with Edit/Withdraw/View. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 103 | PASS | Escalation email equal to sign-in email -> "Use a different email from your sign-in email."; also on `/employer/account`: "Use a different email from the company sign-in email." | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 104 | PASS | Primary and escalation phone fields each have a country-code select (170 codes, default +91). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| S1 105 | PASS | New UI offer: Mon-Fri, 2 leave days -> (22-2)x8 = 160 h, ₹200/hr x 160 = ₹32,000; Mon-Sat 2 leave -> 192 h ₹38,400; 0 leave -> 208 h ₹41,600; 3 leave -> 184 h ₹36,800; USD: $2 x 160 = $320. Hiring fee shown separately (₹5,000/$50). Note: no total (months x monthly + fee) is shown before sending. | docs/qa/b/screens/bs7-emp-sendprop-review-1440.png |
| S1 106 | PASS | After "Agree and send" the page goes to `/employer/proposals` (Chromium 375 and WebKit 375). | docs/qa/b/screens/bs7-emp-wk-after-send-alert.png |
| S1 107 | PASS | Checkout "How to pay": "Monthly - First month now, then 1 more monthly" (default) or "Whole engagement"; after paying month 1 the page shows "Month 2 of 2, ₹26,400 this month". (See defect D2 for the whole-engagement amount.) | docs/qa/b/screens/bs7-emp-checkout-1440.png |
| S1 108 | PASS | "Withdraw" on waiting offers: one click moved an accepted-unpaid offer to "Withdrawn" and counts updated (Closed 1). No confirmation step (D6). | docs/qa/b/screens/bs7-emp-proposal-accepted-1440.png |
| S1 110 | UNCLEAR | Functional filter set matches legacy (see 76); "same design" cannot be judged without a pixel reference. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 111 | UNCLEAR | "Quick view design needs to be changed" has no criterion; it renders cleanly at 1440 and 375 (score, price, ratings, skills, preferences, academics). | docs/qa/b/screens/bs7-emp-phone-quickview-chromium.png |
| S1 112 | PASS | Profile shows initials plus "AI INTERVIEW RESULTS: Findtern Score 7.5, Comms 7.5, Coding 7.5, Aptitude 7.5, AI Interview 7.5"; hired candidate shows real name. | docs/qa/b/screens/bs7-emp-profile-1440.png |
| S1 113 | PASS | Standard band shows "Free" (filter option "Free · Standard"; cards "STANDARD 5.9/10 Free"); no "₹0"/"$0" in the list. | docs/qa/b/screens/bs7-emp-cand-1440.png |
| S1 114 | PASS | Work-mode buttons follow the candidate: "This candidate is open to remote or hybrid work" -> Remote, Hybrid only; an open-to-all candidate shows Remote, Hybrid, On-site. | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 115 | PASS | Working hours: From/To time inputs plus presets (9am-6pm, 9am-1pm, 5pm-9pm) and a "Flexible hours" checkbox, all editable. | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 116 | PASS | Proposal timezone defaults to the company zone (Asia/Kolkata for India, Asia/Dubai for UAE) and is changeable (set to America/New_York). | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 117 | PASS | Accepted-unpaid offer shows "Edit offer" and "Withdraw offer" ("you can still edit the offer (the candidate accepts it again) or withdraw it"); edit form opens fully enabled; withdraw executed. | docs/qa/b/screens/bs7-emp-proposal-edit-accepted-1440.png |
| S1 118 | PASS | Checkout shows "Hiring fee (one-time) ₹5,000" with the first month (Due now ₹31,400 = ₹26,400 + ₹5,000); the month-2 summary has no fee ("Due now ₹26,400"). USD employer sees $50. | docs/qa/b/screens/bs7-emp-checkout-1440.png |
| S1 119 | PASS | Button "Complete for free (test mode)" with "Test mode: no payment is taken"; clicking completed the hire (intern then sees "The company completed the payment. Log your hours"). | docs/qa/b/screens/bs7-emp-wk-after-pay.png |
| S1 121 | FAIL | "Whole engagement" is far below the monthly sum: 2 months at ₹26,400 shows "Engagement ₹24,000 + fee ₹5,000 = ₹29,000", less than the month-1 option (₹31,400), i.e. an effective upfront discount (see D2). | docs/qa/b/screens/bs7-emp-checkout-whole-1440.png |
| S1 122 | PASS | Schedule: "Leave feedback" appears only on the Completed card; Booked and Waiting cards show Join/Reminder/Reschedule/Offer new times only. | docs/qa/b/screens/bs7-emp-schedule-1440.png |
| S1 123 | PASS | With React+SQL selected every listed card contains React or SQL (0 exceptions of 24); copy says "Candidates with any of them are shown; more matches rank higher". | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 124 | PASS | Changing project replaces the skills (Figma added manually, then switching to Robotics gave "React" only). | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 125 | PASS | Cart: newly shortlisted candidates (no proposal yet) are listed above the older "Proposal sent" candidate. | docs/qa/b/screens/bs7-emp-cart-shortlisted-1440.png |
| S1 126 | PASS | Each cart row has "Profile" (to `/employer/intern/<id>?project=...`) and the initials link. | docs/qa/b/screens/bs7-emp-cart-1440.png |
| S1 127 | PASS | After choosing Robotics, visiting cart then bare `/employer/candidates` still selects "Robotics Software Intern" (cookie `ft_emp_project`); also kept on page 2 and via Compare. | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 128 | PASS | Same as 74 (Compare works from list, profile, quick view and cart-free pages; 4 max). | docs/qa/b/screens/bs7-emp-compare-page-1440.png |
| S1 129 | PASS | Profile has an "AI interview report" link (#ai-report) and an "AI INTERVIEW RESULTS" block with "Save as PDF"; quick view has "Full AI interview report". | docs/qa/b/screens/bs7-emp-profile-1440.png |
| S1 130 | PASS | Same as 87; also changing the dialog timezone recalculates the suggestions. | docs/qa/b/screens/bs7-emp-book-tz-nz-1280.png |
| S1 131 | PASS | Dialog timezone is changeable and defaults recompute: New York (27 Oct 16:56 there) -> 27 Oct 17:00/18:00/19:00; Dubai -> 01:00/02:00/03:00; Auckland -> 10:00/11:00/12:00. | docs/qa/b/screens/bs7-emp-book-tz-nz-1280.png |
| S1 132 | PASS | After booking, the cart row shows "Meeting booked", "Meeting until 28 Oct, 4:30 am" and no Book button; "Send proposal (available once the meeting is completed)". (Button is removed rather than greyed; I could not wait for the meeting to pass.) | docs/qa/b/screens/bs7-emp-cart-after-booking-1440.png |
| S1 133 | PASS | Company country sets timezone: India -> Asia/Kolkata, UAE -> "Your timezone: Asia/Dubai" on onboarding; project, booking and proposal default to it. | docs/qa/b/screens/bs7-emp-wk-onb-loc.png |
| S1 134 | PASS | Intern toggled open-to-work off: an employer without an accepted offer gets 404 "Page not found" on the profile and the candidate vanished from cart; the employer with the accepted offer still sees it. | docs/qa/b/screens/bs7-otw-profile-hidden-acct1.png |
| S1 135 | PASS | Delete asks "Delete "QA Temp Delete Me"? This can't be undone.", then `DELETE /api/employer/projects/<id>` 200; gone after reload (Projects count back to 2). | docs/qa/b/screens/bs7-emp-delete-confirm-1440.png |
| S1 136 | PASS | Orders -> Invoices tab shows 0 after a free-mode payment; no cancelled-payment invoice listed. | docs/qa/b/screens/bs7-emp-orders-1440.png |
| S1 137 | PASS | Escalation (second) email must be on the company domain: "Use an email on your company domain (acme-qa-test.in) for the escalation contact."; same on `/employer/account`. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S2 2 | PASS | Same as 87: at 01:50 IST dialog defaulted to 2:00, 3:00, 4:00; at 02:26 IST it defaulted to 2:30, 3:30, 4:30. | docs/qa/b/screens/bs7-emp-book-dialog-1440.png |
| S2 3 | PASS | UAE company: profile timezone Asia/Dubai, booking dialog defaults Asia/Dubai (00:45/01:45/02:45), send-proposal defaults Asia/Dubai; all changeable. | docs/qa/b/screens/bs7-emp-wk-onb-loc.png |
| S2 4 | PASS | Sidebar has a "Collapse sidebar" arrow; clicking took it from 256 px to 76 px wide and back. | docs/qa/b/screens/bs7-emp-sidebar-collapsed-1440.png |
| S2 7 | PASS | Dubai slots 00:45/01:45/02:45 appear to the intern as "Wed 28 Oct 2:15 AM / 3:15 AM / 4:15 AM IST ... converted from the company's Dubai time". DST is handled through IANA zones but no DST label is shown. | docs/qa/b/screens/bs7-intern-interviews-1280.png |
| NC 34 | PASS | Same as S1 72 on the company signup page. | docs/qa/b/screens/bs7-emp-google-click-375.png |
| NC 35 | UNCLEAR | Could not reproduce: four new employer accounts (three India, one UAE) signed up and logged in by API and UI without failure. | - |
| NC 36 | UNCLEAR | No failure reproduced with an employer, the intern and a second employer signed in at the same time from separate browser contexts. | - |
| NC 37 | PASS | India: Country is a select (198), State is a select (37), City is a typeahead list ("Jai" -> Jaipur, Jaisalmer). Non-India: State and City are plain text (D5, P2). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| NC 38 | PASS | Same fields on `/employer/onboarding` and the project sheet (state select + city). Same non-India caveat (D5). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| NC 39 | PASS | Employer sidebar has HELP: FAQ (`/faq#employers`), Contact us (`/contact`), Email us, Report a problem. | docs/qa/b/screens/bs7-emp-sidebar-collapsed-1440.png |
| NC 40 | PASS | Floating "Ask me" button measures 141x64 with the label and a "Stuck somewhere? Ask me" prompt. (It now causes overlap problems, D1.) | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| NC 41 | PASS | No photo `<img>` on candidates, compare or cart; avatar endpoint 403 for non-hired interns, 200 only after hire. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |

Counts: 65 PASS, 1 FAIL, 8 UNCLEAR (74 rows) (S1 86, 93, 97, 100, 110, 111; NC 35, 36).

## 2. Defects

**D1 (P1) The "Stuck somewhere? Ask me" bubble covers primary buttons on a phone.**
Route `/employer/send-proposal` (policy dialog), `/employer/projects`, dashboard, candidates; 375x812, Chromium and WebKit.
Steps: fill the proposal, tap "Review and send", read policies, wait 9 s.
Expected: "Agree and send" is tappable and readable.
Actual: the prompt bubble sits on top of the button (Playwright: "<button>Stuck somewhere? Ask me</button> ... subtree intercepts pointer events", 57 retries); only the leftmost ~55 px of the 293 px button can be tapped, label is hidden. Dialog is modal so the bubble cannot be dismissed. Same bubble covers Edit/Delete on a project card, "No hires yet" tile on the dashboard and the score on the next candidate card; at 1440 the FAB covers the label of "Complete for free (test mode)".
Screenshot: docs/qa/b/screens/bs7-emp-phone-sendprop-policy-chromium.png (also bs7-emp-phone-projects-chromium.png, bs7-emp-checkout-1440.png).

**D2 (P1) Checkout "Whole engagement" and the ledger disagree with the offer (row 121).**
Route `/employer/checkout`, 1440 and 375, Chromium and WebKit. Accepted offer: 2 months, ₹26,400/month.
Steps: select "Whole engagement".
Expected: months x monthly + one-time fee (₹52,800 + ₹5,000), no upfront discount.
Actual: "Engagement ₹24,000, Hiring fee ₹5,000, Total ₹29,000", cheaper than the monthly option's first payment (₹31,400). After paying month 1 (Due now ₹31,400) Orders shows "Paid so far ₹29,000, Still to pay ₹29,000, Next instalment 17 Sept 2026" (a past date). Possible cause: that offer was created by an earlier tester with "176 h" and 1 leave day (the form's formula gives 168 h), so the server recalculation (160 h x ₹150 = ₹24,000) differs from the stored ₹26,400. I could not repeat it with a freshly sent offer because only the synthetic intern can accept.
Screenshots: docs/qa/b/screens/bs7-emp-checkout-whole-1440.png, bs7-emp-orders-1440.png.

**D3 (P1, environment or unresolved) Employer signup cannot be completed in WebKit over plain http.**
Route `/employer/signup`, 375x812, Playwright WebKit.
Steps: fill the form, send code, enter the correct OTP, "Verify and create account".
Expected: account created.
Actual: `POST /api/auth/signup/verify-otp` 200 sets `ft_otp` with `Secure`, then `POST /api/auth/employer/signup` 400 `{"error":"Verify your email before creating the account"}` and the page says "Your verification has expired (it lasts 15 minutes)". Rewriting the Set-Cookie without `Secure` still failed. Chromium works. Probably the `Secure` cookie on http://localhost; please confirm on https/Safari. Logins (non-Secure `ft_sid`) work in WebKit, so I created the account in Chromium and ran the rest in WebKit.
Screenshot: docs/qa/b/screens/bs7-emp-signup-after-webkit.png.

**D4 (P2) Send-proposal form is reachable for a candidate whose meeting is still open, and only fails at the end.**
Route `/employer/send-proposal?intern=<id>`, 375x812 WebKit. The cart correctly shows "Send proposal (available once the meeting is completed)", but opening the URL directly shows the whole form; after the 9 s policy dialog the server answers 409 "The offer opens once the interview has happened." with only a toast (no inline message). Expected: form blocked or the message shown inline.
Screenshot: docs/qa/b/screens/bs7-emp-wk-after-send-alert.png.

**D5 (P2) Non-India companies get free-text State/City and an inconsistent PIN rule.**
Route `/employer/onboarding`, 375 WebKit. Country UAE: State is a text box ("State / region"), City is a text box with no suggestions. "Billing PIN code - Only needed for an Indian billing address" still errors "PIN code must be 6 digits" when 5 digits are typed. The escalation phone code defaults to +91 even when the company is in UAE (error "Indian numbers must be 10 digits"). Expected: country-appropriate dropdowns or no PIN validation outside India; code follows the primary code.
Screenshot: docs/qa/b/screens/bs7-emp-wk-onb-loc.png.

**D6 (P2) "Withdraw offer" has no confirmation.**
Route `/employer/proposal/<id>`, 1440. One click on "Withdraw offer" withdrew an accepted-unpaid offer immediately (no dialog). Expected: a confirm step before an irreversible action on an accepted offer.
Screenshot: docs/qa/b/screens/bs7-emp-withdraw-confirm-1440.png.

**D7 (P2) Phone tap targets under 44 px (measured with getBoundingClientRect, 375 px, same in Chromium and WebKit).**
Candidates: Shortlist 112x40, Send proposal 162x40, Quick view 121x40, Compare 114x40, Profile 90x40, grid/list/table view toggles 36x36, per-page links 36x36, skill chips 38 px high, "Show everyone" 24 px high, initials button 21x27. Dashboard: "Manage" 60x20, "Browse all" 76x20. Projects: filter tabs 40 px, Find candidates/Edit/Close/Delete 36 px. Proposals: Edit/Withdraw/View 36 px, project-name links 23 px. Schedule: Join meeting/Send reminder/Reschedule/Leave feedback 36 px. Orders: tabs 40 px, Timesheets/Contract 36 px. Compare: remove-from-comparison X 36x36. Checkout: radios 16x16, "Past payments" 96x17. Dialogs: close X 16x16, policy checkbox 16x16. Signup flow: "Change details" 113x18, "Resend code" 78x18.
Screenshot: docs/qa/b/screens/bs7-emp-phone-cand-mid-chromium.png.

**D8 (P2) Text cut off on phone.**
Candidate cards and quick view at 375: the rating label "AI interview" is clipped to "AI intervie...". Projects cards: the meta labels (Scope / Work mode / Timezone) are clipped by their containers.
Screenshot: docs/qa/b/screens/bs7-emp-phone-quickview-chromium.png.

**D9 (P2) 404 from `/api/intern/avatar?id=f1d6d24c-...` on candidates and compare pages.**
Route `/employer/candidates` and `/employer/compare`, 1440. Console: "Failed to load resource: the server responded with a status of 404". Expected: no failing request for a hidden/initials avatar.
Screenshot: docs/qa/b/screens/bs7-emp-compare-page-1440.png.

**D10 (P2) Onboarding returns to step 1 after a reload.**
Route `/employer/onboarding`, 375. After "Save and continue" on step 1, reloading shows step 1 again (values are kept) instead of step 2.
Screenshot: docs/qa/b/screens/bs7-emp-onb-step2-375.png.

**D11 (P2) Overlap on the "Skills" field of the first project (known "Ask me" class, new location).**
Route `/employer/onboarding` step 2, 375. The prompt bubble covers the Skills input and its helper text.
Screenshot: docs/qa/b/screens/bs7-emp-onb-step2-375.png.

Phone path notes: no horizontal scroll anywhere (scrollWidth 375 on 10 pages); numeric fields have `inputmode=numeric` (PIN, phones, OTP: `text`+`inputmode=numeric`+`autocomplete=one-time-code`); billing/escalation fields are fine. The proposal "Monthly hours" and "Monthly amount" are plain text inputs without inputmode (computed, so harmless).

## 3. Phone critical path summary

- Chromium: signup -> OTP -> onboarding step 1 (all fields) -> step 2 project (7 skills) -> dashboard -> candidates -> shortlist -> cart -> book meeting -> send proposal (D1 on the policy dialog) -> proposals list. Checkout was done at 375 on the existing employer's accepted offer (new employers cannot get an offer accepted without the intern).
- WebKit: signup blocked (D3), then login -> onboarding (UAE) -> project -> candidates -> shortlist -> cart -> book (Dubai) -> send proposal (blocked for the booked candidate, D4; sent to another candidate) -> checkout (existing employer, paid in free mode).
