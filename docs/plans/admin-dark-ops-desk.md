# Findtern admin: dark ops-desk redesign, one signature per page

## Context
On 3 Nov 2026 two read-only reviews scored the admin at 25/40 for critique and 16/24 for audit. What they found:
- The admin still wears the intern frame (`tone="light"`, `Surface` tiles, intern `StatTile`s on the dashboard).
- 11 pages open with the same pattern: header, 4 stat cards, table.
- Orders and Intern invoices render the same component.
- Payouts, Transactions and Money show the same totals.
- There is almost no motion.

Vaibhav wants a CRM with a wow factor on every page, real animation, and no two pages alike. He chose a **full dark ops desk** that is **admin only**: intern, employer and college stay pixel-identical.

Skill: taste-skill app-screen run (`~/.claude/skill-library/taste-skill/references/app-screens.md`). impeccable (Operate mode) is the review gate.

## Decisions (stated, not asked)
- **The brief overrides one skill rule.** taste-skill says app screens perform no entrances. Vaibhav asked for animation, so motion is allowed, but it is tied to data and state:
  - figures count up
  - kanban cards fly between columns
  - paid rows strike through
  - a waterfall builds
  - rows morph into records

  The limits:
  - Each page gets one signature move of up to 600ms.
  - Everything else uses the 120/180/260ms admin tokens.
  - Transform and opacity only.
  - Reduced motion is honoured everywhere.
- **Dark ground.** The ground is near-neutral green-black (`ink-950 #0b1512`), not navy or slate. This is the product's own hue at very low chroma, which the skill's "face from the brief" allows. Brand green goes only on data, status and the single primary action. Amber means "waiting".
- **Uncommitted WIP on `ui/admin-redesign`.** It holds the rejected light pass plus good accessibility and shared fixes. Commit it as-is as a checkpoint. Some shared changes depend on each other, so keep them as a set:
  - `SURFACE_CLASS` (used by 3 college files)
  - `StatGrid variant="strip"` (used by `college/page.tsx`)
  - the print and `data-stack` CSS

  The light look is superseded by the dark scope, so nothing has to be reverted.
- **Build order.** One slice at a time; show Vaibhav each wave before starting the next. Commit locally per wave. No push or merge without asking.

## Wave 0: environment (Vaibhav runs the sudo step)
1. Vaibhav runs `! sudo systemctl start docker`, and we start the QA Postgres on :5435 (`docker ps -a` to find the container).
2. `npm ci`, because `node_modules` is missing.
3. Start the QA server: `DATABASE_URL=postgresql://findtern@127.0.0.1:5435/findtern_qa QA_REBUILD=1 npm run qa:serve` (port 3500), then `npm run qa:seed`. Never `pkill next-server`; kill by port or PID only.
4. Record the "before" state:
   - `node ~/.claude/skill-library/taste-skill/scripts/inspect.mjs --app <route> --out .taste-skill/before` for every admin route
   - screenshots at 390 and 1440
5. Run the gate once on the WIP: `npx tsc --noEmit`, `npm run lint`, `npm test`. Commit the checkpoint.
6. Deal the app style: `draw.mjs --app --kind admin --theme dark --keep palette,type --screens overview,list,detail,inbox,report,settings --options 3`. Choose between `true-black-flat` and `data-terminal` and write down why.

## Wave 1: foundation (hardest; every admin page changes)
**Shell fork.** New file: `src/components/admin/shell/admin-shell.tsx`, a client component of about 250 lines, replacing the 577-line `ConsoleShell`.
- Import unchanged: `RAIL_COOKIE` (`@/lib/rail`), `breadcrumbsFor` (`@/lib/breadcrumbs`), `allows`/`requiredPermissions` (`@/lib/admin/permissions`), `Logo`, `Sheet`, `csrfFetch`.
- Reimplement: active-href longest-match, crumbs, rail collapse with cookie write, mobile drawer, account menu and bell.
- Drop: the `tone`, `tabs`, `help` and chat branches.
- Root: `className="dark" data-console="admin"`, plus an effect that adds and removes `dark` on `<html>` so portalled dialogs, sheets and the palette render dark.
- One `MotionConfig reducedMotion="user"` at the root.
- `src/app/admin/layout.tsx` changes only its import and the `AdminNavGroup` type. The rail labels and `<main>` stay; e2e tests depend on both.

