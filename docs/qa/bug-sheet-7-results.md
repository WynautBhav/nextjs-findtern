# Bug sheet 7: results (Tester B, 28 Oct 2026)

Source: `docs/bug-sheet-7.tsv` (untracked in the main checkout; 135 rows in Sheet1, 6 in Sheet2, 40 in NEW CHANGES, row numbers as printed in the TSV).
Build under test: production build of `release/master-merge` @ 733c683 against a scrubbed copy of the 27 Oct live dump, Chromium (1440 and 375 px) with WebKit at 375 px for the phone path, `PAYMENTS_MODE=free`. Re-run any row with the scripts in `docs/qa/b/repro/`.

Verdicts: **PASS** the complaint no longer applies or the requested change is present; **FAIL** it still applies; **UNCLEAR** no testable criterion (a question, no target wording, an environment limit such as Google OAuth, or rows that contradict each other; the later row wins and the finding says what the build does); **N/A** date-serial header, section header or empty row.

Totals over all 182 rows (Sheet1 has 136 data rows, rows 2 to 137): PASS 152, FAIL 3, UNCLEAR 11, N/A 16 (after the 28 Oct pass over the 18 unclear rows: 5 became PASS, 2 became FAIL, see the last section).
Per sheet: S1 (Sheet1): PASS 112, FAIL 3, UNCLEAR 7, N/A 14; S2 (Sheet2): PASS 6; NC (NEW CHANGES): PASS 34, UNCLEAR 4, N/A 2.

Every FAIL is in `docs/qa/bug-ledger.md` (S1 r121 is QA-112; S1 r41 and r45 are QA-137). Defects found while walking the rows that no row describes are QA-100 to QA-117 there (phone layout, tap targets, the floating "Ask me" button, cookies, checkout arithmetic).

Detail by area, with the extra findings and the per-area scripts: `docs/qa/b/bs7-marketing-results.md`, `docs/qa/b/bs7-employer-results.md`, `docs/qa/b/bs7-intern-results.md`.

