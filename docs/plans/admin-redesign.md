> Saved from ~/.claude/plans/idempotent-snuggling-bentley.md on 2 Nov 2026. Parts 1-2 shipped on `fix/launch-audit`; Part 3 is built on `ui/admin-redesign` (uncommitted). Parts 4-5 are next.

# Admin redesign + migration leftovers + security/performance/network audit

## Context
Intern and employer were rebuilt to SPECS.md; admin was explicitly left out ("Admin and college keep working… not being redesigned in this pass", SPECS:11). Owner decision today (2 Nov): **full intern-style redesign of admin**, run through the **full /design-pipeline**. Also: finish whatever is left from the legacy app (`~/FindTern`), test in a visible browser, and audit the whole site for security, performance and network. Launch is this week (test-pay removal is due then), so audit findings outrank polish.

Recon (3 surveys + my own checks):
- **Migration:** yesterday's `docs/qa/migration-readiness-2026-11-01.md` already compared every legacy screen/route: nothing missing. Since then B1 (Razorpay capture), M6 (edit-offer validation) and the admin accessible-name axe failures were fixed on master. Still open in code: M1, M2, M3, M7, part of M9, plus one new bug (`/admin/website?tab=` legacy links never reach the tab map). B3 test-pay is due in launch week (reminder only).
- **Admin UI:** pages consistently use `AdminPageHeader` (26 files, already wraps shared `PageHead`), `Panel` (24), `StatCard/StatGrid` (12), `DataTable` (11, stacks fine) → most of the redesign lands at the primitive level. Plus 8 raw tables that scroll sideways at 390, all inputs 14px (iOS zoom), hand-built command palette (no focus trap/return), native `confirm()`, errors not tied to fields (1 `aria-invalid` vs 29), ~20 truncated names, raw radii.
- **Security/perf:** controls look sound (requireMutation on writes, proxy guards `/api/admin`, webhook signatures, upload sniffing). Leads to measure: regex HTML sanitizer feeding `dangerouslySetInnerHTML` (employer-written JD), two admin routes guarded only by the proxy, `sql.raw` in `payout-list.ts:67,71`, Google callback `to`, CSP report-only with `unsafe-inline`, in-memory rate limit vs Vercel, missing indexes on hot tables, lenis+gsap on every page, 18 raw `<img>`.

## Branches
- `fix/launch-audit` from `fix/bug-sheet-nov-2`: Parts 1–2 (small, shippable before launch).
- `ui/admin-redesign` from `fix/launch-audit`: Parts 3–5 (multi-day).
Nothing pushed or merged without asking.