**Tokens** (`src/app/globals.css`):
- a new `[data-console=admin]` block that remaps brand-600…900 and accent-700 to readable tints on dark
- an admin print reset back to light
- `.apple-spring` retimed to `--duration-admin-fast`
- `focus:outline-none` replaced by a full-opacity `focus-visible` ring (audit P1)

**Primitives, token-only so college is untouched:**
- Replace `bg-white`/`SURFACE_CLASS` with `bg-card` in `panel.tsx`, `stat-card.tsx`, `data-table.tsx` and the roughly 30 admin files the planning agent counted.
- Additive props, with defaults that keep today's behaviour:
  - `DataTable`: `density` (`comfortable|compact|ledger`), `stickyHeader`, `keyboardNav` (J/K/Enter/X), `onRowPeek`, `rowKey`, `footer`
  - `Panel`: `variant` (`plain|inset|rail|well`)
  - `StatGrid`: `"ticker"`
  - `StatCard`: `animate`, and a delta colour that follows the sign (critique P3)

**Motion kit** in `src/components/admin/motion/`:
- `Count` (re-exports `components/app/count-up.tsx`)
- `Arrive` (stagger of 180ms or less)
- `FlipList` (`LayoutGroup` + `layout`)
- `Peek` (`layoutId` morph inside a `Sheet`)

Row→record view transitions are optional progressive enhancement, used only if the Next 16.4 docs in `node_modules/next/dist/docs` confirm `experimental.viewTransition`.

**Command palette** (`command-palette.tsx`):
- built from the permission-filtered NAV groups
- searches records: candidates, companies, invoices (a new `/api/admin/search`, guarded by `requiredPermissions`)
- offers actions ("Score next interview", "Mark payout paid…")
- shows `Ctrl` on non-Mac

**States and plumbing:**
- per-route `loading.tsx` skeletons with `role="status"`
- `admin/error.tsx`
- `AdminLoadError` on Reports and Colleges
- the unread count failure shown instead of being swallowed (`layout.tsx:132`)
- `getSession` wrapped in React `cache()`

**Show Vaibhav:** the shell plus the Dashboard, before going further.

## Waves 2–5: one signature per page (no shared composition)
Each page has one question, one layout archetype that no other page uses, and one signature move. Data source in brackets; **SQL** means new queries, each with a unit test.

