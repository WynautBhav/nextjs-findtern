# Bug sheet 9: results on staging (2 Nov 2026)

Source: `Findtern New - Bugs(9).xlsx` (5 tabs: Sheet1 135 rows, Sheet2, NEW CHANGES, Sheet4, 30 OCT).
Rows that were already in sheet 7 were judged on 28 Oct (`bug-sheet-7-results.md`, local build, 153 PASS); this pass covers the rows that are new in sheet 9 and the areas Vaibhav named: employer payment, invoice, full-time, timezone, proposal.

Build under test: https://nextjs-findtern.vercel.app, `master` at 976e8c8. Real Chrome (Chromium channel), Firefox and Playwright WebKit, fresh `+ftqa` accounts, test-pay button only (real Razorpay never pressed). Run script: `e2e/staging-journey.e2e.mjs`; copy and crawler-file rows: `e2e/bugsheet9-public.mjs`.

## What the run exercised (new in this pass)

A second company in the United States, two more candidates (score 8 and score 4, the free band), on top of the Indian company journey.

| Area | Result |
|---|---|
| Employer payment, upfront with promo and monthly, test button | Chrome and Firefox PASS (Chrome after one headless re-run; see "Network stalls") |
| Tax invoice: IGST (Karnataka, Maharashtra) and CGST+SGST (Rajasthan), totals equal what was charged, dated in India time | Chrome and Firefox PASS |
| US company: onboarding shows "Your timezone: America/New_York", checkout in dollars, no GST, USD invoice | Chrome PASS |
| Full-time offer, rupees | Chrome PASS, Firefox accept click stalled (see below) |
| Full-time offer, dollars: refused until International FTE is approved, apply, admin approves, send, accept | Refusal, apply, approve, send PASS in Chrome; accept confirmed by direct call (200 in 3 s), the in-browser click stalled twice |
| Interview booking default times: next quarter hour, then +1 h and +2 h, in the company's timezone | PASS (Chrome, Firefox) |
| New York time stored as exact UTC (DST included), intern reads it in IST with "converted from the company's New York time" | PASS (Chrome, Firefox) |
| DST in the offer form: 9-6 New York reads 7:30 pm in winter and 6:30 pm in summer | PASS |
| Offer held until the meeting happened ("Meeting first" card, no form); Mark completed; Mark missed then feedback | PASS |
| Offer composer: calendar button, no flexible hours, hours from the working week (160 h Mon-Fri, 192 h Mon-Sat with 2 days leave), past date refused with a reason, goes to the proposals list after sending | PASS |
| Intern reads the offer: IST hours, joining date, stipend is half in rupees, the employer's extra note, countdown | PASS |
| Free-band candidate: remote only (form and both API routes), shows "Free", edit before acceptance, withdraw after acceptance | PASS (Chrome, Firefox) |

## New rows of sheet 9

PASS = works on staging. DONE = was missing, built and tested in this pass. OPEN = not changed, needs a decision or is not testable here.

