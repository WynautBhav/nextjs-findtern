# Parity Audit — nextjs-findtern vs legacy FindTern

Living document. Tracks every feature gap between this rewrite and the legacy
codebase at `/home/wynautbhav/FindTern`, found in the 2026-10-08 audit.
Check items off as they land; add new findings at the bottom with a date.

Audit method: graphify knowledge graphs of both repos + manual source
verification of every claim against `src/`. Nothing in this file is guessed —
each item cites the file that proves it.

Legend: **P0** blocks launch · **P1** ops parity · **P2** trust/polish ·
**DONE** verified fixed (note the commit/date).

---

## 1. Revenue killers (P0)

- [x] **Employer checkout cannot take money.** FIXED 2026-10-08. The stub is gone.
  `src/components/payments/checkout-pay.tsx` (new client component) creates the
  order, opens the Razorpay modal, verifies the signature, refreshes, and
  links to Orders. One pay button per currency, since a Razorpay order is
  single-currency. Server-side amount integrity: the total is recomputed by
  `payableCheckout()` (`src/lib/employer-payable.ts`, new) which the page
  renders *and* the order route charges — a client-posted amount is ignored
  entirely. `verify` is now scoped to the owning employer (`returning()` on
  the update, 404 on no match).
- [x] **Intern activation payment has zero UI.** FIXED 2026-10-08.
  `src/components/intern/activation-card.tsx` (new) on `/intern/dashboard`,
  shown until any paid `intern_payments` row exists (hidden once working).
  Promo codes work end to end: preview via `validate-promo`, then the order
  route **re-validates and recomputes** the discount server-side
  (active, window, maxUsages, minOrder, one-per-user) and a 100% code
  short-circuits to a paid row without opening the modal. Promo usage is
  recorded on verified payment, not at order creation, so an abandoned
  checkout does not burn the code.

## 1a. API hardening done alongside (not in the legacy build)

- `intern .../order` — price derived server-side, promo validated server-side.
- `intern .../verify` — update scoped to the owning intern; promo usage
  recorded from the payment row's own `raw.promoCode`, never from the client.
- `employer .../order` — amount recomputed from accepted proposals.
- `employer .../verify` — update scoped to the owning employer.
- Razorpay `checkout.js` loads lazily on first pay click
  (`src/components/payments/razorpay-client.ts`) instead of on every page.

## 2. Feature domains 100% absent (P0/P1)

- [x] **Guest mode.** FIXED 2026-10-08. The legacy top-of-funnel
  `/opportunities` is back as a public route in the marketing group:
  `src/app/(marketing)/opportunities/page.tsx` (list) and `.../[id]/page.tsx`
  (brief + skills + facts + honest CTA wall). Indexable, with
  `generateMetadata` on the detail page; added to `INDEXABLE_ROUTES` and the
  footer. No account needed to read — `openProjects()` only touches project
  rows and company names the marketing site already publishes. No apply button,
  because there is no application to submit.
  The signed-in list at /intern/opportunities keeps its one advantage (which
  roles you have already been considered for) and now renders the same shared
  `RoleCard` (`src/components/marketing/role-card.tsx`), so the guest and
  candidate views cannot drift apart.
  Verified against the running dev server: list 200 with 18 live role cards for
  an anonymous request; detail 200 with a real `<title>`.
- [x] **Employer password reset.** FIXED 2026-10-08. New pages
  `src/app/(auth)/employer/forgot-password/page.tsx` and
  `.../reset-password/page.tsx`. `forgot-password` now takes `role` and looks
  up `users` or `employers`, writes `subjectType` accordingly, and points the
  emailed link at the right reset page. `reset-password` honours
  `subjectType` when writing the new hash. Enumeration-safe (always `{ok:true}`).
  Employer login's `forgotHref` was pointing at the intern page — fixed.
- [x] **Employer account page is a stub.** FIXED 2026-10-08. Now a real page:
  `CompanyProfileForm` (new) writes every field `PATCH /api/employer/:id`
  accepts — company, size, website, GST, location, primary contact,
  escalation contact — plus the change-password form. Found and removed two
  dead fields the PATCH schema accepted but the table never had
  (`primaryContactCountryCode`, `primaryContactPhone`; the primary contact's
  phone is the account-level `countryCode`/`phoneNumber`).
- [x] **Intern settings is a stub.** FIXED 2026-10-08. Change-password form
  added (new shared component `src/components/auth/change-password-form.tsx`),
  reusing the honest prose that was already there.
- [x] **Admin intern/company 360 pages.** Intern detail FIXED 2026-10-08:
  `/admin/interns/[id]` (new) with profile, interviews, proposals,
  timesheets, bank (masked to the last four digits) and payouts, plus the two
  controls the legacy 360 page had — payout tools
  (`src/components/admin/intern-payout-tools.tsx`) and the skills editor
  (`src/components/admin/intern-skills-editor.tsx`, 4–7 skills). The candidate
  directory now links each row to it.
  `mark-paid` now **requires** a bank reference instead of accepting an empty
  body: a payout row that says "paid" with no reference cannot be reconciled
  against a bank statement later.
  Company detail (`/admin/companies/[id]`) still open.
- [x] **Admin broadcast composer.** FIXED 2026-10-08. `/admin/notifications`
  (new page) — the nav has linked this route all along; only the page was
  missing. Candidate/company tabs, search, select-all, explicit recipient
  preview before sending, plus the 15 most recent sends as history.
- [x] **Admin payouts page was a redirect stub.** FIXED 2026-10-08. It pointed
  at `/admin/transactions?view=payouts` — the wrong table (employer money in,
  not candidate money out). Real page now: recorded / paid / still owed, and
  every payout with its bank reference, linking through to the candidate.
  Verified live: create payout 200 → mark-paid without a reference 400 → with a
  reference 200 and the reference persisted → notification send 200 to two
  recipients, empty recipient list 400, send visible in history.
