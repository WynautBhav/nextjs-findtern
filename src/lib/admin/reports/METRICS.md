# Reports tabs: metric definitions

All days, weeks and months are **India time** (Asia/Kolkata). Weeks start **Monday** (same as Postgres `date_trunc('week')`).
Timestamps in the database are UTC clock time without a zone; every bucket is `date_trunc(unit, col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')`
(`window-sql.ts`). A window is `col >= since AND col < until`. Previous window = same length ending at the same clock time (`window.ts` `prevUntil`).

URL: `?tab=overview|interns|employers|finance&range=today|week|month|all` (legacy `period=30d`, `from`/`to` still honoured). Default: month to date.

Excluded everywhere: test employers (`admin`, the AI-interview employer) via `realEmployers()` / `realEmployerId()`.
Not excludable: test interns (no flag on `users`; see report open items). Banned and admin-hidden interns are counted and labelled.

## Overview
| Metric | Definition | Source |
|---|---|---|
| New interns | `users.role='intern'`, `created_at` in window | users |
| New employers | real employers, `created_at` in window | employers |
| Interns who paid | distinct interns with a `paid` fee > 0, not `college_drive`, at `coalesce(paid_at, created_at)` | intern_payments |
| Employers who paid | distinct real employers with a settled order > 0 (paid / refunded / partially refunded) | employer_payments |
| Today / week / month | always these three, whatever the range | same |
| Growth % | `(cur - prev) / prev`; zero baseline = "New"; no baseline (all time) = none; to zero = −100% | `growth.ts` |
| Intern cohort | of interns who signed up in the window: profile complete, applied, hired, paid (`feePaidSql`); each on its own | intern_onboarding, proposals, payments |
| Employer cohort | of employers who joined in the window: setup done, posted a project, sent a (non-draft) proposal, paid an order | employers, projects, proposals |
| Where interns come from | college membership, promo code used, account type. No UTM / referrer column exists. | college_memberships, promo_code_usages, intern_onboarding.extra_data |

## Interns
Stage = furthest step: signed up → profile started → profile complete → fee paid → AI scored → applied → hired (funnel shows "reached at least").
Bands by AI interview score: Espresso < 6, Cappuccino 6 to < 8, Latte ≥ 8, else Unscored. City: SQL `lower/trim` key merged in JS by `city.ts`
(spelling variants such as Jaypur, Bangalore, Poona). College / degree / graduation year: `extra_data->'academics'` (institution, degree, endYear) with flat-key fallbacks.
Applications = non-draft proposals created in the window (and distinct interns). Verified = admin-approved, KYC given, email verified (three counts).

## Employers
Project lifecycle (`lib/projects/lifecycle.ts`): live = published (legacy `active` / blank count as published), paused = paused (`inactive`), draft, pending review, rejected, closed (`archived`), other; plus taken down by admin.
Resumes are not recorded (a pause and a resume only change `status`), so the report says so and shows the current paused count.
Active employer = posted a project or sent a non-draft proposal in the window. Per company: projects now; proposals sent / accepted / rejected / pending / expired (+ withdrawn), interviews, hires, paid (gross, INR, USD at 100) in the window.
Demand vs supply: live projects asking for a skill vs interns holding it (normalised key `lower`, only `a-z0-9+#`); highest-paying skills reuse `analytics`.

## Finance
Reuses the Money in/out layer: a payment's moment is `coalesce(paid_at, created_at)`; collected = settled orders + paid intern fees (not `college_drive`) + college seat sales, gross of refunds;
USD at ₹100 per $1; GST = 18% inside INR amounts (none on USD); refunds are those dated in the window; waived (`promo_full_waiver`, legacy `free` gateway with a promo code, zero-amount coded order)
is its own figure and never in collected. Payouts: `intern_payouts` by kind and status.