| # | Page | Archetype | Signature (motion) | Data |
|---|---|---|---|---|
| W1 | Dashboard | Command-first queue | Palette input as the hero; "Needs you" worked with J/K/Enter; counts tick down as items clear | `tasks[]` + `attentionTotal`; no SQL |
| W2 | Proposal pipeline | Kanban board | Stage columns Sent→Interview→Accepted→Hired with count and ₹ totals; cards FLIP between columns; totals count | new pure `pipelineColumns()` + test over the `load()` rows; lost statuses in a collapsed lane |
| W2 | Candidates | Records table + saved views | View tabs with live counts; Space opens a peek slide-over; score histogram strip (Espresso/Cappuccino/Latte bands) that fills | **SQL**: count FILTER + `width_bucket` histogram |
| W2 | Candidate record | Properties rail + timeline | Left rail of properties with 4-axis score editing; unified timeline (signup→fee→interview→score→offers→timesheets→payouts) that draws itself in | merge Intern360 props client-side; no SQL |
| W3 | Messages | Three-pane mail client | Folder · list · reading pane with reply in place; read state fades | `InboxMessage`; no SQL |
| W3 | Payouts | Due-date strip | Overdue / This week / Later lanes; batch "paid + bank ref"; paid rows strike through and slide out | `loadPlacementDues` + `matchesDue`; no SQL |
| W3 | Companies | Account list with mini funnels | Per-row projects→offers→hires micro-funnel plus an owed column; funnels grow on view | existing loaders |
| W3 | Company record | Account health header + ledger timeline | Paid vs owed bar that fills; ledger-first timeline | `companyLedger`; no SQL |
| W3 | Users | Security lens | Last-sign-in recency heat column and active toggles; recency dots pulse once when fresh | users query |
| W3 | Colleges | Coverage roster | Consent-coverage bar per college plus an officer roster; bars fill | colleges loader, now paged in SQL |
| W3 | Projects | Strip plot + facet rail | Stipend-range strip plot; skill-tag facet rail filters with a FLIP | existing loader |
| W4 | Orders | Split ledger + live invoice | List on the left; rendered `taxInvoiceHtml` in an `iframe srcdoc` on the right that cross-fades per row | invoice rows, now paged in SQL |
| W4 | Intern invoices | Month statement | Grouped by month with promo-code breakdown (these are one-time fees, so not grouped per intern); month headers stick | `promoCodeOptions`; paged in SQL |
| W4 | Transactions | Running-balance ledger | Day separators, in/out direction, running balance column; new rows slide in at the top | **SQL**: UNION ALL + `SUM() OVER`, server-paged |
| W4 | Promo codes | Ticket stubs | Code "tickets" with a usage meter against the limit; meters fill | promo loader, paged in SQL |
| W4 | Reports | Report index / export centre | Cards are links to the reports with last-run time; CSV exports with progress (removes the repeated charts) | existing CSV routes |
| W4 | Analytics | One big funnel | Full-width funnel with the drop-off at each stage; stages grow left to right | existing |
| W4 | Money | Cash-flow waterfall | received − paid out − owed builds bar by bar | `moneyTotals`; no SQL |
| W5 | Website content | Editor + live preview | Marketing block preview beside the field and updating as you type | cms loader |
| W5 | Legal texts | Draft-vs-live diff | Diff gutter between draft and live, plus version list; changes highlight then settle | legal docs |
| W5 | Send notification | Composer + bell preview | Live bell preview of what lands; recipient count counts up as the audience changes | composer data |
| W5 | Notification history | Day-grouped log | Grouped by IST day with read rate per send; read-rate rings fill | history loader |
| W5 | Pricing and fees | Price ladder | Plans on the 0–10 score axis (`parseLegacyScoreBand`) with live GST and USD; a diff before publishing; ladder rungs slide | no SQL |
| W5 | Roles | Inverse matrix | "Who can do X?" lookup with sticky headers; password reset as a masked dialog (replaces `window.prompt`) | roles loader, paged |

**Sameness guard.** Before each wave closes:
- Screenshot every page built so far at 1440 and put them side by side.
- If two share a composition, redo the later one.
- Pages that were not redesigned still go dark through the tokens.

**Audit fixes folded into the pages they live on:**
- unbounded queries → SQL `limit/offset`
- `window.prompt`/`alert` → dialogs and inline errors
- radiogroup/tablist arrow keys
- row checkbox names
- nested scroll boxes
- eyebrow and uppercase labels removed
- Orders title mismatch

## Files to touch (representative)
- New: `src/components/admin/shell/admin-shell.tsx`, `src/components/admin/motion/*`, `src/lib/admin/pipeline.ts` (+ test), `src/app/api/admin/search/route.ts`, per-route `loading.tsx`, `src/app/admin/error.tsx`
- Edited: `src/app/admin/layout.tsx`, `src/app/globals.css`, `src/components/admin/{panel,data-table,stat-card,table-toolbar,command-palette}.tsx`, each `src/app/admin/**/page.tsx`, and the admin components they use
- Not edited: `src/components/layout/console-shell.tsx`, `src/components/app/{primitives,tiles}.tsx`, anything under intern/employer/college

## Verification (every wave)
1. **Haiku agent:** `npx tsc --noEmit`, `npm run lint`, `npm test` (plus `npm run test:security` when a route is added). Reports pass or fail with the failing lines.
2. **Fresh Sonnet reviewer** on the wave's diff: bugs, missed callers, permission guards on new routes, totals that add up.
3. **taste-skill on every touched route:** `lint.mjs --app` and `inspect.mjs --app` at 1440/768/390. Zero FAIL; read every screenshot.
4. **Chromium checks:**
   - keyboard-only pass (palette, J/K, peek, dialogs return focus)
   - reduced-motion pass with `e2e/motion.e2e.mjs`
   - axe serious/critical clean
   - no overflow at 390
5. **e2e:** `npm run e2e` (critical path, which depends on rail labels, `<main>`, intern email and `12,345` on payouts). After Wave 5, also `staging-journey` locally.
6. **No regressions elsewhere:** intern, employer and college dashboards are screenshot-diffed against the "before" shots, and must not change.

**Not covered unless asked:** Safari/Firefox, a screen-reader pass, staging deploy, a light admin variant.
