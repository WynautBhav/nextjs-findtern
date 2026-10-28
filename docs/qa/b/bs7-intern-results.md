# Bug sheet 7: intern, structural and conflicting rows, tester B

Build: production build of `release/master-merge` @ 733c683, LIVE-COPY database, Chromium 375 and 1440 px (WebKit 375 for the signup, onboarding, offer and accept legs). Scripts in `docs/qa/b/repro/` (`flow-intern-signup.mjs`, `onb-walk.mjs`, `intern-offer.mjs`, `intern-accept.mjs`, `bs7-intern-misc.mjs`, `bs7-google.mjs`). Verdicts: PASS / FAIL / UNCLEAR (no testable criterion, or rows that contradict each other) / N/A (date or section header).

| sheet-row | verdict | finding | screenshot |
|---|---|---|---|
| S1-r17 | N/A | Date serial header row (46316), not a bug. | |
| S1-r19 | N/A | Empty row. | |
| S1-r20 | N/A | Section header "Intern Page". | |
| S1-r21 | PASS | `/login` and `/signup` both carry a Google button (`/api/auth/google/start?role=intern`). The OAuth round trip cannot run here (no client id). | |
| S1-r22 | PASS | Onboarding step 1: empty Continue says "Aadhaar number is required.", "PAN is required for stipend payouts.", "Upload a photo or scan of your Aadhaar card.", "Upload a photo or scan of your PAN card." | docs/qa/b/screens/onb-step1-errors-375.png |
| S1-r23 | PASS | "Your mobile number" and "Emergency contact number" are two separate fields. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1-r24 | PASS | Mobile number is pre-filled (+91 and the signup number) and read-only with "To change it, go to Settings". | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1-r25 | UNCLEAR | Query row. Intro video exists as "Intro video (optional)", 30 to 60 s, MP4/WebM/MOV up to 50 MB. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1-r26 | PASS | Academics level list: Diploma, Bachelor's, Master's, Ph.D. No "High school". | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r27 | PASS | Open roles list and detail show no company name ("Company shared after hire"). | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S1-r28 | PASS | After submitting the profile the dashboard shows "1 of 3 done": profile, then the one-time activation, then the AI interview. | docs/qa/b/screens/intern-activated-dashboard-375.png |
| S1-r29 | PASS | Degree becomes a dropdown (BA, B.Com, BBA, BMS, BSc, B.Tech, BCA, MBBS, ...) once a level is chosen. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r30 | PASS | Start year and End year fields; "Completed" with end year 2031 gives "You marked this as completed, so the end year cannot be after 2026." | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r31 | PASS | CGPA 11 gives "CGPA is out of 10"; percentage 101 gives "Percentage cannot be more than 100." | docs/qa/b/screens/onb-step2-filled-375-chromium.png |
| S1-r32 | PASS | Academics has "Professional courses" (CA, CS, CMA, CFA, Other) and "Certifications" sections. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r33 | PASS | Experience row has an "I currently work here" checkbox; its label is 170 x 44 px at 375 (the box itself is 18 px). Visual polish not judged beyond that. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1-r34 | PASS | Start and End date fields take DD/MM/YYYY and have an "Open calendar" button. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1-r35 | PASS | An experience row with nothing filled lists errors for type, role, company, start date, end date (or "currently work here") and description. | docs/qa/b/screens/onb-step3-375-chromium.png |
| S1-r36 | PASS | Skill suggestions mix technical and non-technical (React, Node.js, SQL, Marketing, Digital Marketing, Content Writing, Sales, Recruitment, Finance, Accounting). | docs/qa/b/screens/onb-step4-375-chromium.png |
| S1-r37 | PASS | Each language row has Read, Write and Speak checkboxes and a level. | docs/qa/b/screens/onb-step5-375-chromium.png |
| S1-r38 | PASS | Single pick among Remote / Hybrid / Onsite ("Pick the most on-site option you can do"); the intern profile of the hired persona reads "Hybrid, and open to remote". | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| S1-r39 | PASS | Onsite or Hybrid without a city: "Add at least one city you can work from (up to 5) for onsite or hybrid work." Field "Add a city (0 of 5)". | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| S1-r40 | PASS | Review > Submit profile (double-clicked) lands on /intern/dashboard in Chromium and WebKit; the button is gone, no double submit. A failed submit (409 on a duplicate Aadhaar or emergency number) returns to step 1 with the message. | docs/qa/b/screens/onb-step8-375-chromium.png |
| S1-r41 | UNCLEAR | No percentage "profile completion bar" on the dashboard any more; a "(done)" checklist is on /intern/profile. The row asks for a PAN document in that bar and the checklist text does not name it. | docs/qa/b/screens/bs7-intern-profile-1440.png |
| S1-r42 | PASS | An offer for a monthly amount of 26,400 shows the intern "Stipend ₹13,200 / month" (half). | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1-r43 | PASS | Joining date "06/11/2026" is on the offer card, list and details. | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1-r44 | N/A | Date serial header row (46316). | |
| S1-r45 | UNCLEAR | Says the Aadhaar image is NOT mandatory; contradicts r22 and NC-r18 (mandatory). Current build: mandatory (later rows win). | docs/qa/b/screens/onb-step1-errors-375.png |
| S1-r46 | UNCLEAR | "Bank account should not be there" conflicts with NC-r25 and NC-r27 (bank asked on the About page, with a bank-name dropdown). Current build: a bank block on step 1, labelled "Optional now - but once you start, fill in every field". | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1-r47 | PASS | Reads as "only the emergency number is required": one emergency number field, required. | docs/qa/b/screens/onb-step1-errors-375.png |
| S1-r48 | PASS | LinkedIn profile is marked optional. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| S1-r49 | PASS | Certification dates are DD/MM/YYYY with a calendar (no "year" question). | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r50 | PASS | Skills step has an "Important note" explaining the self-rating sets the AI interview difficulty. | docs/qa/b/screens/onb-step4-375-chromium.png |
| S1-r51 | PASS | Conflicts with NC-r20 (only the picked chip looks selected); the owner decision is single pick with the implied set stored. Only one chip is selected at a time and the profile shows "Hybrid, and open to remote". | docs/qa/b/screens/onb-step7-Hybrid-375-chromium.png |
| S1-r52 | UNCLEAR | A question ("where does this query show"). Admin has a Messages inbox (nav item, 64 entries on the LIVE-COPY); the intern-side submission was not exercised. | |
| S1-r53 | PASS | "If you do nothing, the offer stays open until the day before the joining date (6 Nov 2026). On the joining date it closes and is marked as rejected." | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| S1-r54 | N/A | Date serial header row (46317). | |
| S1-r55 | PASS | After accepting, /intern/timesheets says "Timesheets open once the company pays ... logging hours opens as soon as the company completes the payment". The hired persona has timesheets. | docs/qa/b/screens/intern-accepted-375-chromium.png |
| S1-r56 | N/A | Date serial header row (46318). | |
| S1-r57 | PASS | Only one emergency phone, no second contact. | docs/qa/b/screens/onb-step1-errors-375.png |
| S1-r58 | PASS | "Specialization (optional)". | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r59 | PASS | Each professional course and certification row has an "Upload certificate" control. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| S1-r60 | UNCLEAR | Editing preferred location after onboarding was not exercised (no edit path found from the profile page in this pass). | |
| S1-r61 | PASS | After "Activate free (test mode)" the dashboard shows "Pay the one-time activation, ₹2,499 (done)" and moves on to the AI interview. | docs/qa/b/screens/intern-activated-dashboard-375.png |
| S1-r62 | PASS | No "Incruiter" text on interviews, dashboard, profile, documents, settings or opportunities. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1-r63 | UNCLEAR | Needs a generated AI-interview link; the interview provider is disabled in this environment. No "Hidden company" text appears on the interviews page. | |
| S1-r64 | PASS | Interviews page shows the intern's name with Findtern Score, Communication, Coding, Aptitude, AI Interview (all /10). | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1-r65 | PASS | Dashboard and timesheets say logging hours opens once the company completes payment (see r55). | docs/qa/b/screens/intern-accepted-375-chromium.png |
| S1-r66 | N/A | Date serial header row (46321). | |
| S1-r67 | PASS | Same as r27: no company name on the open roles list or detail. | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S1-r68 | N/A | Date serial header row (46322). | |
| S1-r69 | PASS | No "none of these work, ask for a new one" control on the interviews page (booked state). The pending-slots state was not available to exercise. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| S1-r70 | N/A | Empty row. | |
| S1-r71 | N/A | Section header "Company". | |
| S1-r90, r102, r109, r120 | N/A | Date serial header rows (46316, 46317, 46318, 46321). | |
| S2-r5 | PASS | Same as S1-r27. | docs/qa/b/screens/bs7-intern-opportunities-1440.png |
| S2-r6 | PASS | Same as S1-r69. | docs/qa/b/screens/bs7-intern-interviews-1440.png |
| NC-r15 | N/A | Section header "INTERNS ACCOUNT". | |
| NC-r16 | UNCLEAR | Google "redirect_uri_mismatch" on the Vercel staging is configuration (owner's launch list: Google OAuth redirect URI); not testable here (no client id). | |
| NC-r17 | PASS | Intern signup works end to end locally (OTP, account, onboarding) in Chromium and WebKit at 375. Staging itself was not tested. | docs/qa/b/screens/flow-intern-signup-after-375-chromium.png |
| NC-r18 | PASS | Aadhaar card image is required (no "optional" label; empty Continue asks for it). | docs/qa/b/screens/onb-step1-errors-375.png |
| NC-r19 | PASS | See S1-r36. | docs/qa/b/screens/onb-step4-375-chromium.png |
| NC-r20 | PASS | Picking Onsite leaves Remote and Hybrid unselected (aria-checked false); one chip at a time. | docs/qa/b/screens/onb-step7-Onsite-375-chromium.png |
| NC-r21 | PASS | Errors clear once a field is valid (a corrected end year or score removes its message on the next Continue). | docs/qa/b/screens/onb-step2-filled-375-chromium.png |
| NC-r22 | PASS | State and city are dropdowns (37 states; cities follow the state; "Not listed - type it"); bank name is a 65-option dropdown. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC-r23 | PASS | At 1440 the Start year and End year inputs sit on one baseline, equal width. The helper text ("2026 or earlier.") is still under End year only. | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| NC-r24 | PASS | Dates are DD/MM/YYYY text with a calendar picker, not native "---------, ----" inputs. | docs/qa/b/screens/onb-step3-375-chromium.png |
| NC-r25 | UNCLEAR | "Bank account details asked on the About page only": see S1-r46 (bank is on step 1, "About you"). | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC-r26 | PASS | Marksheet upload is optional ("Optional - you can add several"). | docs/qa/b/screens/onb-step2-filled-1440-chromium.png |
| NC-r27 | PASS | Bank name is a dropdown. | docs/qa/b/screens/inspect-intern--intern-onboarding-375.png |
| NC-r28 | PASS | Joining date shown in the offer (see S1-r43). | docs/qa/b/screens/intern-offer-detail-375-chromium.png |
| NC-r33 | N/A | Section header "COMPANY". | |
