# Go-live checklist: moving findtern.in to the new app

Written 2 Nov 2026 from the staging test run (see "What was tested" at the end).
Each line says what to do, why, and how to prove it. Tick them in the tracker page.
Nothing here has been done on production: staging only.

## A. Blockers: do not switch DNS until every one of these is done

| # | Do this | Why | Prove it |
|---|---------|-----|----------|
| A1 | **Remove the test payment button.** Unset `PAYMENTS_TEST_BUTTON` on the server **and** delete the code: `testPayEnabled()` in `src/lib/razorpay.ts` (+ its cases in `src/lib/origin.test.ts`), the "Test: mark as paid" buttons in `components/payments/checkout-pay.tsx` and `components/intern/activation-card.tsx`, the `testPay` branches in both `payment/razorpay/order` routes, and the `testPay` steps in `e2e/staging-journey.e2e.mjs`. | It settles an order with no money moving and burns a GST invoice number. It is already switched off by code on the real domain, but it must not ship. | `grep -ri testPay src` is empty. `SELECT count(*) FROM employer_payments WHERE gateway='test'` and the same for `intern_payments` are 0 on the live DB. (Runbook P7.) |
| A2 | **Take one real, small payment and confirm it is captured.** The app now sends `payment_capture: 1` on every order. | Legacy did; the first new app version did not. On a "manual capture" dashboard setting a paid hire would stay *authorized* and be refunded about 5 days later. | Razorpay dashboard shows the payment as **Captured**, not Authorized. Then refund it. |
| A3 | **Decide Google sign-in.** 257 of 442 interns signed up through Google and hold a random password. With Google off they can only get in through "Forgot password". Either (a) switch `GOOGLE_LOGIN=on` after registering `https://findtern.in/auth/google/callback` in the Google Cloud console and verifying the domain in Search Console, or (b) email them a reset link before cutover. | 58% of interns would otherwise be locked out on day one. Google sign-in was **not tested** (no credentials on staging). | Sign in with a Google account that already exists in the live data; land on the right dashboard. |
| A4 | **Run the migrations on the live database, after a backup.** `0006`, `0007` (two files), `0008` (needs the `pg_trgm` extension, a contrib package), `0009` (`promo_code_usages.order_id` to `text`). Rehearse on a fresh copy first. | `0009` fixes a real bug: any promo-code payment with a test, free or fully discounted order id failed with "value too long for type character varying(36)" and returned HTTP 500. `0008` was never rehearsed before this week. | `npm run db:migrate` prints each file as applied; a second run changes nothing; `npm run db:verify` passes. |
| A5 | **Production environment, complete.** Required: `DATABASE_URL`, `SESSION_SECRET`, `SIGNING_SECRET`, **`PUBLIC_ORIGIN=https://findtern.in`** (the app now refuses to build links without it instead of mailing `localhost`), `SMTP_*` and `MAIL_MODE=send`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` (live), `SCHEDULERS=on` on one long-lived process, `TRUST_PROXY=1` behind nginx. Invoice seller: `FINDTERN_LEGAL_NAME`, `FINDTERN_GSTIN`, `FINDTERN_BILLING_ADDRESS`, `FINDTERN_BILLING_EMAIL`, `FINDTERN_BANK_NAME/ACCOUNT/IFSC` (defaults exist; confirm they are the real ones). Analytics ids: `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID` (do not reuse staging's). | A missing one fails quietly or at first use. The startup log prints what is missing. | Boot log shows no `[startup] Missing production env`. |
| A6 | **Make sure these are NOT set on production:** `PAYMENTS_MODE=free`, `PAYMENTS_TEST_BUTTON`, `RATE_LIMIT_BYPASS_IPS`, `OTP_DEBUG`. | Free mode completes checkout at no charge. The bypass list exempts addresses from every rate limit except OTP guessing. | `printenv` on the server shows none. |
| A7 | **Close the database to the internet** (SYS-16: `147.93.27.44:5432` accepts connections from anywhere) and **rotate the secrets in the repo `.env`** (production DB URL, SMTP, Razorpay, Google, DeepSeek). Use `sslmode=verify-full` in `DATABASE_URL`. | Anyone can attempt to connect to the production database; the secrets have been pasted into tools and logs. | `nc -vz 147.93.27.44 5432` from outside the allow-list fails. Old keys no longer work. |
| A8 | **Razorpay webhook** pointed at the new domain, with its secret. | Payments that complete after the customer closes the tab are settled by the webhook. | A test-mode event shows a 200 in the Razorpay webhook log. |
| A9 | **Backup and restore test (runbook P5)** and the **legacy argon2 patch (P1)** if a rollback must stay possible. | Rollback is not free: rows written by the new app look wrong to legacy. | A restore from last night's backup boots; legacy accepts an argon2 login. |
| A10 | **DNS cutover plan with a rollback owner and a time.** | Runbook "Accepted risks". | Written down, with a named person. |

## B. Should do before or within the first week

| # | Do this | Why |
|---|---------|-----|
| B1 | **Turn the Content-Security-Policy on.** It is sent report-only now (`next.config.ts`). Load the real site, read the browser console for `[Report Only]` lines, fix the policy, then rename the header to `Content-Security-Policy`. | Report-only protects nothing. The policy allows inline scripts because Next writes hydration data inline; a nonce-based policy is the next step. |
| B2 | **Search Console and Bing Webmaster:** verify the domain, submit `https://findtern.in/sitemap.xml`. | The sitemap, `robots.txt`, `llms.txt` and `/.well-known/security.txt` are served. On the real domain robots allows crawling (staging is `Disallow: /`). |
| B3 | **Email deliverability:** SPF, DKIM and DMARC for the sending domain; send a signup code to a Gmail inbox and read it. | On staging the codes were sent but their arrival in an inbox was **not checked**. Signup depends on it. |
| B4 | **Connect the Findtern Google Calendar** (`CALENDAR_TOKEN_OWNER`) before the first interview or campus drive. | Without it Meet links cannot be made and the admin dashboard shows "Google calendar not connected". Not tested. |
| B5 | **Review the GST invoice with your accountant.** Checked: totals equal what was charged; IGST for other-state buyers, CGST + SGST for Rajasthan (state 08); the promo line; the date in India time. For review: a paid invoice still carries a "Send payments to" bank block (kept from legacy), one SAC (998519) for all lines, and the invoice is printed from the browser (Save as PDF). | A tax document. |
| B6 | **Rotate the shared test passwords** (the admin, employer and candidate passwords pasted into chat) and delete the `+ftqa` test accounts on staging. | They are in chat logs. |
| B7 | **Uploads:** copy the live uploads folder; the new file route refuses `.jfif` names (3 of 4,494 local files). | Those photos would 404. |
| B8 | **Migrated interns see "Visible to employers: not started"** on the dashboard because legacy never saved the Non-Bypass Agreement flag (0 of 317 rows). Decide: backfill, or derive that line from the employer-pool rule. | Support tickets on day one. Payment and visibility to employers are not affected. |
| B9 | **Monitoring:** uptime check, error tracking, log retention. Watch signup latency: two signups on staging stalled for 45 to 79 seconds before succeeding; the cause was not found (reads after idle stayed at 0.5 s). If the app ever runs on a serverless host, set `connectionTimeoutMillis`, `keepAlive` and a pool `error` handler in `src/lib/db/index.ts`. | An unexplained stall. |
| B10 | **Rate limiter is per process, in memory.** Fine for one server; use a shared store if you run several. | Limits reset on restart and are not shared. |
| B11 | **Holidays:** 2027 is in `src/lib/holidays.ts` (DoP&T O.M. dated 16.07.2026). Add 2028 when it is published (the next O.M. is usually July). | Timesheets prefill gazetted holidays. |
| B12 | **Contact address in the interface:** `communicate@findtern.in` appears as text in about 15 UI strings and in the legal and FAQ content. Server messages use `SITE` in `src/lib/content/site.ts`. If the address changes, update both. | Copy, not configuration. |

## C. Known small items (not blockers)

- The employer send-code step accepts a personal mailbox (`someone@gmail.com`) and emails it a code; sign-up rejects it afterwards. Check at send time.
- Paying a hire that is already paid answers "Nothing payable in this currency", which reads as a currency error.
- The unified `/login` opens on the Intern tab; a company user sees "Wrong email or password. If this is a company account, switch to Company above." `/login?as=employer` selects Company directly.
- Fields typed into a server-rendered form before React takes over can be wiped (first name on signup; the promo code box keeps its text but the Apply button stays disabled). Only on a slow device, and only when typing in the first second.
- Interns can delete a submitted timesheet, and employers can edit timesheet days before approving. Both are legacy rules kept on purpose.

## D. What was tested on staging (nextjs-findtern.vercel.app), and what was not

See the final report. In short: new accounts only; the real **Pay** button was never pressed (the key is live); Google sign-in, real Razorpay, email arrival in an inbox, the college drive flows and a real Safari were **not** tested.