## Part 1 — Security / performance / network audit (riskiest: may block launch) — measure, then fix
Run against the local QA build (`npm run qa:serve`, port 3500, QA DB 5435). Never against staging/prod.
1. **Security, by test not reading:**
   - XSS corpus through `sanitizeRichText` (`src/lib/richtext.ts`) → add `richtext.test.ts`; harden or swap to the platform (`sanitize-html` only if regex can't be made safe — would be a new dep, ask first).
   - Unauthenticated HTTP sweep of every `src/app/api/**` route (script in scratchpad): expect 401/403 on all non-public; check public ones (`colleges/search`, `users/exists/phone`, `marketing/students`, `files/public`) for enumeration/leaks.
   - Defence in depth: add the shared admin guard inside `api/admin/support-file/[key]` and `api/admin/google/connect` (not only the proxy).
   - Trace `dir` in `admin/payout-list.ts:67,71` and `to` in `api/auth/google/callback`; fix if user-controlled.
   - Read collected `/api/csp-report` entries; plan for enforcing CSP is reported, not flipped (needs staging test).
   - Rate limit: 20 parallel logins locally; note per-instance limitation if Vercel is the prod target (owner's deploy question).
   - `npm run test:security`; spawn **security-reviewer (opus)** on the findings + diff.
2. **Performance:** `npm run qa -- slow3g` and `npm run qa -- lighthouse` (add admin dashboard to its targets), `next build` route sizes (first-load JS per route); check if `SmoothScroll` (lenis+gsap) can stay off console pages; `pg_indexes` on the QA DB + `EXPLAIN ANALYZE` of the dashboard queries for proposals/interviews/timesheets/notifications/employer_payments → a migration only for indexes proven missing *and* slow; `next/image` for the hero/marketing images that Lighthouse flags as LCP.
3. **Network:** `curl -I` with `Accept-Encoding: br,gzip` on HTML/JS/API (compression), cache headers on `/_next/static`, `files/public`, `files/legacy`; per-page request counts from a HAR in the headed run; polling intervals (presence SSE 5s, drive 10s, AI card 15s) paused when tab hidden?
4. Output: `docs/qa/audit-2026-11-02.md` — table of finding | evidence | severity | fixed/owner. Fix every HIGH/MEDIUM that is code; list config/owner items.

## Part 2 — Migration leftovers (small code fixes)
- M1 `src/lib/onboarding.ts:~1333`: agreement step counts as done for scored/activated interns (as `isOnboarded` already does).
- M2 `src/lib/security/store.ts:193,212`: serve `.jfif` as `image/jpeg`.
- M3 `src/lib/google.ts:79-80`: fall back to `GOOGLE_OAUTH_CLIENT_ID/SECRET`.
- M7 `src/app/employer/timesheets/page.tsx`: honour `?intern=`, hide intern drafts. ("can't be paid online" hires = owner decision, listed.)
- M9 `employer/alerts/page.tsx:24-55`: click-through for `interview_reschedule_requested_by_intern`, `international_fte_*`, `full_time_fee_paid`.
- New: delete `next.config.ts:94` (`/admin/website` redirect) so `src/app/admin/website/page.tsx` maps legacy tabs.
- Unit tests for M1, M2, M3 alongside existing test files. Update the readiness doc's status column.
- Owner items (listed, not coded): B2 Google login at cutover, B3 test-pay removal in launch week, SYS-09 saved searches dropped, M8.

## Part 3 — Admin foundation (hardest UI step: every admin page changes)
Reuse, don't add:
- `src/app/admin/layout.tsx`: `ConsoleShell tone="light"` (as `src/app/intern/layout.tsx:135`); verify topActions (command palette), alerts and nav badges render in the light rail; adjust `console-shell.tsx` only where light assumes intern-only bits.
- `src/components/admin/panel.tsx` `Panel` → `Surface` look (`src/components/app/primitives.tsx:140`: `rounded-apple-xl`, `border-ink-200/80`, no shadow); drop `apple-panel` there and in `data-table.tsx:133`, `stat-card.tsx`, `messages-inbox.tsx`, `intern-payout-tools.tsx`.
- `StatCard/StatGrid` → `StatTile`/`STAT_ROW` look from `src/components/app/tiles.tsx`, keeping their props so 12 callers don't change.
- SPECS.md: admin in scope; §9 changelog entry for today's owner decision.
- Check: shots of all admin routes at 390/1440 before and after; no page lost content.

## Part 4 — Admin dashboard bento + rules fixes
- `src/app/admin/dashboard/page.tsx`: D1 pattern — key-number row with one brand tile, soft tiles, one chart (`trend-chart.tsx`), `ActivityList` for recent events; data queries unchanged.
- Stack the 8 raw tables (`data-stack`, `lg:min-w-*`, `data-title/label/empty`): reports/money, reports/analytics (shared table), intern-payout-tools ×2, intern-360 ×3; staff-roles matrix keeps scrolling with `tabIndex=0 role=region` + label.
- Inputs `text-base sm:text-sm` in the ~13 admin input styles + `table-toolbar.tsx`.
- `command-palette.tsx` on `ui/dialog` (focus trap/return, labelled close, arrow keys or drop the false hint); `bulk-select.tsx:104` `confirm()` → `useConfirm`; errors get `aria-invalid` + `aria-describedby` (profile-form, notification-composer, promo-codes, pricing editor); intern-360 tabs arrow keys + no dangling `aria-controls`.
- Names wrap (transactions, proposal-tracker, company-360, dashboard, messages, notification-composer, interns); raw radii → apple tokens; `font-bold`→`semibold`; dialog `grid-cols-2`→`sm:grid-cols-2`.

## Part 5 — /design-pipeline `/admin/**` (owner chose the full pipeline)
Five sequential stages, each gated by a fresh Opus verifier, per the skill. Fix HIGH/MEDIUM per stage; LOW listed.

## Verification (each part ends checked)
- Gate per AGENTS.md: `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run test:security` → `npm run db:verify`.
- `~/.claude/hooks/browser-check.sh` on all admin routes (+ touched intern/employer routes), read PNGs; must be clean (fixes the daily's two-day failure; also seed a drive row so `/employer/drives/[id]` stops erroring the harness).
- **Headed Chromium run in front of you** (QA build, `admin` persona `e2e-admin@findtern.test`, plus employer/intern for Part 2): every admin route at 390 and 1440 — no sideways scroll, stacked tables labelled, palette opens/traps/returns focus, confirm dialog, form error focus, dashboard tiles; Part 2 fixes clicked through.
- Stop gate: goldfish-reviewer on each branch diff, security-reviewer (opus) on Part 1–2, design-critic (opus) on admin PNGs after Part 4 (then the pipeline).
- Not covered unless you ask: staging, Safari/Firefox, screen reader, real Razorpay.
