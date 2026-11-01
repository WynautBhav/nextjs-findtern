# Full journey QA: employer + intern (1 Nov 2026)

Two sonnet testers ran the whole employer and intern journeys on the local DB (Chromium 1280/375, WebKit spot checks), with the new **Complete test payment** button (`PAYMENTS_TEST_BUTTON=1`) next to free mode (`PAYMENTS_MODE=free`). Findings are deduped against `bug-ledger.md`. Repro scripts live in the job's scratch folders (`qa-employer/`, `qa-intern/`), outside the repo.

**Totals:** P0 0 · **P1 7** · P2 13 · P3 19.

## The pattern behind most P1s: no concurrency guard

Every "check, then insert" write accepts parallel duplicates. A double submit or two tabs produce:

| # | Action | Result | Where |
|---|---|---|---|
| E-B01 | Employer pay (test button / free mode settle instantly) | one hire paid 3×, 3 invoices | `api/employer/[id]/payment/razorpay/order/route.ts:55-78` → insert `:127/:143` |
| E-B02 | One-time promo across two parallel orders | both discounted (bypasses QA-206) | same route |
| E-B03 | Send proposal | 3 live offers to one candidate | `api/.../proposals/route.ts:126-146` → `:231` |
| E-B04 | Full-time offer | 3 offers; `offerLetterKey` only prefix-checked | full-time-offer route |
| E-B05 | Request interview | 3 pending interviews | interviews route |
| I-B3 (P2) | Intern activation (test, free, 100% promo) | 3 paid rows, invoices, notifications; no unique index on `intern_payments.order_id` | `api/intern/[id]/payment/razorpay/order/route.ts` |
| I-B5 (P2) | First uploads in parallel | several `intern_document` rows → photo/PAN show missing | uploads route |

**One fix shape for all of them:** `pg_advisory_xact_lock` on (account, target) around check + insert, the way QA-202 (`college/meetings.ts`) and the timesheet route already do. Add a unique index where the row has a natural key (`intern_payments` per paid intern, `intern_document.user_id`).

## Employer

### P1
- E-B01..B05: see the table above.

### P2
- E-B06 Orders "paid" totals use list prices, not the amount charged (₹3,96,400 shown vs ₹2,90,640) — `lib/dues.ts:115`.
- E-B07 Proposal start date accepts `2026-13-45` and `9999-12-31`; the offer page shows "Starts 2026-13-45".
- E-B08 GSTIN not validated server-side; its first two digits choose CGST+SGST vs IGST on invoices.
- E-B09 Company profile and project routes have no length or value checks (200,000-char company name and country "Atlantis" saved).
- E-B10 Proposal route stores an invalid timezone, a reversed shift and a junk laptop value.
- E-B11 Timesheet review weekly hours total 184 against a headline of 40 — `timesheet-review.tsx:61`.
- E-B12 Dashboard says "18 awaiting a reply", Proposals says 16 (lapsed offers counted) — `employer/dashboard/page.tsx:88`.
- E-B13 Employer signup accepts personal mailboxes outside a 14-domain list (ymail, googlemail…).

### P3
- E-B14 Whitespace-only name or company name passes signup.
- E-B15 An over-long role title or description returns a raw zod message after the 9 s policy read.
- E-B16 `?q=%00` empties the whole candidate pool.
- E-B17 Shortlisting into a closed project is allowed.
- E-B18 An interview can be requested for a hired candidate, 1 minute ahead, or at `25:00`.
- E-B19 Esc on the policy dialog drops focus to `<body>`.
- E-B20 Signup OTP: Resend is enabled during the cool-down, and a reload loses the form.
- E-B21 A timesheet reason over 1,000 characters returns "Invalid decision".

### Still reproduces
- QA-102/136 "Ask me" covers the Monthly price and promo Apply at 375 on checkout.
- QA-150 family: unknown or foreign ids return HTTP 200 with a "Page not found" body.

## Intern

### P1
- I-B1 Onboarding follows `firstOpen` until the first Continue. The page jumps ahead mid-typing as soon as a step is valid, skipping Experience, Languages and Activities — `onboarding-form.tsx:164-166`.
- I-B2 Ticking the NDA box on Review jumps back to Step 1 (same cause).

### P2
- I-B3, I-B5: see the table above.
- I-B4 A 100%-promo activation sends no "Profile activated" notification or email, records gateway `razorpay`, and does not store the discount (the full-discount branch skips `settleInternOrder`).
- I-B6 The AI-interview card poll is a GET without a CSRF token, gets 403 forever (`apply/route.ts:63`), and "link on its way" never updates.
- I-B7 Accepting one offer expires other companies' open offers while the dialog says "from this company".