- [ ] **Support feedback/report dialog.** Legacy had it on both dashboards with
  video + multi-attachment upload to `/api/support/feedback`. New: the API
  route exists (`src/app/api/support/feedback/route.ts`) but no component
  renders it anywhere.
- [x] **AI interview pipeline.** FIXED 2026-10-08, and it needed no vendor.
  The legacy "AI interview" was not an external service: it created an
  interview row against a synthetic employer (`ai-interview@findtern.ai`,
  status `waiting`) that an admin later filled in. That queue is the whole
  mechanism. `POST /api/intern/[id]/ai-interview/apply` (new) reproduces it
  with the legacy's two gates — 402 unless a paid activation exists, 409 if one
  is already in flight — plus a `GET` preflight so the button shows "already in
  the queue" instead of 409ing. The synthetic employer is created on first use
  with an unusable password hash. Intern UI lives on the dashboard next to the
  activation card.
  This closes the dead promise in `src/lib/content/faq.ts:42`, which told
  visitors they "must take the AI interview" with no way to.
  Verified: unpaid 402 → apply 200 → duplicate 409 → preflight reflects state →
  queue row and notification both written.
- [x] **AI ratings system — admin half.** FIXED 2026-10-08. `RatingsEditor`
  (new) on the intern 360 page writes the four axes through the existing
  endpoint. **Bug found and fixed while doing it:** that endpoint accepted an
  `overall` key nothing downstream reads, while `interview` — which
  `RATING_META`, the candidate cards and compare all read — could not be saved
  at all. An admin could never record the AI interview score. The schema now
  matches `RATING_META` exactly, and the mean (7.5 from 8/7/9/6) is
  recomputed server-side, which is what the pricing bands read.
  Still open: the bulk Excel upload + sample CSV from the legacy
  `/admin/interns` toolbar. The per-intern editor is the higher-integrity path
  anyway; the CSV import is a convenience and needs a file parser.
- [ ] **AI ratings system.** Legacy: admin Excel upload + sample CSV download,
  per-intern 4-axis ratings (communication/coding/aptitude/interview), ratings
  surfaced on candidate cards, compare, proposals, and employer dashboard
  sort. New: only `src/app/api/admin/interns/[id]/ratings/route.ts` (per-intern
  PUT), no UI, no bulk upload.