| sheet | row | verdict | finding | screenshot |
|---|---|---|---|---|
| S1 | 2 | PASS | Header logo is the real PNG (1200x361 source) shown at 186x56 px (1440) / 160x48 (375); at 2x device scale it is crisp, tagline "INTERNSHIP SIMPLIFIED" legible. | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| S1 | 3 | PASS | Hero (1440 and 375) has no video behind the headline. The only `<video>` sits in its own rounded band (1118x479 at 1440, 333x416 at 375) below the two audience cards, with no overlap with neighbouring sections; overlaid copy "Screened before you meet them" is legible. The complaint is vague, so this is judged on "nothing overlaps or hides behind the video". | docs/qa/b/screens/bs7mk-video-1440.png |
| S1 | 4 | UNCLEAR | Sheet gives no target text. Current step 3 = "AI Interview: Candidates pick the skills they want to be hired for, and our AI interviews them on exactly those skills." Step 6 = "Findtern Score: Every intern gets one score out of 10, built from the AI interview, aptitude and coding results." Neither is broken. | docs/qa/b/screens/bs7mk-steps-1440.png |
| S1 | 5 | PASS | /intern-nda: title on two clean lines (no mid-word "Non-Bypass" break), "Important" callout box, numbered clauses 1 to 6 with bold titles on their own line, sub-bullets with consistent indent; same at 375 (no overflow in the document body). | docs/qa/b/screens/bs7mk-intern-nda-1440-s0.png |
| S1 | 6 | PASS | Home "Compare every attribute" block: "Talk to us" href=`/contact`; the "Not sure which plan fits? Talk to us" button is also `/contact`. Neither points at /employers. | docs/qa/b/screens/bs7mk-home-1440-s6.png |
| S1 | 7 | PASS | About strip reads "TRUSTED BY LEADING COMPANIES ACROSS INDIA"; home strip reads "WORKING WITH TEAMS AT LEADING ORGANISATIONS". No "working with 9 companies" text on either page (text search of both). | docs/qa/b/screens/bs7mk-about-1440-s1.png |
| S1 | 8 | PASS | Calculator has only plan menu (Espresso/Cappuccino/Latte) and days menu ("5 days", "6 days"); copy says "Every day is a full 8-hour day". No 4 h or 6 h option anywhere on /pricing (text search, both widths). | docs/qa/b/screens/bs7mk-pricing-1440-s1.png |
| S1 | 9 | PASS | `/pricing` with the INR/USD menu set to USD (and by default for a US-locale visitor): 0 occurrences of the rupee sign, 31 "$" values (e.g. "$1/hr", "$160 a month at 160 hours", "$50 per hire"). Menu offers only INR and USD. See X3 for pages outside /pricing that stay in INR. | docs/qa/b/screens/bs7mk-pricing-usd-1440.png |
| S1 | 10 | PASS | Text-node scan of 15 marketing routes (accordions expanded, incl. both FAQ tabs): 0 email strings outside an `a[href^=mailto:]`. Header mobile menu, footer, FAQ answers, legal pages, contact page all linked. | docs/qa/b/screens/bs7mk-contact-1440-s0.png |
| S1 | 11 | PASS | /contact phone input: `type=tel`, `inputmode=numeric`, letters stripped (typed "abc98765432109876543" gives "9876543210"), maxlength 10 with +91; hint "10 digits starting with 6-9". For other countries the length is a 6 to 15 range (maxlength 15), not a single fixed length. | docs/qa/b/screens/bs7mk-contact-phone-1440.png |
| S1 | 12 | PASS | /faq has two tab buttons: "I'm looking for an internship" (49 questions) and "I'm hiring" (40 questions); clicking switches the list; `/faq#interns` and `/faq#employers` open the right tab. Same at 375. | docs/qa/b/screens/bs7mk-faq-default-1440.png |
| S1 | 13 | PASS | Terms card "4. Hiding your profile: You can hide your profile from employers when you need a break, but never for more than 30 days at a time." Card "6. What counts as a placement: A contracted engagement of 160 hours or more: a signed proposal ... hours logged on weekly timesheets, and a stipend paid through Findtern. About four full-time weeks." | docs/qa/b/screens/bs7mk-guar-terms-1440.png |
| S1 | 14 | PASS | /interns: all 3 mailto links (page, header menu, footer) and every visible address are `communicate@findtern.in`; 0 `admin@` anywhere in the rendered page. | docs/qa/b/screens/bs7mk-interns-1440-s2.png |
| S1 | 15 | PASS | No plan cards (no Espresso/Cappuccino/Latte, no "/hr", no "a month"). One price line in the hero: "One-time fee ₹2,499, refunded in full if you are not placed. How the guarantee works", link href=`/guaranteed-internship-program`. | docs/qa/b/screens/bs7mk-interns-1440-s0.png |
| S1 | 16 | PASS | Five numbered stage cards with a time chip each: "About 15 minutes", "30 to 60 minutes", "Once your results are reviewed", "Within the 18-month window", "Stipend paid monthly" (previously terse: "After review", "Until placed"). Heading "The **Findtern** Guarantee": word Findtern is gold `rgb(247, 206, 142)` with the underline curve, rest white (as on the legacy page). The sheet does not say which times were wanted; the owner should confirm the values. | docs/qa/b/screens/bs7mk-interns-1440-s1.png |
| S1 | 17 | N/A | Date serial header row (46316), not a bug. |  |
| S1 | 18 | PASS | The only `<video>` has `controls=false`, muted, loop, autoplay-by-observer; 0 buttons with play/pause/mute/video in name or text on the page; the video is playing (paused=false, currentTime advancing) at both widths. | docs/qa/b/screens/bs7mk-video-375.png |
| S1 | 19 | N/A | Empty row. |  |
| S1 | 20 | N/A | Section header "Intern Page". |  |
| S1 | 21 | PASS | `/login` and `/signup` both carry a Google button (`/api/auth/google/start?role=intern`). The OAuth round trip cannot run here (no client id). |  |
| S1 | 22 | PASS | Onboarding step 1: empty Continue says "Aadhaar number is required.", "PAN is required for stipend payouts.", "Upload a photo or scan of your Aadhaar card.", "Upload a photo or scan of your PAN card." | docs/qa/b/screens/onb-step1-errors-375.png |
| S1 | 23 | PASS | "Your mobile number" and "Emergency contact number" are two separate fields. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1 | 24 | PASS | Mobile number is pre-filled (+91 and the signup number) and read-only with "To change it, go to Settings". | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1 | 25 | PASS | Resolved 28 Oct by reading the legacy: the intro video is optional there too (photo required, video optional, `onboarding.tsx:794`). Was: Query row. Intro video exists as "Intro video (optional)", 30 to 60 s, MP4/WebM/MOV up to 50 MB. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1 | 26 | PASS | Academics level list: Diploma, Bachelor's, Master's, Ph.D. No "High school". | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 27 | PASS | Open roles list and detail show no company name ("Company shared after hire"). | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S1 | 28 | PASS | After submitting the profile the dashboard shows "1 of 3 done": profile, then the one-time activation, then the AI interview. | docs/qa/b/screens/intern-activated-dashboard-375.png |
| S1 | 29 | PASS | Degree becomes a dropdown (BA, B.Com, BBA, BMS, BSc, B.Tech, BCA, MBBS, ...) once a level is chosen. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 30 | PASS | Start year and End year fields; "Completed" with end year 2031 gives "You marked this as completed, so the end year cannot be after 2026." | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 31 | PASS | CGPA 11 gives "CGPA is out of 10"; percentage 101 gives "Percentage cannot be more than 100." | docs/qa/b/screens/onb-step2-filled-375-chromium.png |
| S1 | 32 | PASS | Academics has "Professional courses" (CA, CS, CMA, CFA, Other) and "Certifications" sections. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 33 | PASS | Experience row has an "I currently work here" checkbox; its label is 170 x 44 px at 375 (the box itself is 18 px). Visual polish not judged beyond that. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1 | 34 | PASS | Start and End date fields take DD/MM/YYYY and have an "Open calendar" button. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1 | 35 | PASS | An experience row with nothing filled lists errors for type, role, company, start date, end date (or "currently work here") and description. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1 | 36 | PASS | Skill suggestions mix technical and non-technical (React, Node.js, SQL, Marketing, Digital Marketing, Content Writing, Sales, Recruitment, Finance, Accounting). | docs/qa/b/screens/onb-step4-375-chromium.png |
| S1 | 37 | PASS | Each language row has Read, Write and Speak checkboxes and a level. | docs/qa/b/screens/onb-step5-375-chromium.png |
| S1 | 38 | PASS | Single pick among Remote / Hybrid / Onsite ("Pick the most on-site option you can do"); the intern profile of the hired persona reads "Hybrid, and open to remote". | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| S1 | 39 | PASS | Onsite or Hybrid without a city: "Add at least one city you can work from (up to 5) for onsite or hybrid work." Field "Add a city (0 of 5)". | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| S1 | 40 | PASS | Review > Submit profile (double-clicked) lands on /intern/dashboard in Chromium and WebKit; the button is gone, no double submit. A failed submit (409 on a duplicate Aadhaar or emergency number) returns to step 1 with the message. | docs/qa/b/screens/onb-step8-375-chromium.png |
| S1 | 41 | FAIL | QA-137. The checklist item reads "Aadhaar and PAN, with card images"; the sheet wants the PAN document only. Was: No percentage "profile completion bar" on the dashboard any more; a "(done)" checklist is on /intern/profile. The row asks for a PAN document in that bar and the checklist text does not name it. | docs/qa/b/screens/bs7-intern-profile-1440.png |
| S1 | 42 | PASS | An offer for a monthly amount of 26,400 shows the intern "Stipend ₹13,200 / month" (half). | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1 | 43 | PASS | Joining date "06/11/2026" is on the offer card, list and details. | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1 | 44 | N/A | Date serial header row (46316). |  |
| S1 | 45 | FAIL | QA-137. The build blocks onboarding without the Aadhaar image; legacy `onboarding.tsx:797` requires only the PAN image, and r22 asks for the Aadhaar number and the PAN image (not an Aadhaar image), so r45 and r22 agree. (My first reading took r22 to say the image is mandatory; it says the number.) | docs/qa/b/screens/onb-step1-errors-375.png |
| S1 | 46 | UNCLEAR | "Bank account should not be there" conflicts with NC-r25 and NC-r27 (bank asked on the About page, with a bank-name dropdown). Current build: a bank block on step 1, labelled "Optional now - but once you start, fill in every field". | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1 | 47 | PASS | Reads as "only the emergency number is required": one emergency number field, required. | docs/qa/b/screens/onb-step1-errors-375.png |
| S1 | 48 | PASS | LinkedIn profile is marked optional. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1 | 49 | PASS | Certification dates are DD/MM/YYYY with a calendar (no "year" question). | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 50 | PASS | Skills step has an "Important note" explaining the self-rating sets the AI interview difficulty. | docs/qa/b/screens/onb-step4-375-chromium.png |
| S1 | 51 | PASS | Conflicts with NC-r20 (only the picked chip looks selected); the owner decision is single pick with the implied set stored. Only one chip is selected at a time and the profile shows "Hybrid, and open to remote". | docs/qa/b/screens/onb-step7-Hybrid-375-chromium.png |
| S1 | 52 | PASS | Exercised 28 Oct: an intern's "Report a problem" lands in Admin > Messages as a "Problem report" (found by its text; `bs7-s1r52.mjs`). Was: A question ("where does this query show"). Admin has a Messages inbox (nav item, 64 entries on the LIVE-COPY); the intern-side submission was not exercised. |  |
| S1 | 53 | PASS | "If you do nothing, the offer stays open until the day before the joining date (6 Nov 2026). On the joining date it closes and is marked as rejected." | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1 | 54 | N/A | Date serial header row (46317). |  |
| S1 | 55 | PASS | After accepting, /intern/timesheets says "Timesheets open once the company pays ... logging hours opens as soon as the company completes the payment". The hired persona has timesheets. | docs/qa/b/screens/intern-accepted-375-chromium.png |
| S1 | 56 | N/A | Date serial header row (46318). |  |
| S1 | 57 | PASS | Only one emergency phone, no second contact. | docs/qa/b/screens/onb-step1-errors-375.png |
| S1 | 58 | PASS | "Specialization (optional)". | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 59 | PASS | Each professional course and certification row has an "Upload certificate" control. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1 | 60 | UNCLEAR | Editing preferred location after onboarding was not exercised (no edit path found from the profile page in this pass). |  |
| S1 | 61 | PASS | After "Activate free (test mode)" the dashboard shows "Pay the one-time activation, ₹2,499 (done)" and moves on to the AI interview. | docs/qa/b/screens/intern-activated-dashboard-375.png |
| S1 | 62 | PASS | No "Incruiter" text on interviews, dashboard, profile, documents, settings or opportunities. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1 | 63 | PASS | Resolved by reading 28 Oct: `src/app/intern/interviews/page.tsx` puts the AI interview in its own section labelled "AI Interview" and maps the hidden-company marker to "Company shared after hire"; legacy has no such text. Re-check with a live provider link. Was: Needs a generated AI-interview link; the interview provider is disabled in this environment. No "Hidden company" text appears on the interviews page. |  |
| S1 | 64 | PASS | Interviews page shows the intern's name with Findtern Score, Communication, Coding, Aptitude, AI Interview (all /10). | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1 | 65 | PASS | Dashboard and timesheets say logging hours opens once the company completes payment (see r55). | docs/qa/b/screens/intern-accepted-375-chromium.png |
| S1 | 66 | N/A | Date serial header row (46321). |  |
| S1 | 67 | PASS | Same as r27: no company name on the open roles list or detail. | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S1 | 68 | N/A | Date serial header row (46322). |  |
| S1 | 69 | PASS | No "none of these work, ask for a new one" control on the interviews page (booked state). The pending-slots state was not available to exercise. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1 | 70 | N/A | Empty row. |  |
| S1 | 71 | N/A | Section header "Company". |  |
| S1 | 72 | PASS | "Sign up with Google" button (327x44 at 375 px) is on `/employer/signup`; click works but OAuth is unconfigured here (lands on login with a clear message). | docs/qa/b/screens/bs7-emp-google-click-375.png |
| S1 | 73 | PASS | Brand-new employer: `/employer/dashboard`, `/employer/candidates`, `/employer/cart`, `/employer/send-proposal` all redirect to `/employer/onboarding`, also after step 1 is saved but before a project exists. (`/employer/projects` and `/employer/orders` are not gated.) | docs/qa/b/screens/bs7-emp-gate-dashboard-after-1.png |
| S1 | 74 | PASS | "Compare" on a card adds it; 4th add shows "Compare full (4)"; `/employer/compare` shows 4 side by side with a leader marked. | docs/qa/b/screens/bs7-emp-compare-page-1440.png |
| S1 | 75 | PASS | After OTP verify the new account lands on `/employer/onboarding` ("Set up your hiring account", step 1 company, step 2 first project). | docs/qa/b/screens/bs7-emp-signup-after-chromium.png |
| S1 | 76 | PASS | Filter set matches legacy dashboard (skills, preferred city, include remote, laptop, hourly price, ratings: Findtern score / comm / coding / aptitude / AI interview, sort). Measured: r_coding=9 -> 27 results all coding>=9; r_communication=9 -> 12 all comm>=9; min score 9 -> 6; plan=standard -> 107, all "Free". | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 77 | PASS | Scanned every page of "Show everyone" (about 267 candidates): every card carries an AI interview score > 0 (no unscored candidate). | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 78 | PASS | Cards, cart, quick view show initials avatars ("PH", "QT"); no `<img>` in the list; `/api/intern/avatar` returned 403 for non-hired candidates, 200 only for the hired one. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 79 | PASS | Every card has "Profile" and "Quick view"; quick view has "Full profile"; cart has "Profile". | docs/qa/b/screens/bs7-emp-phone-quickview-chromium.png |
| S1 | 80 | PASS | Project skills input stops at 7: "7 added. Remove one to swap it out." (input disabled); label "At least 4, at most 7". Same on New project sheet. | docs/qa/b/screens/bs7-emp-proj-skills-375.png |
| S1 | 81 | PASS | Scope of work offers exactly "Up to 60 days / Up to 90 days / Up to 180 days" (onboarding and New project). | docs/qa/b/screens/bs7-emp-onb-step2-375.png |
| S1 | 82 | PASS | Switching project changes list and criteria: "Data Analyst Intern" -> 34 interns, skills React+SQL, city Bengaluru; "Robotics Software Intern" -> 49 interns, skills React. | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 | 83 | PASS | Cart has no hire/pay button; text says "Book a meeting ... then send a proposal; you pay only once a candidate accepts"; checkout only lists accepted offers. | docs/qa/b/screens/bs7-emp-cart-shortlisted-1440.png |
| S1 | 84 | PASS | Start date input `min` = tomorrow; forcing 2026-10-20 gives "Pick a date after today." | docs/qa/b/screens/bs7-emp-sendprop-pastdate-1440.png |
| S1 | 85 | PASS | India employer: "Billed in INR, set by your company's country", ₹ everywhere; UAE employer: "Billed in USD", "$2/hr", "$50 per hire", "$320 a month". No payment-type selector on the proposal. | docs/qa/b/screens/bs7-emp-wk-sendprop.png |
| S1 | 86 | UNCLEAR | "proposal need to be change" has no testable criterion. | - |
| S1 | 87 | PASS | At 01:50 IST the booking dialog suggested 2:00 am, 3:00 am, 4:00 am (next quarter hour, +1h, +2h); time pickers list only :00/:15/:30/:45 and are editable. | docs/qa/b/screens/bs7-emp-book-dialog-1440.png |
| S1 | 88 | PASS | Proposals list and proposal page have "Edit offer"/"Edit"; edit form opens with all fields (duration, schedule, hours, tz, text) and "Save changes" updated "Length 6 months" and the text. | docs/qa/b/screens/bs7-emp-proposal-edit-accepted-1440.png |
| S1 | 89 | PASS | "View" opens the full offer: hourly rate, monthly amount (includes GST), one-time hiring fee, schedule, leave, hours, timezone, mode, laptop, tasks, skills, meeting rules, assessment snapshot. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 | 90 | N/A | Date serial header rows (46316, 46317, 46318, 46321). |  |
| S1 | 91 | PASS | Company email is read-only ("Your sign-in email. It can't be changed here."); website `https://www.example.org` -> "The website must be on your company email's domain (acme-qa-test.in) ..."; subdomain/own domain accepted. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 | 92 | PASS | Empty escalation name/email/phone -> "An escalation contact name is required." / "...email is required." / "...phone is required."; form does not advance. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 | 93 | PASS | Answered by the recorded owner decision (21 to 26 Oct): projects take up to 3 locations, the build stops at "3 of 3 added". Was: A question ("why up to 5 locations"). Observed: project locations now stop at "3 of 3 added" (matches the 3-location decision). | docs/qa/b/screens/bs7-emp-newproject-onsite-1440.png |
| S1 | 94 | PASS | Same filter set as row 76 (legacy list read from the old employer dashboard: skills, city, include remote, laptop, price, five min-ratings); each tested filter narrows correctly. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 95 | PASS | "Include remote candidates - Also show interns who only work remotely" checkbox in the Location filter (default on for remote projects). Caveat: no remote-only candidate in this data, so toggling gave 34 -> 34. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 96 | PASS | Compare page has no "zero placement surcharge" line (searched "surcharge"/"placement"); only "Per-hire charge ₹5,000". | docs/qa/b/screens/bs7-emp-compare-skills-1440.png |
| S1 | 97 | UNCLEAR | A question. Compare lists every skill the candidate has, no cap (a synthetic candidate with 68 skills shows all 68, matches first). | docs/qa/b/screens/bs7-emp-compare-skills-1440.png |
| S1 | 98 | PASS | No "+N more" anywhere in about 290 cards; cards show all skills (a 68-skill candidate shows all chips). | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 99 | PASS | Form, review and offer page show one "Monthly amount" ₹32,000 (does not change with 1/2/3/6 months); "Length 3 months" is separate. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 | 100 | PASS | Compared 28 Oct with legacy `proposal-detail.tsx`: the intern offer page has the same sections (Internship details, Roles and responsibilities, AI interview ratings, Required key skills, Important Instructions) plus Company details; the legacy "Compensation" block is inside Internship details. Pixel parity is not judged. Was: No criterion beyond layout; intern's offer page renders sanely (stipend, joining date, schedule, company, responsibilities, instructions). | docs/qa/b/screens/bs7-intern-offer-1280.png |
| S1 | 101 | PASS | After sending, `/employer/proposals` lists the offer ("Waiting on candidate", ₹32,000 a month, 3 months, Starts 02/11/2026) with Edit/Withdraw/View. | docs/qa/b/screens/bs7-emp-proposal-view-1440.png |
| S1 | 102 | N/A | Date serial header row (46317), not a bug. |  |
| S1 | 103 | PASS | Escalation email equal to sign-in email -> "Use a different email from your sign-in email."; also on `/employer/account`: "Use a different email from the company sign-in email." | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S1 | 104 | PASS | Primary and escalation phone fields each have a country-code select (170 codes, default +91). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| S1 | 105 | PASS | New UI offer: Mon-Fri, 2 leave days -> (22-2)x8 = 160 h, ₹200/hr x 160 = ₹32,000; Mon-Sat 2 leave -> 192 h ₹38,400; 0 leave -> 208 h ₹41,600; 3 leave -> 184 h ₹36,800; USD: $2 x 160 = $320. Hiring fee shown separately (₹5,000/$50). Note: no total (months x monthly + fee) is shown before sending. | docs/qa/b/screens/bs7-emp-sendprop-review-1440.png |
| S1 | 106 | PASS | After "Agree and send" the page goes to `/employer/proposals` (Chromium 375 and WebKit 375). | docs/qa/b/screens/bs7-emp-wk-after-send-alert.png |
| S1 | 107 | PASS | Checkout "How to pay": "Monthly - First month now, then 1 more monthly" (default) or "Whole engagement"; after paying month 1 the page shows "Month 2 of 2, ₹26,400 this month". (See defect D2 for the whole-engagement amount.) | docs/qa/b/screens/bs7-emp-checkout-1440.png |
| S1 | 108 | PASS | "Withdraw" on waiting offers: one click moved an accepted-unpaid offer to "Withdrawn" and counts updated (Closed 1). No confirmation step (D6). | docs/qa/b/screens/bs7-emp-proposal-accepted-1440.png |
| S1 | 109 | N/A | Date serial header row (46318), not a bug. |  |
| S1 | 110 | UNCLEAR | Functional filter set matches legacy (see 76); "same design" cannot be judged without a pixel reference. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 111 | UNCLEAR | "Quick view design needs to be changed" has no criterion; it renders cleanly at 1440 and 375 (score, price, ratings, skills, preferences, academics). | docs/qa/b/screens/bs7-emp-phone-quickview-chromium.png |
| S1 | 112 | PASS | Profile shows initials plus "AI INTERVIEW RESULTS: Findtern Score 7.5, Comms 7.5, Coding 7.5, Aptitude 7.5, AI Interview 7.5"; hired candidate shows real name. | docs/qa/b/screens/bs7-emp-profile-1440.png |
| S1 | 113 | PASS | Standard band shows "Free" (filter option "Free · Standard"; cards "STANDARD 5.9/10 Free"); no "₹0"/"$0" in the list. | docs/qa/b/screens/bs7-emp-cand-1440.png |
| S1 | 114 | PASS | Work-mode buttons follow the candidate: "This candidate is open to remote or hybrid work" -> Remote, Hybrid only; an open-to-all candidate shows Remote, Hybrid, On-site. | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 | 115 | PASS | Working hours: From/To time inputs plus presets (9am-6pm, 9am-1pm, 5pm-9pm) and a "Flexible hours" checkbox, all editable. | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 | 116 | PASS | Proposal timezone defaults to the company zone (Asia/Kolkata for India, Asia/Dubai for UAE) and is changeable (set to America/New_York). | docs/qa/b/screens/bs7-emp-sendprop-1440.png |
| S1 | 117 | PASS | Accepted-unpaid offer shows "Edit offer" and "Withdraw offer" ("you can still edit the offer (the candidate accepts it again) or withdraw it"); edit form opens fully enabled; withdraw executed. | docs/qa/b/screens/bs7-emp-proposal-edit-accepted-1440.png |
| S1 | 118 | PASS | Checkout shows "Hiring fee (one-time) ₹5,000" with the first month (Due now ₹31,400 = ₹26,400 + ₹5,000); the month-2 summary has no fee ("Due now ₹26,400"). USD employer sees $50. | docs/qa/b/screens/bs7-emp-checkout-1440.png |
| S1 | 119 | PASS | Button "Complete for free (test mode)" with "Test mode: no payment is taken"; clicking completed the hire (intern then sees "The company completed the payment. Log your hours"). | docs/qa/b/screens/bs7-emp-wk-after-pay.png |
| S1 | 120 | N/A | Date serial header row (46321), not a bug. |  |
| S1 | 121 | FAIL | (QA-112) "Whole engagement" is far below the monthly sum: 2 months at ₹26,400 shows "Engagement ₹24,000 + fee ₹5,000 = ₹29,000", less than the month-1 option (₹31,400), i.e. an effective upfront discount (see D2). | docs/qa/b/screens/bs7-emp-checkout-whole-1440.png |
| S1 | 122 | PASS | Schedule: "Leave feedback" appears only on the Completed card; Booked and Waiting cards show Join/Reminder/Reschedule/Offer new times only. | docs/qa/b/screens/bs7-emp-schedule-1440.png |
| S1 | 123 | PASS | With React+SQL selected every listed card contains React or SQL (0 exceptions of 24); copy says "Candidates with any of them are shown; more matches rank higher". | docs/qa/b/screens/bs7-emp-cand-top-1440.png |
| S1 | 124 | PASS | Changing project replaces the skills (Figma added manually, then switching to Robotics gave "React" only). | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 | 125 | PASS | Cart: newly shortlisted candidates (no proposal yet) are listed above the older "Proposal sent" candidate. | docs/qa/b/screens/bs7-emp-cart-shortlisted-1440.png |
| S1 | 126 | PASS | Each cart row has "Profile" (to `/employer/intern/<id>?project=...`) and the initials link. | docs/qa/b/screens/bs7-emp-cart-1440.png |
| S1 | 127 | PASS | After choosing Robotics, visiting cart then bare `/employer/candidates` still selects "Robotics Software Intern" (cookie `ft_emp_project`); also kept on page 2 and via Compare. | docs/qa/b/screens/bs7-emp-cand-projswitch-1440.png |
| S1 | 128 | PASS | Same as 74 (Compare works from list, profile, quick view and cart-free pages; 4 max). | docs/qa/b/screens/bs7-emp-compare-page-1440.png |
| S1 | 129 | PASS | Profile has an "AI interview report" link (#ai-report) and an "AI INTERVIEW RESULTS" block with "Save as PDF"; quick view has "Full AI interview report". | docs/qa/b/screens/bs7-emp-profile-1440.png |
| S1 | 130 | PASS | Same as 87; also changing the dialog timezone recalculates the suggestions. | docs/qa/b/screens/bs7-emp-book-tz-nz-1280.png |
| S1 | 131 | PASS | Dialog timezone is changeable and defaults recompute: New York (27 Oct 16:56 there) -> 27 Oct 17:00/18:00/19:00; Dubai -> 01:00/02:00/03:00; Auckland -> 10:00/11:00/12:00. | docs/qa/b/screens/bs7-emp-book-tz-nz-1280.png |
| S1 | 132 | PASS | After booking, the cart row shows "Meeting booked", "Meeting until 28 Oct, 4:30 am" and no Book button; "Send proposal (available once the meeting is completed)". (Button is removed rather than greyed; I could not wait for the meeting to pass.) | docs/qa/b/screens/bs7-emp-cart-after-booking-1440.png |
| S1 | 133 | PASS | Company country sets timezone: India -> Asia/Kolkata, UAE -> "Your timezone: Asia/Dubai" on onboarding; project, booking and proposal default to it. | docs/qa/b/screens/bs7-emp-wk-onb-loc.png |
| S1 | 134 | PASS | Intern toggled open-to-work off: an employer without an accepted offer gets 404 "Page not found" on the profile and the candidate vanished from cart; the employer with the accepted offer still sees it. | docs/qa/b/screens/bs7-otw-profile-hidden-acct1.png |
| S1 | 135 | PASS | Delete asks "Delete "QA Temp Delete Me"? This can't be undone.", then `DELETE /api/employer/projects/<id>` 200; gone after reload (Projects count back to 2). | docs/qa/b/screens/bs7-emp-delete-confirm-1440.png |
| S1 | 136 | PASS | Orders -> Invoices tab shows 0 after a free-mode payment; no cancelled-payment invoice listed. | docs/qa/b/screens/bs7-emp-orders-1440.png |
| S1 | 137 | PASS | Escalation (second) email must be on the company domain: "Use an email on your company domain (acme-qa-test.in) for the escalation contact."; same on `/employer/account`. | docs/qa/b/screens/bs7-emp-onb-errors-375.png |
| S2 | 2 | PASS | Same as 87: at 01:50 IST dialog defaulted to 2:00, 3:00, 4:00; at 02:26 IST it defaulted to 2:30, 3:30, 4:30. | docs/qa/b/screens/bs7-emp-book-dialog-1440.png |
| S2 | 3 | PASS | UAE company: profile timezone Asia/Dubai, booking dialog defaults Asia/Dubai (00:45/01:45/02:45), send-proposal defaults Asia/Dubai; all changeable. | docs/qa/b/screens/bs7-emp-wk-onb-loc.png |
| S2 | 4 | PASS | Sidebar has a "Collapse sidebar" arrow; clicking took it from 256 px to 76 px wide and back. | docs/qa/b/screens/bs7-emp-sidebar-collapsed-1440.png |
| S2 | 5 | PASS | Same as S1-r27. | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S2 | 6 | PASS | Same as S1-r69. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S2 | 7 | PASS | Dubai slots 00:45/01:45/02:45 appear to the intern as "Wed 28 Oct 2:15 AM / 3:15 AM / 4:15 AM IST ... converted from the company's Dubai time". DST is handled through IANA zones but no DST label is shown. | docs/qa/b/screens/bs7-intern-interviews-1280.png |
| NC | 2 | PASS | Header logo height 56 px at top / 48 px scrolled at 1440 (source code shows it was 44 / 40 before); 48 / 44 at 375; footer logo 64 px high (was 56). But see X1: at 375 the larger header no longer fits. | docs/qa/b/screens/bs7mk-hero-hiring-1440.png |
| NC | 3 | PASS | Hero now has an "I'm hiring / I'm a student" switch (aria-pressed). Clicking "I'm a student" swaps headline to "Get a paid internship, or get your fee back." with CTAs "Create my profile" / "How it works for interns"; a "For students" card sits beside "For employers" under the hero. Default is still the hiring side, as an owner choice. | docs/qa/b/screens/bs7mk-hero-student-1440.png |
| NC | 4 | PASS | All 7 steps measured: label 11px/600, title 19px/600 (17.15px at 375), body 16px/400, line-height 26px; identical for steps 1 to 7 at both widths. | docs/qa/b/screens/bs7mk-steps-1440.png |
| NC | 5 | PASS | No "skill-based" text on /, /about, /pricing, /contact, /interns, /employers, /guaranteed-internship-program, /blog, /opportunities. Only hit is the FAQ answer sentence "Skill-based questions, customized ..." (body copy, not the step label). | docs/qa/b/screens/bs7mk-steps-1440.png |
| NC | 6 | PASS | Same evidence as S1-r5: title wraps at "Acceptance," / "Compliance & Non-Bypass Agreement", callout, numbered clause titles; no stray line breaks in clause text. | docs/qa/b/screens/bs7mk-intern-nda-375-s0.png |
| NC | 7 | PASS | Block "What the guarantee does not cover" has 4 items; the 4th is "More than 3 offers turned down: Reject more than 3 offers and you are no longer eligible for the refund. Only formal offers count, not interview requests." The owner's own sentence says "more than 3 times", which matches (a "3 or more" reading would differ by one offer). | docs/qa/b/screens/bs7mk-guar-notcover-1440.png |
| NC | 8 | PASS | Home and /pricing (the "Hire an intern for the price of a coffee" sections and their footers) show only `admin@findtern.in` as visible/mailto text; 0 visible `communicate@`. "Talk to us" goes to /contact, which labels both addresses. | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC | 9 | PASS | /contact country select has 170 options (+91 India, +93 Afghanistan, +355 Albania ... +263 Zimbabwe). The signup forms (/signup, /signup?role=intern, /signup?role=employer, /employer/signup) also have 170. No other marketing page has a phone field. | docs/qa/b/screens/bs7mk-contact-1440-s0.png |
| NC | 10 | PASS | Same evidence as S1-r14. | docs/qa/b/screens/bs7mk-interns-1440-s2.png |
| NC | 11 | PASS | /employers (and /pricing, /): all mailto and visible addresses are `admin@findtern.in`; 0 `communicate@` in visible text. | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC | 12 | PASS | Anchor exists (`H3` "5.1 For Interns"); lands under the sticky header with the heading text visible at 1440 and 375. Numbered sub-headings 5.1 / 5.2 / 6.1 / 6.2 in accent colour, bullets indented, "Interns:" labels grouped. Heading box top is 60 px vs header bottom 65 px at 1440 (tight, text still visible). | docs/qa/b/screens/bs7mk-terms-anchor-landing-1440.png |
| NC | 13 | PASS | Measured all 16 numbered headings: level 1 = H2 at left edge (19 px), level 2 = H3 indented 20 px (16 px), identical at 1440 and 375; side TOC indents the 2.1 / 2.2 entries too. (TOC omits 7.1 although the body has "7.1 Who Can Access Your Data?": minor.) | docs/qa/b/screens/bs7mk-intern-terms-and-conditions-1440-s0.png |
| NC | 14 | PASS | LEGAL links y-pitch 44 px between every pair at 1440, 1024, 768 and 375; each label one line (label is now "Non-Bypass Agreement"). | docs/qa/b/screens/bs7mk-footer-bottom-home-375.png |
| NC | 15 | N/A | Section header "INTERNS ACCOUNT". |  |
| NC | 16 | UNCLEAR | Google "redirect_uri_mismatch" on the Vercel staging is configuration (owner's launch list: Google OAuth redirect URI); not testable here (no client id). |  |
| NC | 17 | PASS | Intern signup works end to end locally (OTP, account, onboarding) in Chromium and WebKit at 375. Staging itself was not tested. | docs/qa/b/screens/flow-intern-signup-after-375-chromium.png |
| NC | 18 | PASS | Aadhaar card image is required (no "optional" label; empty Continue asks for it). | docs/qa/b/screens/onb-step1-errors-375.png |
| NC | 19 | PASS | See S1-r36. | docs/qa/b/screens/onb-step4-375-chromium.png |
| NC | 20 | PASS | Picking Onsite leaves Remote and Hybrid unselected (aria-checked false); one chip at a time. | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| NC | 21 | PASS | Errors clear once a field is valid (a corrected end year or score removes its message on the next Continue). | docs/qa/b/screens/onb-step2-filled-375-chromium.png |
| NC | 22 | PASS | State and city are dropdowns (37 states; cities follow the state; "Not listed - type it"); bank name is a 65-option dropdown. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC | 23 | PASS | At 1440 the Start year and End year inputs sit on one baseline, equal width. The helper text ("2026 or earlier.") is still under End year only. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| NC | 24 | PASS | Dates are DD/MM/YYYY text with a calendar picker, not native "---------, ----" inputs. | docs/qa/b/screens/onb-step3-375-chromium.png |
| NC | 25 | UNCLEAR | "Bank account details asked on the About page only": see S1-r46 (bank is on step 1, "About you"). | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC | 26 | PASS | Marksheet upload is optional ("Optional - you can add several"). | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| NC | 27 | PASS | Bank name is a dropdown. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC | 28 | PASS | Joining date shown in the offer (see S1-r43). | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| NC | 29 | PASS | /faq and /contact return 200; "Contact Us" and "FAQ" appear in header nav and footer at 1440 and in the mobile menu and footer at 375. | docs/qa/b/screens/bs7mk-mobile-menu-375.png |
| NC | 30 | PASS | Launcher is 141x64 px with the label "Ask me" at every width (source diff shows it was a 56 px icon-only circle on small screens); a prompt bubble "Questions about Findtern? Ask me" (228x53, 15 px text) appears about 3.0 s after load; clicking opens the chat panel (380x585 at 1440, 345x585 at 375). | docs/qa/b/screens/bs7mk-askme-open-375.png |
| NC | 31 | PASS | Marketing header link holds 1 `<img alt="Findtern - Internship Simplified">` (findtern-logo-green.png) and no cap icon + text pair; footer uses findtern-logo-white.png. | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| NC | 32 | PASS | Same evidence as NC-r31 and NC-r2 (56 px high at 1440 when not scrolled). | docs/qa/b/screens/bs7mk-logo-header-1440-2x.png |
| NC | 33 | N/A | Section header "COMPANY". |  |
| NC | 34 | PASS | Same as S1 72 on the company signup page. | docs/qa/b/screens/bs7-emp-google-click-375.png |
| NC | 35 | UNCLEAR | Could not reproduce: four new employer accounts (three India, one UAE) signed up and logged in by API and UI without failure. | - |
| NC | 36 | UNCLEAR | No failure reproduced with an employer, the intern and a second employer signed in at the same time from separate browser contexts. | - |
| NC | 37 | PASS | India: Country is a select (198), State is a select (37), City is a typeahead list ("Jai" -> Jaipur, Jaisalmer). Non-India: State and City are plain text (D5, P2). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| NC | 38 | PASS | Same fields on `/employer/onboarding` and the project sheet (state select + city). Same non-India caveat (D5). | docs/qa/b/screens/bs7-emp-onb1-375.png |
| NC | 39 | PASS | Same evidence as NC-r29. | docs/qa/b/screens/bs7mk-mobile-menu-375.png |
| NC | 40 | PASS | Chat icon is 28 px (`size-7`, was 24 px) inside a 64 px high button with a 12 px notification dot. | docs/qa/b/screens/bs7mk-askme-open-1440.png |
| NC | 41 | PASS | No photo `<img>` on candidates, compare or cart; avatar endpoint 403 for non-hired interns, 200 only after hire. | docs/qa/b/screens/bs7-emp-cand-top-1440.png |

## The 18 unclear rows: what would make each one clear (28 Oct)

Owner questions are one line each in `docs/qa/owner-questions.md` (Q numbers below). "Legacy" means `/home/wynautbhav/FindTern`, read only.

| sheet | row | status now | what would make it clear |
|---|---|---|---|
| S1 | 4 | UNCLEAR | A product decision: the sheet says steps 3 and 6 "need to be changed" with no new text; the legacy has no such section, so there is nothing to compare. Q1. |
| S1 | 25 | PASS | Resolved: legacy also has the intro video as optional (photo required). |
| S1 | 41 | FAIL | Resolved by reading: see QA-137. |
| S1 | 45 | FAIL | Resolved by reading: see QA-137; Q10 asks the owner to confirm the reading. |
| S1 | 46 | UNCLEAR | A product decision: legacy strips the bank fields from the onboarding draft (`onboarding.tsx:277`), which is what r46 asks; NC r25 and r27 (later) ask for bank on the About page with a bank-name dropdown, which is what the build does. Q2. |
| S1 | 52 | PASS | Exercised: see the finding. |
| S1 | 60 | UNCLEAR | A repro I could not set up: "Edit profile" opens the wizard at step 1 and the persona has no Aadhaar image on file, so it never reaches the location step (QA-137). Needs an account with all documents uploaded (uploads 404 locally), then: Edit profile, step 4 work preferences, change the cities, save, read /intern/profile. |
| S1 | 63 | PASS | Resolved by reading; confirm once with a live AI-interview provider link. |
| S1 | 86 | UNCLEAR | A product decision: "proposal need to be change" names no screen and no change. Q3. |
| S1 | 93 | PASS | Answered by the 3-location decision. |
| S1 | 97 | UNCLEAR | A product decision: the build lists every skill (a synthetic 68-skill candidate shows all 68). Q4. |
| S1 | 100 | PASS | Resolved by structure (see the row); Q7 asks whether pixel parity is wanted. |
| S1 | 110 | UNCLEAR | A product decision and a reference: the filter set matches legacy, the design cannot be compared without a reference image (the old screenshots are stale by the owner's note). Q5. |
| S1 | 111 | UNCLEAR | A product decision: which part of the quick view should change. Q6. |
| NC | 16 | UNCLEAR | Configuration, not code: the Google authorised redirect URI for the staging and production hosts. Needs a Google client id to test. Q8. |
| NC | 25 | UNCLEAR | Same as S1 r46. Q2. |
| NC | 35 | UNCLEAR | A repro I could not set up: not reproducible with four new accounts one at a time. Likely cause found, QA-138 (a shared address trips the per-address limits). Needs the message the owner saw and the network. Q9. |
| NC | 36 | UNCLEAR | Same as NC r35: several emails signing in together from one place is exactly what QA-138 blocks; I could not reproduce it from separate browser contexts because each carried its own address. Q9. |