### P3
- I-B8 Input typed in the first second after load is wiped by the draft restore.
- I-B9 Back after logout shows the cached dashboard.
- I-B10 The reset-password page prints the raw token.
- I-B11 A weak password at reset gives "Invalid input".
- I-B12 After 5 wrong OTPs the message still says "check the digits".
- I-B13 The signup API accepts blank names, 300-char names and the country code `+9999`.
- I-B14 Offline payment shows "Failed to fetch"; amounts render as "₹1,249.5".
- I-B15 Unknown proposal or opportunity ids return HTTP 200 (QA-150 family).
- I-B16 Timesheets are last-write-wins across tabs; future days count as worked.
- I-B17 Skills have no length limit.
- I-B18 Employer-only promo codes are offered to interns (audience scoping).
- I-B19 A 40-digit bank account number is silently cut to 18 digits.

## Edge cases not satisfied (summary)
| Case | Where | What happens |
|---|---|---|
| Parallel submit / two tabs | pay, promo, proposal, FTE, interview, activation, uploads, timesheets | duplicates or last write wins |
| Malformed dates, huge text, junk enum values | profile, projects, offers, skills, signup | saved as sent |
| GSTIN state prefix | employer profile | changes the invoice tax split |
| Wrong vs expired vs burnt OTP | signup (both) | one generic message; resend not throttled in the UI |
| Reload mid-signup | signup (both) | everything typed is lost |
| Unknown or foreign id | employer + intern pages | HTTP 200 with a 404 body |
| Typing during load | onboarding | wiped by the draft restore |

## What held
- Other employers' ids: 403 or 404 on every route and verb tried.
- Sequential double pay refused; a single UI double click sends one request.
- Offline and slow paths give clear messages (except I-B14).
- No horizontal overflow in Chromium or WebKit.
- The test button settles at the real amount with an invoice number and the hire (the 403 when the flag is off is in code, not exercised).

## Not covered
Real Razorpay (no keys); college drive flows (drive tokens are hashed; the server went down before the intern tester reached them); AI interview ready/scored states; earnings and documents with data; a full keyboard-only pass; WebKit beyond signup and the layout sweep; Google login.

## Local test data left behind
- Employer: hires Arnav, Tara, Avani, Sneha; Aishwarya month 3 paid; Meera's timesheet approved; 8 pending interviews (no cancel route); accounts `qa.sig.ymailcom@ymail.com`, `qa.otpui4@qa-signup-co.com`, `qa.wk1@qa-signup-co.com`.
- Intern: about 20 `qa.intern.*@gmail.com` accounts; invoice numbers 0004–0006 and 0011–0018 used by the race tests.
- Direct DB edits were restored by both testers (promo codes deleted, project name back; its `updated_at` is now 31 Oct).

## Fixed the same day (1 Nov, afternoon)

Proved with `node e2e/pay-race.mjs` (three simultaneous requests each: one success, two 409, one row) and the 19-step `npm run e2e`.

| Finding | What changed |
|---|---|
| E-B01, E-B02, I-B3 | Employer and intern order routes check and insert under `withLock` (`src/lib/advisory-lock.ts`); the employer route re-verifies under the lock that each line is still owed. A Razorpay checkout already open for an intern is handed back, not duplicated. |
| E-B03, E-B04, E-B05 | Proposal, full-time offer and interview request check and insert under the same lock. |
| I-B4 | The 100%-promo activation settles through `settleInternOrder` (notification, promo use, discount stored). |
| I-B1, I-B2 | Onboarding pins the step on screen at the first change (`pinStep`); checked in Chromium. |
| E-B06 | `placementLedger` takes a promo off both total and paid (single-hire orders). |
| E-B07, E-B10 | Start date must be a real day within a year; shift times valid or both "flexible"; timezone and laptop validated. |
| E-B08 | GSTIN format and state code checked when entered or changed. |
| I-B6 | `csrfFetch` sends the token on GET, so the AI-interview poll stops getting 403. |
| I-B7 | Accept dialog now says offers from any company close. |
| Security | A company could name another file as its logo and make it public (`/api/files/legacy` matched on file name only); now an exact path match. Signup locks namespaced; settle failures close their `created` row; college call requests no longer hold a connection across the Google call. |

Not changed on purpose: timesheet delete-while-submitted and employer edits before approval (documented legacy rules, INW-18 / EMH-45); I-B8 (not reproducible from the code); the P3s above. Not tested: real Razorpay, the Razorpay-order reuse path (no keys), the in-lock "already paid" branch (cannot be forced over HTTP).