- [ ] **Full-time offers.** Reclassified: this is not a missing UI, it is an
  unbuilt feature. `projects.fullTimeOffer` is a *project* flag ("this role
  leads to full time") and is already surfaced on both opportunity pages. What
  the legacy had on top of that is a separate offer-letter artefact with its
  own send, accept-with-terms and download flow, and no table for it exists
  here. Needs a model before a form.
- [ ] **International FTE.** Same verdict: `employers.internationalFteStatus`
  exists as a column and is referenced by nothing — no apply route, no admin
  approve route, no UI. Needs both routes built (employer apply, admin
  approve) before a button is worth writing.
- [ ] **Saved candidate searches / alerts.** `employerSavedSearches` exists in
  `src/lib/db/schema.ts`; zero UI.
- [ ] **Profile-view tracking.** Table exists in schema; nothing writes or
  displays it.
- [x] **Interview actions on employer schedule.** FIXED 2026-10-08. The page
  printed a raw status string and a Join link; it now shows the candidate,
  the project, the timezone, all three offered slots (with the picked one
  marked) and the four actions an interviewer needs:
  `src/components/employer/interview-actions.tsx` (new) drives
  `send-reminder`, `reschedule` (three slot pickers, inline panel),
  `feedback` (2000-char, shows the server's 409 when already submitted) and
  `mark-missed` (disabled until the slot time has passed).
  Verified against the dev server: reminder 200, reschedule 200 with slots
  persisted to the DB, feedback 200, and an intern session is refused with 403
  "Insufficient role".
- [x] **Cart is read-only.** FIXED 2026-10-08. `POST /api/employer/cart`
  (new) with `add` / `remove` / `stage` / `stage_all`, honouring the
  (employer, project, intern, list_type) unique index with upserts. Add is
  guarded so you cannot attach your shortlist to another employer's project.
  `ShortlistToggle` (new) on the candidate cards and cart rows;
  `StageAllButton` (new) moves the shortlist into the checkout set.
  Verified: add 200 → re-add 200 (idempotent) → cross-employer project 404 →
  "Shortlisted" visible → stage_all 200 → remove 200.
- [~] **Proposal composer "gutted" — corrected.** The audit over-reported
  this. `src/components/employer/send-proposal-form.tsx` is 776 lines and
  complete (role title, duration, mode, laptop, monthly amount, real POST to
  `POST /api/employer/:id/proposals`); it was always reachable from the cart
  and candidate cards. What was genuinely missing was the cart mutation above.
  Rich-text JD editing (legacy ReactQuill) and the policy-confirmation dialog
  are still absent — see §3.
- [x] **Live phone-duplicate check.** FIXED 2026-10-08. Debounced 400ms check in
  the signup form against the existing `GET /api/users/exists/phone/:phone`,
  inline message under the field, and the form will not submit while the number
  is taken. A failed check never blocks signup — the unique index on
  (country_code, phone_number) is the real guard.
- [x] **Skills + city datasets.** FIXED 2026-10-08. Both carried over from the
  legacy repo into `src/lib/data/`:
  - `skills.json` — all 2,482 entries, with `suggestSkills()` ranking
    exact → prefix → contains. Wired into the intern onboarding skills step,
    the employer project wizard, and — replacing a **hardcoded ten-item
    filter list** — the employer candidate browser, which could previously not
    express a filter for anything outside those ten technologies.
  - `districts.json` — 750 rows, trimmed from 151KB to 47KB by dropping
    population/area/density/district codes that no screen read. Wired into
    onboarding preferred locations as "District, State" chips.
  Both are imported with `with { type: "json" }` so the same modules work under
  Turbopack and under `node --test` (which is what caught it).
  Covered by `src/lib/data/suggestions.test.ts` (11 assertions: list sizes, no
  duplicate skills, case-insensitive match, exact-before-prefix ranking,
  long-tail lookup, every district row has a state).
  Why it matters: free text meant "React" / "react" / "React.js" were three
  different skills in the database, and an employer filtering on one missed
  candidates tagged with another.
- [ ] **Employer monthly Razorpay orders + upcoming-payments schedule** UI.

## 3. Pages that exist but are gutted (P1)

| Area | Legacy | Now |
|---|---|---|
| Employer cart | 4,985 lines: meeting-slot dialog, proposal composer, policy gate, Razorpay | 335 lines, and read-only — **fixed 2026-10-08** (add/remove/stage now work) |
| Employer orders | Tabs: orders/payments/upcoming; invoice PDF; XLSX export; timesheet approve/reject manager; full-time offer dialog | Plain payment-history list |
| Employer projects | 4-step create/edit wizard, include/exclude, activation | Read-only list |
| Employer proposals | Withdraw dialog, edit page (ReactQuill), proceed-to-hire | View-only detail |
| Employer compare | Drag-drop reorder, per-project persistence | No DnD |
| Admin interns | 11 filters, ratings upload, interview-links editor, inline approval, export | One export link |
| Admin reports | 5 tabs, date ranges, 6 chart types, JSON export | One funnel + geography panel |
| Admin messages | Bulk mark-read/delete, reply-via-email, query-type chips | Read/unread filter |
| Admin roles | Full CRUD + permission editor + manager password resets | Read-only matrix |
| Admin dashboard | 2 charts, clickable stat cards, hired-CSV exports, quick-view dialogs | Stat cards |
| Admin intern/company 360 | Detail pages with tabs (profile/docs/interviews/proposals/timesheets/payments/bank) | No detail pages at all |
| Admin notifications | Broadcast composer (select-all, per-role) + history page | API routes only, no UI |
| Admin CMS | 8 CRUD editors (blogs, skills, faces, partners, plans, pricing, FAQ, slider) + terms editor + NDA clauses editor | Counts + homepage testimonials only |
| Intern earnings | Per-proposal cards, pending vs paid, next payout, USD→INR | Flat payout list |
| Intern interviews | Slot selection + AI gate + feedback view + meet link | Slot picker only |
| Intern documents | IndexedDB-cached previews of 4 doc types | Present (verify parity of previews) |
| Intern onboarding | 8 steps incl. experience/languages/extracurricular; face-crop photo validation | 5 steps (personal→academics→skills→documents→bank); bank step is new (win) |

## 4. Placeholder content on public pages (P0)

Audit correction (2026-10-08): round one listed "testimonials/proof" and the
platform/employer terms as placeholders. **They are not.** Partners, happy
faces, featured skills, blogs, FAQ, and the platform + employer terms are real
CMS records pulled from the live Findtern API on 2026-10-02 and documented in
`src/lib/content/proof.ts` and `legal.ts`. Do not touch them.

What was actually fabricated, and its fix:

- [x] **Invented marketing numbers removed.** `stats-band.tsx` claimed
  "1,200+ interns placed", "340+ hiring companies", "4.8/5 average rating" —
  none sourced, the live site publishes no placement counts.
  `about-section.tsx` claimed "31 days median time to placement". All four
  removed. Both bands now show only verifiable product terms (18-month
  guarantee, 3 plans, ₹0 per-hire above 6/10). Real figures, if they exist,
  belong in the CMS.
- [x] **Pricing is now CMS-backed.** `pricing_plans` was empty, so every
  amount came from a hardcoded fallback no admin could change.
  `scripts/seed.ts` now seeds it from `PRICING_PLANS`/`PRICING_PLANS_USD`
  (the legacy site's own figures — ₹100/hr, ₹200/hr, ₹5,000 per-hire), so
  /admin/cms edits real rows. Stale "amounts are placeholders" notes removed
  from the pricing page, pricing-table and content/index.
- [ ] **Intern T&C is genuinely empty upstream** (`/api/website/intern-terms`
  returns null). The page states that honestly and links the two documents that
  do exist. Closing this needs (a) legal copy written, (b) the admin terms
  editor from §6. Blocked on the business, not on code.

## 5. Trust/polish (P2)

- [x] **Analytics blackout.** FIXED 2026-10-08. `src/components/marketing/analytics.tsx`
  (new) mounts all three via `next/script` `afterInteractive` in the root
  layout, carrying the legacy IDs so remarketing history survives the rewrite:
  GA4 `G-GGNWRN8GTC`, GTM `GTM-M7TCRBCR` (container + `<noscript>` iframe),
  Meta Pixel `1401151568247955`. All three overridable by
  `NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_META_PIXEL_ID`.
  Verified in the served HTML.
  **Still required before launch:** they fire with no consent gate, which the
  DPDP Act and GDPR both disallow for non-essential tracking. Needs a consent
  banner that withholds all three until accepted.
- [x] **Old URL redirects.** FIXED 2026-10-08. 25 permanent (308) redirects in
  `next.config.ts`: every legacy intern path at the root (`/dashboard`,
  `/earnings`, `/proposals/:id`, `/settings/change-password`, `/edit-profile`,
  `/onboarding`…), the employer renames (`/employer` → dashboard,
  `/employer/profile` → account, `/employer/interns` → candidates), the
  `/employer/shedule` typo alias that was live long enough to be linked, and the
  four OAuth bridge routes → `/login`.
  `/opportunities` is deliberately *not* redirected — it is a real public route
  again. Verified: `/dashboard` → 308 `/intern/dashboard`,
  `/proposals/abc-123` → 308 `/intern/proposals/abc-123`,
  `/employer/shedule` → 308 `/employer/schedule`.
- [ ] No per-segment `loading.tsx`/`error.tsx`; no `global-error.tsx`.
- [ ] PWA `src/app/manifest.ts` has favicon only (no 192/512 icons).
- [ ] Dark-mode classes exist on primitives, no theme toggle (legacy also had
  none — not a regression).
- [ ] No per-route error boundaries under `(auth)`, `(marketing)`, `admin`,
  `employer`, `intern`.

## 6. Corrections / honesty pass

- Legacy `/admin/users` and `/admin/settings` were mock no-op pages — not real
  losses (over-reported in round 1).
- 10s countdown gates were deliberately removed —
  `src/components/app/offer-decision.tsx:22`: "a countdown is punishing them
  for reading." Design choice, not a gap.
- Legacy admin-users mock means new admin never lost a users page; users
  management is partially covered by `/api/users/[id]/activate|deactivate`.

## 7. What the rewrite already does better (keep)

- `/intern/record` exportable activity log (new).
- Admin command palette (new).
- Bank step in onboarding (new; legacy only had it in settings).
- `/privacy` page (new).
- sitemap.ts + robots.ts (legacy had neither).
- Layout-level role guards via `getSession()` (legacy used localStorage).
- URL-search-param filters on candidates (shareable, back-button safe).
- Timesheet grid with autosave (legacy had save-draft button).
- Motion system, design tokens, Watermelon primitives.

## 8. Launch order (agreed 2026-10-08)

1. Checkout + intern activation money UI → wire to existing Razorpay routes.
2. Placeholder content purge (pricing, legal, testimonials, about figures).
3. Employer forgot/reset password + the two stub account/settings pages.
4. Guest opportunities (public browse + CTA wall).
5. Interview actions + proposal composer in employer cart.
6. Admin detail pages (intern/company 360) + payout tools + broadcast composer.
7. Analytics trio (GA4 + GTM + Meta Pixel).
8. AI interview + ratings + full-time offers + international FTE.
9. Skills (2,482) + city (750) datasets into onboarding/filters.

Backend migrates to Supabase underneath all of this without changing the list.

---

## Findings log

### 2026-10-08 — initial full audit
Both repos graphified (new: 1,601 nodes/65 communities over `src/`; legacy
graph pre-existing). Three capability-level sweeps (intern+employer pages,
admin pages, schema/routes/deps/docs) then manual verification of every claim
against `src/`. Reports in chat; distilled above.

### 2026-10-08 — fix pass started (frontend first, beautification after)

Working the §8 launch order top-down. Every finished item gets its checkbox
ticked, the files named, and a line here.

- **§1 done.** Both money flows take payment. Files added:
  `src/components/payments/razorpay-client.ts`,
  `src/components/payments/checkout-pay.tsx`,
  `src/components/intern/activation-card.tsx`,
  `src/lib/employer-payable.ts`. Files changed: checkout page, intern
  dashboard, and all four payment routes. Gate: `npx tsc --noEmit` clean,
  `npm run lint` 0 errors, `npm test` 64/64.
- **§4 done except intern terms.** Removed four invented marketing numbers
  ("1,200+ placed", "340+ companies", "4.8/5", "31 days"). Seeded
  `pricing_plans` so pricing is CMS-editable at the legacy site's own
  figures. Corrected the audit: partners/testimonials/skills/blogs/FAQ and
  the platform + employer terms are real CMS data, not placeholders.
  Gate: tsc clean, lint clean, 64/64.
- **§3 done.** Employer forgot/reset password, employer account page (company
  profile + password), intern settings (password). Two dead API fields removed.
  Gate: tsc clean, lint 0 errors (164 unchanged warnings), 64/64.
  Still open from §3, for §6: account **deactivation** UI (endpoint exists at
  `POST /api/users/[id]/deactivate`, no confirm flow built yet) and the company
  **logo upload** (no endpoint exists in this build).
- **§4 done.** Public role browser restored (list + detail, indexable,
  shared RoleCard). Browser-verified.
- **§5 done.** Employer schedule has its four actions; the cart can be
  written to again (`POST /api/employer/cart`). Both verified against the dev
  server with real sessions. Proposal composer reclassified — it was never
  broken.
- **Small gaps closed:** live phone-duplicate check in signup, 25 legacy URL
  redirects. Gate set still green (tsc 0, lint 0 errors, 75/75, build clean).
- **§9 done.** Skills vocabulary (2,482) and districts (750) restored, wired
  into both onboarding wizards and the candidate filter; the hardcoded
  ten-skill filter is gone. 11 new assertions cover the data. Verified by
  `next build` (clean, `/opportunities` prerenders static) and the full gate set.
- **§8 half done.** AI interview apply is back (and closes the FAQ's dead
  promise); the ratings admin is back and an endpoint bug that made the AI
  interview axis unwritable is fixed. Full-time offers and international FTE
  are reclassified as *unbuilt features* needing models, not missing screens.
- **§7 done, with one caveat.** Analytics trio restored with the legacy IDs.
  Caveat: they load without a consent gate — a privacy exposure to close
  before launch, not a styling nicety.
- **§6 partially done.** Admin intern 360 + payout tools + skills editor,
  broadcast composer, real payouts page. Company detail page, admin settings,
  deactivation UI and the company logo upload are still open.
- **Hardening note for §6:** the protected pages trust the layout guard
  (`src/app/employer/layout.tsx` redirects a non-employer session), but
  layouts and pages render in parallel, so each page still runs its query with
  the wrong session's uid before the redirect wins. Nothing leaks — the
  response is a redirect with an empty body — but it is wasted work on every
  request, and a middleware-level guard would remove the class of risk.

Beautification of the whole UI is deliberately *not* started until every item
above is addressed — new surfaces land plain, then get the design pass.

---

## 10. Design audit of the login-required surfaces (2026-10-08)

Scope: all 45 pages behind a login — `src/app/admin/**` (14), `src/app/intern/**`
(14), `src/app/employer/**` (17). Baseline: `src/app/globals.css`,
`src/components/{ui,layout,app,admin,watermelon}`, `docs/design_system.md`.
Method: mechanical scan of the source against those tokens and primitives,
cross-read against the live-site screens in `~/Desktop/ftss` (86 screenshots)
and our own captured screens in `docs/screenshots/redesign/`.

Full report: `DESIGN.md` §1–2. Headline counts:

### 10.1 Divergences

| Measure | Count |
|---|---|
| Competing white-card class recipes | 8 |
| Locally re-implemented primitives | 21 definitions across 15 pages |
| Hand-rolled card `<div>`s bypassing `Panel`/`Surface` | 63 across 30 pages |
| One-off button class strings (employer area) | 11 |
| Table implementations with 5 distinct header treatments | 5 |
| `status → colour` maps (2 disagree on the same literal) | 4 |
| `humanizeStatus` implementations | 4 |
| `space-y-*` / `gap-*` values across the 45 pages | 8 / 10 |
| Sidebar rail widths | 5 |
| Shell content paddings / breakpoints / topbar strategies | 3 / 3 / 3 |
| `text-2xs` uses in admin, where globals.css says nothing below 0.75rem | 16 |
| Off-token palette (`emerald`/`amber`/`purple`) in admin/reports | 3 |
| `dark:` classes in the 45 pages | 0 |
| `loading.tsx` per role area / `Suspense` app-wide | 0 / 0 |
| `ui/skeleton.tsx` importers | 0 |
| `DetailRow` consumers (18 hand-rolled `dt`/`dd` rows in its place) | 0 |
| Declared admin tokens with zero consumers | 22 + 3 utilities |
| Pages where a DB outage renders as "no data" (bare `catch {}`) | 15 |
| Raw database enums shown to users | 10 sites |

### 10.2 Real bugs found while scanning

- [ ] **Employer sidebar is neither sticky nor full-height.** `app-shell.tsx:62`
  has no `sticky top-0` and no `h-[100dvh]`, so the sidebar scrolls away with
  the page. Admin (`admin-shell.tsx:43`) and intern (`shell.tsx:157`) both get
  this right.
- [ ] **Tablet layout disagrees by role.** Admin and employer show the sidebar at
  `md` (768px); intern switches to a hamburger + bottom tab bar at `lg`
  (1024px). On a 768–1023px tablet an intern gets mobile chrome while an
  employer gets a sidebar.
- [ ] **A database outage looks like an empty account.** 15 pages wrap their
  reads in a bare `catch {}` and render "No projects" / "All caught up". Only
  `employer/candidates` distinguishes `loadFailed` from empty, and it does so
  with the deprecated empty-state primitive that has no action slot.
- [ ] **`admin/payouts` truncates silently.** `.limit(200)` with no pager — rows
  201+ are unreachable. `admin/roles` and `admin/cms` have no pagination at all.
- [ ] **Two byte-identical `Metric` components** in `admin/payouts` and
  `admin/interns/[id]`, both duplicating `StatCard`. Two byte-identical
  `Detail` components in `employer/intern/[id]` and `employer/proposal/[id]`,
  both duplicating `DetailRow`.
- [ ] **`employer/dashboard` defines a local component named `StatCard`** that
  shadows the admin primitive of the same name, with a different border, a
  different label size, `text-3xl` instead of `text-2xl`, and no `tabular-nums`.

### 10.3 What the rewrite already does better than the live site

- Admin shell: one accent, real breadcrumbs, command palette, numeric alignment.
  The live admin uses a **rainbow of top borders** on stat tiles
  (`emerald/amber/purple/blue/red`) — decoration, not hierarchy, and it fails
  contrast discipline. Direction confirmed with the user: **monochrome, one
  accent.**
- Layout guards, CSRF-aware fetch, and a typed `employer_pricing` module have no
  equivalent on the live site.
- 25 legacy redirects, per-segment sitemap/robots, and an intern-facing "what
  happens next" honesty pass the live site never had.

### 10.4 What the live site has that we do not

- **The intern profile card** (green gradient panel with the score, four axis
  meters, academics, languages, AI-interview feedback links) has more visual
  identity than anything in the rewrite, and carries more per candidate.
- **More per candidate row** on the employer list: hourly price beside the score,
  city, laptop flag, and all four sub-scores. Our cards are thinner.
- **Admin inline editing**: approval status, live/hidden, activate/deactivate,
  quick-view JSON, and a 11-filter intern directory with 88 pages. Our intern
  directory has one export link. The endpoints exist here
  (`PUT /api/admin/interns/[id]/approval`, `/status`, `/visibility`, `/ratings`,
  `/skills`, `POST /api/users/[id]/activate|deactivate`) and only ratings +
  skills now have UI.
- **A dedicated company 360** (`/admin/companies/[id]`) with seven tabs. We
  still do not have this page.

### 10.5 Decision record

Taken with the user, 2026-10-08:

| Decision | Choice |
|---|---|
| Employer navigation | Keep the **sidebar** (not the live site's top icon-bar). Rebuild the area onto the shared primitives. |
| Admin stat tiles | **Monochrome, one accent.** No rainbow top borders. |
| Retention mechanics | Recruiter-readiness meter + visibility-unlock milestones + a **forgiving weekly streak** (weekly not daily, user-chosen cadence, grace period, no loss notifications, unit switches past 30). |
| Dark mode | **Ships in this pass**, after the foundations so nothing is styled twice. |

### 10.6 Plan

`DESIGN.md` — nine phases, foundations first. `PRODUCT.md` — the product truth
the phases must not violate, including the four things that must never be true
(score not purchasable, no invented urgency, no raw enums, empty ≠ broken).

---

## 11. Live-site feature parity — findtern.in vs the rewrite (2026-10-08)

The 86 screenshots in `~/Desktop/ftss` are the *current product*, not the legacy
codebase. Comparing them against our pages is a different question from §10's
design audit: it answers "what can a user do there that they cannot do here".
All 86 were read literally, small text included.

### 11.1 Intern — 21 gaps

**Blocking before launch**

- [ ] **Aadhaar number + PAN number text fields.** Both columns exist in
  `intern_onboarding` and are never written. Without them the KYC pair is
  half-captured and no payout can be validated.
- [ ] **Experience step** — type / company / role / from / to / "currently work
  here" / about / add-more / skip. `experience_json` exists and is unused.
- [ ] **Languages step** — repeatable rows with Level (Native/Professional) and
  Read/Write/Speak. No data model at all, and it is rendered on the
  employer-facing card, so matching quality degrades.
- [ ] **Extracurriculars step** — activity + level, repeatable.
- [ ] **Profile preview step** — "here is how your profile will look to
  companies" + Save Changes. `previewSummary` is dead.
- [ ] **Per-skill proficiency** (Beginner/Intermediate) with the up-to-7 cap and
  ordering. Live feeds ratings into AI-interview difficulty; we collect a flat
  `string[]`, so the interview is uncalibrated or the field is lost at ingest.
- [ ] **Academics completeness** — Level, Status (Pursuing), Start Year,
  Percentage/CGPA mode toggle, marksheet upload, professional courses,
  certifications. We capture 5 of 12 live fields.
- [ ] **Notification bell + unread count + dropdown.** The primary discovery
  channel for interview and proposal events on every live shot. We have a full
  notifications page that nothing in the chrome links to.
- [ ] **Open-to-Work toggle.** Read by admin, never writable by the intern, so
  employer-side "open to work" filtering has no intern-side control.
- [ ] **AI-interview feedback and recording links on the profile.** Scores are
  published; the recording is the evidence. Unreachable from our intern UI.

**Thinner**

- [ ] Profile card omits Experience, Languages, Extracurricular, location chips,
  laptop badge, Findtern score + sub-scores, academics score/specialization —
  every fact a candidate is being scored on is invisible to them.
- [ ] Dashboard has no "Next interview", no Status/Active card, and no
  Interviews/Proposals count cards with View-all CTAs.
- [ ] Timesheets: no "New timesheet" button (the POST route exists) and no
  "Paid proposals" selector expressing the eligibility rule.
- [ ] Interviews: no date or status filter, and `expired` rows render on no
  screen at all — `buildThread` mislabels them "Interview request pending".
- [ ] Bank Details is buried at step 5 of the wizard instead of being a
  Settings screen.
- [ ] Name / phone / email / country-code are not editable; settings tells
  candidates to go back to registration.
- [ ] `photoUrl={null}` is hardcoded in `intern/layout.tsx`, so the photo a
  candidate uploads never renders in the app chrome.
- [ ] Notification "Needs you" grouping is mis-wired (`NEEDS_ACTION` types do
  not match the writers), there is no unread count or All/Unread filter, and
  timestamps are absolute rather than relative.
- [ ] Three of live's six notification categories do not exist (AI scores live,
  AI unlocked, monthly profile-views digest).
- [ ] No floating support / report / help rail.
- [ ] Smaller: skills cap of 7 and the "add at least 4" guidance; preferred
  locations cap of 5; password hint omits the special-character rule.

### 11.2 Employer — 17 gaps

**Blocking before launch**

- [ ] **AI interview feedback report** (shots 15, 16, 16b) — the product's
  differentiating artifact. Live renders a 17-page PDF: overall score with
  percentile rank, suspicious-activity risk, section-wise scores with progress
  bars, and a communication assessment (fluency / clarity / grammar /
  confidence). We have no report surface, no PDF route, and no storage column.
- [ ] **Orders page tabs and payment filters** — live has Orders / View payments
  / Upcoming payments with search, project, currency, date-range, reset and
  payment-status filters. Ours is one unfiltered list. Employers cannot
  reconcile a single invoice.
- [ ] **Per-order invoice download and XLSX export.** No way to get a document
  out of the system at all; finance cannot process these hires.
- [ ] **Upcoming / monthly payment actions** — start date, duration, upcoming
  and completed dates, total vs due, per-row Pay. We have no recurring-payment
  model, so multi-month hires cannot be paid month by month.
- [ ] **Projects page CRUD and include/exclude** — a bare name list with no
  edit, delete, include or activation. Projects cannot be managed after
  creation, and there is no create-project UI anywhere in the employer flow.
- [ ] **Cart checkout step mechanics** — no Cart↔Checkout step toggle, no project
  dropdown, no per-row Book Meeting or View Profile; the staged set is never
  displayed.
- [ ] **Notifications dropdown and bell** — the highest-traffic entry point for
  interview reminders and feedback requests has no UI at all.
- [ ] **Account dropdown menu** — Company Profile, Orders, Change Password and
  Help & Support are only reachable by scrolling a sidebar, and Help & Support
  has no destination page.
- [ ] **Help & Support surface** — no route, no SLA copy, no support-chat entry.
  Employers have no escalation path in-product.

**Thinner**

- [ ] Candidate browser: no Location/Device/Price/Ratings filter sidebar, no Has
  Laptop or Include Remote toggles, no per-page size selector, no list/grid
  toggle, no active-filter count, no visible project switcher.
- [ ] Proposals list: no search, status filter, candidate/project columns,
  monthly stipend or per-row action — and ours leaks the raw `flowType` enum.
- [ ] Schedule: no search, date, status, project or timezone filters and no
  per-row Profile action.
- [ ] Compare: no role-match %, no strong-match-skill count, no drag-to-reorder,
  no per-card remove, cap of 4 instead of 5, and no "Overall interview"
  aggregate row. Ours compares generic attributes instead of role fit.
- [ ] Intern profile: no AI Interview Results card, no experience/projects with
  date ranges, no extra-curriculars, no languages with proficiency, no price/hr
  or current-role header chips.
- [ ] Proposal detail: Withdraw, Edit offer and Mark as hired are rendered as
  disabled placeholders.
- [ ] Notification management: no All/Unread tabs, no mark-all-read, no per-row
  delete, no unread row treatment; the employer notifier never emits
  interview-lifecycle types.

### 11.3 Admin — 29 gaps

**Blocking before launch**

- [ ] **Company 360 (`/admin/companies/[id]`) — the entire route is missing.**
  Live has 7 tabs (Profile, Projects, Proposals, Interviews, Payments, Upcoming
  Payments, Hired) with filters, columns, stat cards and contact cards. We have
  only the companies list. Largest single gap in the admin area.
- [ ] **CMS is entirely read-only.** Live has Add/edit/delete on Testimonials,
  Partners and FAQs. Content cannot be created or edited at all.
- [ ] **Three legal-content editors missing** — Intern Terms, Company Terms and
  Non-Disclosure Clauses, each a title field plus a rich-text toolbar
  (B/I/U/S, lists, link, Visual/HTML toggle) with Save. The API routes exist
  (`/api/admin/intern/terms`, `/api/admin/company/terms`,
  `/api/admin/ndc-clauses`) with no UI.
- [ ] **Notification History page** — no dedicated page with search, filters,
  sender/type columns, expandable rows or pagination.
- [ ] **Orders page** — entire page missing: stats, search, date/currency/status
  filters, table, export CSV.
- [ ] **Intern Invoices page** — entire page missing.
- [ ] **Promo code create / edit / delete** — no Add button, no row edit/delete,
  no Valid Period column.
- [ ] **Roles is read-only** — no create/edit/delete role, no add/edit/
  deactivate/delete admin. A small team cannot manage access.
- [ ] **Contact message actions** — no Reply, Delete or View per row, no
  query-type filter, no bulk select.
- [ ] **Reports: no date range selector and no tabs** — live has Overview /
  Interns / Companies / Performance / Transactions with a "Last 18 Months"
  selector, platform growth trends, top skills in demand, highest-paying skills
  and region demand. Ours is one scrollable page.
- [ ] **Payouts & Dues: no Employer Dues view** — no tab, and the table is missing
  employer, project, start date, months paid/total, monthly, total, paid, due
  and next-payment columns.
- [ ] **CMS Terms editor, Featured Skills tab, region-aware pricing comparison**
  (INR/USD sections with an attribute-row matrix) — all missing.
- [ ] **Intern Documents tab** — schema has `internDocuments`, no UI.

**Thinner**

- [ ] Intern directory: no stats row, no AI-interview donut, no activity-trends
  chart, no Sample/Upload Ratings buttons, no interview-status filter, no
  advanced filters, no AI-interview or Findtern Score columns.
- [ ] Intern 360: stacked panels instead of 7 tabs with counts; no green header
  banner, no Skills/Total Payouts stat cards, no read-only score breakdown, no
  payouts timeline.
- [ ] Companies: no profile/FTE/date filters, no S.No/Country/Project City
  columns, no row actions.
- [ ] Projects: no grouped-by-company sections, no Skills/City/State/Preferred
  Locations/Work Mode/Scope columns, no Quick View dialog, no company filter.
- [ ] Proposal tracker: one table instead of four tabs, no date-range or
  entity-select filters, missing Monthly/Duration/Created/Action columns.
- [ ] CMS: no search or pagination on any tab, no partner logo column, no
  testimonial/partner/FAQ create-update-delete.
- [ ] Dashboard: no placement/hires tables with CSV export, no Activity Tracker,
  no Full Directory / All Projects buttons.
- [ ] Notifications composer: no Reset Draft, no Select Filtered, no
  available/total count badges, no broadcast-mode note.

### 11.4 What this changes

The §1–§9 work made the rewrite *launchable*. This section is what makes it
*competitive with the product it replaces*. The pattern is consistent: the live
site is **denser and more editable** — more filters, more columns, more row
actions, more inline editing — while the rewrite is cleaner but read-only.

Three findings worth naming directly:

1. **The AI interview feedback report is the product.** Live renders a 17-page
   scored PDF per candidate. We have the four axis scores and no report. This is
   the single largest feature gap in the entire comparison and it is the reason
   employers pay for the score.
2. **The employer area cannot manage its own data.** No project CRUD, no order
   reconciliation, no invoice export, no recurring payments, no support entry.
   An employer hitting a problem has nowhere to go.
3. **The admin console cannot run the business.** Read-only CMS, read-only roles,
   no orders or invoices pages, no employer dues, no notification history. The
   endpoints for most of this already exist.

### 11.5 Recommended order

1. AI interview feedback report (schema + route + view) — the differentiator.
2. Employer: projects CRUD, orders tabs + invoice export, notifications bell,
   help & support.
3. Admin: company 360, CMS write access, the three legal editors, notification
   history, orders + intern invoices pages.
4. Intern: KYC numbers, experience/languages/extracurricular steps, profile
   preview, per-skill proficiency, notification bell, open-to-work.
5. Cross-cutting: expired-interview handling, photo in chrome, notification
   grouping fix, relative timestamps.

---

## 12. Login-Required Surface Design, Craft & Interaction Audit

Audited 45 authenticated routes across `src/app/admin/**` (14), `src/app/intern/**` (14), and `src/app/employer/**` (17) against our design skills (`impeccable`, `design-taste-frontend`, `improve-animations`), `globals.css` design tokens, Watermelon & shadcn primitive registries, and visual references from live `findtern.in` (`~/Desktop/ftss`).

### 12.1 Headline Audit Metrics

| Audit Metric | Measurement | Severity |
| :--- | :--- | :--- |
| **Login-Required Pages Audited** | **45 total** (Admin: 14, Intern: 14, Employer: 17) | — |
| **Hand-Rolled Bordered-White Surface `<div>`s** | **63 across 30 pages** (bypassing `Panel` / `Surface`) | **Critical** |
| **Locally Re-Implemented Primitives** | **21 definitions across 15 pages** (Metric, Row, Stat, Detail, Th, Cell, Line, Figure, StatusPill) | **High** |
| **Distinct Competing White-Card Recipes** | **8 distinct class strings** across the 3 user areas | **High** |
| **shadcn Primitive Imports in Pages** | **Only 3** (all `ui/table` in admin; 0 `Button`, `Badge`, `Card`, `Dialog`, `Select`, `Sheet`) | **High** |
| **Watermelon Primitives Adopted** | **Only 1 of 11 available** (`expandable-profile-card`) | **High** |
| **Loading / Error States** | **0 per-segment `loading.tsx` / `error.tsx`**; 0 `Suspense` boundaries | **Critical** |
| **Raw Database Enums Rendered to Users** | **9 occurrences** (`interview_first`, `pending_review`, etc. shown directly to users) | **Critical** |
| **Editable vs Read-Only Surfaces** | **85% of pages are read-only** (cannot create, edit, or manage entities like findtern.in) | **Critical** |
| **Dead Design Tokens in globals.css** | **22 admin tokens + 3 utilities with 0 consumers** | **Medium** |
| **Arbitrary Value Literals Bypassing Scale** | **83 occurrences** (tracking, non-standard paddings, rail widths, hardcoded `rgb()`) | **Medium** |

---

### 12.2 Area-by-Area Findings

#### A. Employer Surfaces (`src/app/employer/**` — 17 Pages)
**Verdict: An unsynced third design system; read-only and missing critical operational capabilities.**
1. **Third Design System**: 39 occurrences of hand-rolled `rounded-xl border border-ink-100 bg-white` surfaces. Uses zero `Panel`, `Surface`, `StatCard`, or `StatusBadge` primitives.
2. **11 Distinct Button Recipes**: Uses one-off Tailwind strings instead of `ui/button` variants, with arbitrary paddings, heights, and border styles.
3. **Raw DB Enums Leaked**: `proposals/page.tsx:20-21` renders `{p.flowType}` and `{p.status}`; `orders/page.tsx:20` renders `{o.status}`; `schedule/page.tsx:158` renders `{status}`; `timesheets/[id]` renders raw status.
4. **Shell Inconsistency**:
   - The sidebar has no sticky position or fixed viewport height (`app-shell.tsx:62`), causing the entire navigation drawer to scroll away with page content.
   - Employer uses `md:px-10` padding, Admin uses `md:px-8`, and Intern uses `clamp(1.25rem, 4vw, 2.5rem)` with a 1200px max-width cap.
5. **Read-Only Defect**:
   - Unlike live `findtern.in` (screenshots `10`, `11`, `12`, `19`, `20`), employers cannot create or manage Projects, cannot view upcoming payment schedules or pay dues directly, cannot export order invoices, and have no Help & Support dialog.
6. **Error Suppression Antipattern**: 7 of 17 pages wrap DB operations in empty `catch {}` blocks, rendering false "All caught up" or "No projects" empty states even during backend outages.

#### B. Intern Surfaces (`src/app/intern/**` — 14 Pages)
**Verdict: Clean tokens, but missing gamification, editing workflows, and comprehensive profile depth.**
1. **Primitive Duplication**: Hand-rolls `Surface`, `SectionHead`, and `DetailRow` inside `earnings`, `record`, `documents`, and `proposals`. `DetailRow` has 0 actual imports despite being exported.
2. **Missing Gamification & Retention Engine**:
   - Live site (`65-intern-dashboard.png`) features a dynamic profile completion ring, readiness status, and clear milestone steps.
   - Current rewrite shows static numbers without progress cues, interactive checklist guidance, streak tracking, or clear explanation of how to raise the Findtern Score.
3. **Onboarding / Profile Editing Gaps**:
   - Live site has an 8-step comprehensive wizard (`67`–`74`: Passport photo crop, Academics, Experience & Projects, Skills with proficiency ratings, Languages, Extracurricular, Location preferences, and interactive Profile Preview).
   - Current rewrite is a 5-step plain form without proficiency selectors, language fluency, extracurricular honors, or preview step.
4. **Hardcoded Colors**: 6 hardcoded `rgb(7 47 36 / ...)` values in `dashboard`, `proposals`, `earnings`, and `record`.
5. **No Visual Hierarchy in Detail Pages**: Key detail views (`opportunities/[id]`, `proposals/[id]`) read like flat lists of text instead of high-stakes talent contracts.

#### C. Admin Console (`src/app/admin/**` — 14 Pages)
**Verdict: Strongest structural baseline, but 3 diverging screens, read-only CMS/Roles, and lack of triage.**
1. **Divergent Legacy Screens**: `admin/payouts`, `admin/notifications`, and `admin/interns/[id]` predate the rebuild. `payouts` uses raw HTML `<table>` with custom metric components; `notifications` uses layout `PageHeader` inside `/admin`; `interns/[id]` hand-rolls its own header.
2. **Dead Admin Token System**: `globals.css` declares `--text-admin-xs...xl`, `--admin-row-h`, `--admin-sidebar-w`, etc., but not a single admin page consumes them.
3. **Missing Administrative Actions**:
   - `admin/roles` is completely read-only (cannot add staff, assign permissions, or deactivate accounts).
   - `admin/cms` has no CRUD capabilities for blogs, skills, faces, partners, pricing, or terms.
   - `admin/contact-messages` has no triage workflow (resolve, reply, archive) seen in live `26-admin-contact-messages-inbox.png`.
   - `admin/payouts` lacks the "Employer Dues" ledger view (`37-admin-payouts-dues.png`).
4. **Table Header & Density Inconsistencies**: 5 distinct table header treatments across 4 admin table implementations; `roles` and `cms` lack search and pagination.

---

### 12.3 Cross-Cutting Architecture Issues

1. **Root Loading Spinner Flash**: Because there are no segment `loading.tsx` or `Suspense` boundaries in `/admin`, `/intern`, or `/employer`, initial page transitions wipe out the sidebar, topbar, and breadcrumbs, flashing a raw spinner on white canvas.
2. **Absence of Action Drawers / Sheets**: When users click to view or edit an item (e.g. project details, candidate ratings, interview feedback), they are either navigated to a new page or given read-only text. Modern operational tools (Linear, Retool, Ashby) use slide-out Sheets (`ui/sheet`) to preserve table context.
3. **Lack of Tabular Numerals**: Scores (e.g. `8.3` vs `10.0`), stipends, dates, and currency values are frequently rendered with proportional numbers, creating horizontal jitter and misalignment in columns.