| Tab | Row | Item | Verdict | Evidence |
|---|---|---|---|---|
| Sheet2 | 2 | Booking takes current time rounded up (12:34 gives 12:45, 1:45, 2:45) | PASS | cart form default slots, New York time |
| Sheet2 | 3, 33 | Employer's timezone set automatically at profile, scheduling and offer | PASS | onboarding line, meeting form and composer all New York |
| Sheet2 | 7 | Employer's slot shown to the intern in IST, DST | PASS | UTC stored exactly, intern page reads IST |
| Sheet2 | 34 | DST applied in the offer | PASS | winter vs summer preview differ by one hour |
| Sheet2 | 8 | Billable days from the calendar (25 not 26 for Mon-Sat) | OPEN | contradicts the owner decision of 28 Oct in `offer.ts` (flat 22 / 26 days); the sheet marks it Done |
| Sheet2 | 9 | After sending an offer, go to the proposals page | PASS | |
| Sheet2 | 10 | Offer blocked until the interview is done | PASS | "Meeting first" card |
| Sheet2 | 14, 15, 16 | Separate Book meeting button, join from cart, mark interview completed | PASS | Book meeting and Mark completed exercised; join button is in the code, not clicked (no meeting link on staging) |
| Sheet2 | 23 | Promo then create profile shows "insufficient role" | PASS | promo then test pay worked without a refresh in 3 browsers; the 500 behind the 30 Oct "free code error" was the order-id column (migration 0009) |
| Sheet2 | 26 | Remove copy and download in Records | OPEN | still there; 30 Oct tab asks what they are for, so it needs an answer first |
| Sheet2 | 27 | Candidate off open-to-work: mark them in the cart, do not drop them | OPEN | the cart hides them (`employer/cart/page.tsx` filters by `visibleInternIds`); a feature, not built |
| Sheet2 | 30, 3 (Sheet4), 18 (30 OCT) | Calendar in the start date | DONE | button on every employer date field |
| Sheet2 | 31, 19 (30 OCT) | Free candidate can only be offered remote work | DONE | free band (score under 6) is remote only |
| Sheet2 | 35 | Additional information visible to both sides | PASS | |
| Sheet2 | 38, 2 (30 OCT) | Countdown for the intern ("3 days left", "45 min left") | DONE | counts to the start of the joining day in India, when the offer closes |
| 30 OCT | 4 | View password on sign-up | DONE | sign-up, employer sign-up, reset |
| 30 OCT | 9 | "My college isn&apos;t listed" showed a raw entity | DONE | |
| 30 OCT | 10 | Feedback with line breaks not visible to the intern | DONE | the intern saw only the first line; now whole, with breaks |
| 30 OCT | 16 | Phone codes: more countries | PASS | 170 prefixes on sign-up |
| 30 OCT | 17 | Mark candidate missed | PASS | status becomes missed, feedback still allowed |
| 30 OCT | 20 | Remove flexible hours | DONE | composer and edit form |
| 30 OCT | 22 | Campus drive page removed from the employer | OPEN | still in the employer menu; removing it is a product decision |
| 30 OCT | 7 | Unique code on the college page | OPEN | unclear what is wanted |
| 30 OCT | 21 | Restore the profile's skills in the candidates filter | not tested | |
| Sheet4 | 2 | Sometimes codes not working | not reproduced | OTP worked in every run; no pattern found |
| Sheet4 | 5 | International cities for employers | PASS | free-text state and city outside India |
| Sheet4 | 6, 7 | LinkedIn mandatory, Aadhaar mandatory | OPEN | LinkedIn contradicts the earlier "not mandatory"; Aadhaar number is required, the card image optional |
| NEW CHANGES | 7 | Offers turned down more than 3 times lose the refund | partly | on the guarantee page and in the offer card, not in the intern legal terms |
| NEW CHANGES | 16-17 | Google sign-in | OPEN | stays off until the real domain; the screenshot is `redirect_uri_mismatch` |

## Bugs found and fixed in this pass (not on the sheet)

- The intern's timeline and record printed the whole interview notes field, including staff text and AI-interview links; they now show only the company's feedback.
- An admin could forge company feedback through a link field or free text with a lone CR or U+2028; links are one-line URLs, line breaks are normalised, the tag only counts at the start of a line (reader, merge, once-only guard in JS and SQL, reminder scheduler).
- The admin meeting-link save could overwrite feedback the employer left in between; it is now conditional on the notes and status it read.
- The admin Edit buttons and the daily-volume bars read out words that did not contain what is printed on them (WCAG 2.5.3).
- A past start date said "A start date is required"; it now says what to do.

## Still open from the reviewers (not fixed)

- Offers sent before this change as hybrid or on-site to free-band candidates can still be edited and accepted at the free rate.
- The free-band test uses the fixed score bands; if an admin changes plan prices or ranges, "remote only" and "costs nothing" can disagree. Base it on the resolved rate.
- Old interview rows that have admin `feedback:` or `recording:` lines after `feedback_text:` now read those lines as part of the employer's feedback. Check production rows before launch.
- The employer feedback save has the same read-then-write race in the other direction (it can overwrite an admin's link save).
- `ai-interview-links.ts` and the incruiter webhook still scan or append notes without the feedback boundary (AI interviews only).

## Network stalls (test machine, not the app)

On this machine browsers reach Vercel through NAT64. Roughly one request in ten stalls for 30 to 60 s in Chrome, Firefox and WebKit, while curl is fast (a US payment took 4 s by curl and more than 30 s from a browser). With HTTP/3 switched off (`E2E_NO_QUIC=1`) Firefox's payments went from 55 s to 9 s and a page that used to stall completed, so HTTP/3 over NAT64 is the likely cause, but a few drops remained. Treat a failure that is only a timeout or `NetworkError` as unproven, not as an app bug.

## Not checked

Real Razorpay, Google sign-in, email arriving in an inbox, real Safari (Playwright WebKit stands in; its home-page video crash remains), college drive and Meet flows, a real week passing (schedulers), concurrent users.
