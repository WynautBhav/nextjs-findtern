> **Superseded on 29 Oct 2026 by `SPECS.md` and `ARCHITECTURE.md`. Kept for history; do not follow it.**

# DESIGN.md — the logged-in surfaces, rebuilt as one system

## 0. Rules in force (28 Oct 2026). Every signed-in screen follows these

Owner's call, 27 Oct: the signed-in app **matches the marketing site**. One
frame, one type scale, one set of primitives. Reference screen:
`src/app/intern/dashboard/page.tsx`.

**Frame.** `components/layout/console-shell.tsx` is the only shell (intern,
employer, admin and college layouts). Pages never draw their own sidebar,
top bar or outer padding. The rail keeps its links at full size (40px with
a mouse, 44 on touch) and scrolls when the window is short: a thin
scrollbar is always visible, the bottom fades only while there is more
below, and the current page is scrolled into view (QA-144).

**Primitives** (`components/app/primitives.tsx` unless noted). Use these and
don't re-implement them:
- `PageHead` (`title`, `lede`, `eyebrow`, `action`): the page title, one
  `h1` per page. `AdminPageHeader` (`components/admin/panel.tsx`) and the
  employer `PageHeader` (`components/layout/page-header.tsx`) wrap it. When
  a page changes state in place, the heading follows (after "Create drive"
  it is the drive's name, not "New drive"; QA-158).
- `HeroBand`: dark green dashboard hero, at most one per screen.
- `StatTile`: a figure set large, `tone="onDark"` inside `HeroBand`. Admin
  uses one `StatGrid`/`StatCard` strip per page (`components/admin`).
- `Surface`: the card (`rounded-apple-xl`). Admin lists keep `Panel` and
  `PanelHeader` (`components/admin/panel.tsx`).
- `SectionHead`, `Pill` (status), `DetailRow`.
- `EmptyScene` (`title`, `body`, `next`, `who`, `art`): every empty state.
  It says what resolves the state and who has to act. `EmptyState` in
  `layout/page-header.tsx` is a leftover adapter with no callers; don't use
  it.
- Buttons and button-looking links: `buttonClass({ variant, size })`,
  `ButtonLink` or `ButtonAnchor` from `components/ui/button`, with variants
  `primary` / `accent` (amber, the hero CTA) / `outline` / `outlineLight`
  (on dark) / `ghost` / `light` / `white` / `dark` (the "Yes" of a
  destructive confirm) / `link`. No hand-written button class strings.
  `size: "sm"` is 36px with a mouse and 44px on touch.
- `FilterTabs` (`label`, `tabs` of `{ key, label, count }`, `value`, then
  `hrefFor` for URL filters or `onChange` for in-browser ones): status
  filters with counts, in place of a row of tiles that repeat the numbers.
  `role="group"`, not a tablist. It wraps and never scrolls sideways (a
  hidden scroller cut the last tab mid-word, QA-131). `pillTabClass(on)` is
  the one tab look, also for view switches and record tabs. Orders, whose
  panels genuinely switch, keeps real tabs (`tabClass` in
  `components/employer/ui-tokens`).
- Lists people work in are aligned rows, not cards: one grid per list
  (a header row of column labels at `lg`, `aria-hidden`; each row also
  names its figures), figures right-aligned with `nums`, status as `Pill`,
  **one** visible action chosen by state, everything else in `RowMenu`.
  The row's title is a real `<a>` stretched over the row (`after:inset-0`)
  with its own focus ring. On phones the same row stacks into 2 or 3 lines.
  Names and messages wrap rather than truncate where a cut would hide the
  data (company and project names, notification text; QA-140, 143, 156).
- `RowMenu` (`components/app/row-menu.tsx`): the "⋯" at the end of a row,
  on the Radix dropdown (arrow keys, typeahead, Esc). Destructive items
  come last, after a separator, in danger colour. The caller confirms.
- `useConfirm` (`components/app/use-confirm.tsx`): every destructive action
  confirms in the page, never with `window.confirm` (there is none left in
  `src`). `const { ask, dialog } = useConfirm()`, then
  `if (await ask({ title, body, confirmLabel })) ...`, and render `{dialog}`
  once. The body states the consequence; the buttons are "Yes, …" and
  Cancel. **Cancel takes the initial focus**: Enter on a focused delete is
  the one keyboard slip that can't be undone. Esc and an outside click
  cancel. A confirm shown inline in a row or panel (the admin row toggles,
  the college "Close link now") follows the same rules and returns focus to
  the button that asked (QA-159).
- `DriveStatePill` (`components/employer/drive-parts.tsx`): a campus
  drive's state for employers and colleges: "Live now" (with a dot),
  "Opens soon", "Ended", "Closed by the college" ("Link closed" on the
  college side). It never wraps.
- Admin tables: `DataTable` (`components/admin/data-table.tsx`) with
  `TableToolbar`, `Pagination` ("Showing 1–25 of …") and `PageSizeSelect`.
  Below `lg` each row stacks (`[data-stack]` in `globals.css`); on a phone
  the filter selects take the full row and "Rows" drops below them
  (QA-141). Row selection is `bulk-select.tsx`; its checkboxes show on
  hover with a mouse and always on touch.
- Filter rows apply on change (`components/app/auto-submit-form.tsx`): no
  Filter / Apply button. Typed dates are a DD/MM/YYYY text field
  (`DmyDateInput`, admin `DateRangeForm`, or `data-date="dmy"` in an
  `AutoSubmitForm`), never the native date input.
- Detail pages pass `crumbParents` to the shell, so a crumb reads
  "Proposals", never "Proposal / Details".
- Help: on desktop the customer consoles open chat from the top bar's
  "Ask me" button; phones keep the labelled floating button above the tab
  bar (bug sheet 7 asked for it bigger, so it stays labelled). It hides
  while a dialog or sheet is open.
- Secondary text and placeholders use `text-text-subtle` (5.2:1), not
  `ink-500`/`ink-400`, which fail AA on white.

**Touch targets: 44px.** Every link, button, checkbox, radio and switch a
person taps on a phone is a target at least 44px tall (WCAG 2.5.8 asks for
24; we hold 44). Use the `touch:` variant (declared in `globals.css`: a
coarse pointer **or** a screen under 40rem, because phone emulation does
not always report a coarse pointer). Nothing uses `pointer-coarse:` any
more; `ui/button`, `ui/dialog` and `ui/sheet` grow on `touch:` too (QA-104).
The patterns, in order of preference:
- a standalone link: `touch:inline-flex touch:min-h-11 touch:items-center`;
- a small control keeps its look and gains an absolutely positioned 44px
  `::before` (`ui/switch`, `ui/checkbox`);
- a native checkbox or radio sits inside a label that is the 44px target;
- a list row: the stretched title link makes the whole row the target;
- links in a stacked table row get `min-height: 2.75rem` from the
  `[data-stack]` rules.
Links inside a sentence are exempt. Measure with the `::before` and the
enclosing label counted; a bare bounding box under-reports.

**Type floor** (this is what made the app look barebones):
- Body copy, table cells, form labels, list rows: `text-sm` (14px) minimum;
  primary reading text `text-[0.9375rem]` or `text-base`.
- `text-xs` only for meta (timestamps, helper text under a field, chips).
  `text-2xs` only for uppercase eyebrows and badges.
- No arbitrary pixel sizes (`text-[13px]` and the like). Use the scale.
- Figures: `nums` utility, `font-semibold`; hero figures `text-3xl`.
- Section titles `text-base`/`text-lg font-semibold`; page titles come only
  from `PageHead` / `HeroBand`.

**Shape:** radius tokens only, `rounded-apple-sm` (10px, controls),
`-md` (12), `-lg` (14, tiles), `-xl` (20, cards). No `rounded-[Npx]`.
Shadows `shadow-xs`/`shadow-sm`. Borders `border-ink-200/80`.

**Colour:** brand green for primary actions and active states. Amber
(`accent`) for the one thing to do now, and for highlights on dark. Status
always through `Pill` tones, never ad-hoc colour classes.

**States:** every list has an `EmptyScene` that says what to do next; a
failed query shows an error state, never "no data" (`catch {}` returning an
empty list is banned).

**Loading.** Each console segment (`intern`, `employer`, `admin`,
`college`) has its own `loading.tsx`, a skeleton shaped like its pages.
**No loading boundary outside the consoles**: a root `loading.tsx` turned
every not-found page into a 200 (QA-150), so it is gone. Everywhere else
the `NavigationProgress` bar (`components/layout/navigation-progress.tsx`,
in the root layout) runs a thin bar along the top while a client
navigation is in flight; with reduced motion it is a still bar (QA-151).

**Dates and times:** DD/MM/YYYY for typed dates (bug sheet 7). Displayed
dates use `shortDate` / `shortDateTime` from `lib/format.ts`: three-letter
months ("Sep", never en-IN's "Sept"), and no `toLocale*String` at call
sites. A one-day period reads as one date, not "18 – 18 Oct" (QA-152).
Interns see times in IST (labelled); employers see their own zone.

**Privacy rules that look like design:** employers see candidate initials,
never photos or names before hire (bug sheet 7, NC r41).

Plan for the design pass across `/intern`, `/employer` and `/admin` (the
`/college` console joined on 27 Oct and follows the same rules). Product
truth: `PRODUCT.md`. Existing tokens and component contracts:
`docs/design_system.md`, `docs/component_inventory.md`. Before and after
screens: `docs/design/shots/<role>/` (390 / 768 / 1440).

Decisions taken with the user, 2026-10-08: employer keeps the **sidebar**;
admin stat tiles go **monochrome with one accent**; retention ships as
**readiness + milestones + a forgiving weekly streak**; dark mode was to
ship in this pass, but it has not (see §9).

---

**No AI slop. The standard every redesigned screen is judged against**
(owner, 28 Oct: "professional, clean, top notch, premium, cohesive,
impeccable"). A screen fails review if it shows any of these:

- *Template tells:* three equal cards in a row with an icon each; a hero
  with a gradient blob; "stat tile wallpaper" (six identical tiles); an
  emoji or a lucide icon in front of every heading; sparkles / rocket /
  magic-wand icons; purple-to-blue gradients; glassmorphism blur cards.
- *Copy tells:* "Unlock", "Elevate", "Seamless", "Supercharge", "Welcome
  back, 👋", exclamation marks, a tagline under every heading, empty
  states that say "Nothing here yet!", labels that explain the obvious.
  Copy is specific to this product and this user's situation, or absent.
- *Shape tells:* every element at the same radius and the same shadow;
  pills on everything; borders AND shadows on the same card; centred text
  on data screens; uniform `space-y-6` with no rhythm between sections.
- *Hierarchy tells:* no focal point (everything the same weight); a page
  title set like a card title; numbers that aren't aligned; more than one
  accent colour per screen; CTAs that all look primary.
- *Density tells:* one fact per card on a desktop screen; 40 px of padding
  around a two-word label; tables that could be lists, lists that should be
  tables; a modal for something a row could show inline.

What passes instead: one focal point per screen; type doing the work
(weight and size, not boxes); real data density where the user works
(tables, grids) and air where they read; the brand green for structure,
amber for exactly one thing to do; motion only to explain a change of
state; the same component for the same job on every screen; and copy a
person at Findtern would write.

Process: before every screen-group handover, run `/impeccable-critique`
and `/impeccable-audit` on the screens and fix what they find; then, once
the group feels finished, run `/impeccable-polish` as the last pass and
take its changes too (alignment, spacing, consistency, micro-detail); then
the 390 / 768 / 1440 shots; then a reviewer who did not build it (the
orchestrator or a fresh agent) checks the shots against this list. A fail
goes back; it is never merged with a "polish later".

## 1. The diagnosis, honestly

As measured on 8 Oct, before the rebuild; §0 is what holds now.

45 login-required pages. They do not look like one product.

| Measure | Count |
|---|---|
| Competing white-card class recipes | **8** |
| Locally re-implemented primitives (`Metric`, `Row`, `Detail`, `Stat`, `Th`, `StatCard`…) | **21 definitions across 15 pages** |
| Hand-rolled card `<div>`s bypassing `Panel`/`Surface` | **63 across 30 pages** |
| One-off button class strings in the employer area | **11** |
| Table implementations (raw `<table>`, shadcn `Table`, `DataTable`, copied chrome) | **5**, with 5 header treatments and 4 body paddings |
| `status → colour` maps | **4**, two of which disagree on the same literal |
| `humanizeStatus` implementations | **4** |
| Distinct `space-y-*` values / `gap-*` values | **8 / 10** |
| Sidebar-rail widths | **5** (`18/19/20/22rem`, plus a 5-col one) |
| Shell content paddings / responsive breakpoints / topbar strategies | **3 / 3 / 3** |
| `loading.tsx` across the three areas | **0**. `Suspense` in the whole app: **0** |
| `dark:` classes in the 45 pages | **0** |
| `ui/skeleton.tsx` importers | **0** |
| `DetailRow` (exported primitive) consumers | **0** — with 18 hand-rolled `<dt>/<dd>` rows in its place |
| Declared admin tokens (`--text-admin-*`, `--radius-admin-*`, `--admin-gap`, `nums` utility) | **22 + 3, all unused** |
| Pages that swallow a DB outage with `catch {}` and render "no data" | **15** |

And the reason it reads as machine-made is not the token drift — it is that
there is **no focal point anywhere**. Six identical stat tiles in a row is
wallpaper. "None" and "Zero" are set as hero numbers. The trend chart is
decorative. Every surface is white-on-white with hairline borders and pill soup,
so the eye has nothing to land on and nothing that says what to do next.

**What we keep.** The rewrite's admin console is already better than the live
site: consistent sidebar, one accent, real breadcrumbs, a command palette,
proper numeric alignment. The live site's real strengths are elsewhere — its
green profile card on the intern dashboard has more identity than anything in
the rewrite, and it shows far more per candidate row (score, price, four
sub-scores, city, laptop, skills) than our cards do.

---

## 2. Phase 0 — Foundations: one system, once

Nothing visual ships in this phase. It is the boring work that makes every later
phase cheap. Do not skip to Phase 4.

1. **One card.** Keep `Panel` (admin, `rounded-xl`/`ink-200`/`shadow-xs`) and
   `Surface` (intern, `rounded-2xl`/`ink-100`) only if they are genuinely two
   intents — a *panel* in a console vs a *card* on a page. Otherwise pick one and
   delete the other. Retire the 6 remaining hand-rolled recipes.
2. **One status vocabulary.** One `status → {tone, label}` map, exported from
   `components/status.ts`, covering the union of interview / proposal /
   timesheet / payment statuses. It replaces 4 maps and kills the raw-enum
   leaks (`proposals:20-21`, `orders:20`, `schedule:158`,
   `timesheets/[id]:137,187`, `intern/[id]:410`, `proposal/[id]:242`).
3. **Adopt `ui/button`.** `cva` variants already exist and are used **zero**
   times in the employer area. Replacing 11 hand-rolled strings with
   `<Button variant size>` is a mechanical win.
4. **Delete the 21 local primitives.** `Metric` (2 byte-identical copies),
   `Detail`/`Row` (4 copies of `DetailRow`), `Stat`, `Th`, `StatCard`
   (employer's shadows the admin one — rename or delete, never both),
   `humanise`/`capitalise`/`formatDay`, `formatBytes`, `normaliseEntries`,
   `sheetLabel`/`sheetTone`, `STATUS_TONE` ×2, the 4 status-badge variants, the
   4 pill paddings, the 6 skill-chip definitions.
5. **Wire or delete the dead tokens.** `--text-admin-*` (12 declarations),
   `--radius-admin-*`, `--shadow-admin-*`, `--duration-admin-*`, `--admin-gap`,
   `--admin-pad-panel`, `--admin-row-h`, `--admin-sidebar-w`,
   `--admin-content-max`, `--font-admin-data`, `nums`. Adopt the ones with a
   real use (row height, sidebar width, content max, `nums`); delete the rest so
   the file stops lying.
6. **Numerals.** Apply the `nums` utility everywhere a number is displayed in a
   column, tile, or inline figure — Poppins `tnum`, −0.01em. `6.4` and `10.0`
   must occupy identical width or the column is unreadable. Never on prose.
7. **Promote `EmptyScene`.** It is the only empty-state component that meets the
   bar (teaches the next step, says who acts next, has art). The deprecated
   `EmptyState` on 13 employer pages and the 6 hand-rolled admin ones get
   replaced by it and a new admin variant.
8. **Iconography.** One family, 1.5px stroke, 24 viewBox / 20 content. Sizes 12
   (inline), 16 (default), 20 (nav), 32 (empty states). Nothing else. Never
   fill an icon except as the nav selected state.

**Gate:** `npx tsc --noEmit` · `npm run lint` · `npm test` · grep the 45 pages
for the 8 card recipes and 11 button strings → zero.

---

## 3. Phase 1 — One shell

The three consoles disagree about the frame, which is why the same page feels
like a different product per role.

- **Sidebar** 256px, `sticky top-0 h-[100dvh]`, own scroll. The employer sidebar
  today is neither sticky nor full-height, so the whole page scrolls sideways —
  a genuine usability bug, not a taste call.
- **Content padding**: one token, `clamp(1.25rem, 4vw, 2.5rem)`, used by all
  three. Admin `md:px-8`, employer `md:px-10`, intern `container-page` collapse
  into it.
- **Breakpoint**: one. Desktop chrome at `lg` (1024px) everywhere. Today a
  768–1023px tablet gives a candidate a hamburger while an employer gets a
  sidebar.
- **Topbar**: one strategy — sticky, 56px, breadcrumb left, command palette and
  account right.
- **Content max-width**: fluid for admin and employer tables (they carry
  horizontal data); 1200px reading measure for intern prose, which it already
  has via `container-page`.
- **Section rhythm**: one value inside a role area. Currently admin is
  `space-y-6`, intern mixes 8 and 10, employer mixes 3 and 4.

---

## 4. Phase 2 — Loading, empty, error

Cheap, and it is the difference between "a prototype" and "a product".

1. **A `loading.tsx` per role segment**, using `ui/skeleton` (imported for the
   first time), shaped like the page it replaces — table rows for lists, tiles
   for dashboards. Delete the root spinner, which currently replaces the entire
   shell, sidebar included, on first load of any route.
2. **`Suspense` at the expensive queries**, so navigation shows the previous page
   plus a skeleton region instead of nothing. `admin/interns/[id]` does six
   sequential awaits with no boundary.
3. **Kill the 15 bare `catch {}` pages.** Today a total database outage renders
   every employer list as "No projects". Adopt the one page that already gets it
   right — `employer/candidates` distinguishes `loadFailed` from empty — and
   generalise it into the empty-state component so all three roles can.
4. **Empty-state taxonomy** — first-use / no-results / cleared, with the filter
   named and a **Clear filters** action on the middle one. The strongest variant
   is sample data: a new candidate sees what a finished profile looks like, a new
   employer sees what a populated pipeline looks like.

**Where this stands (28 Oct).** Done: a skeleton `loading.tsx` per console
segment, the root spinner deleted, and nothing outside the consoles (the
navigation bar covers it; see §0 Loading). `Suspense` is used on one page.
Empty states are `EmptyScene` everywhere.

---

## 5. Phase 3 — Tables, where the data actually lives

Migrate the 5 implementations onto `DataTable`, then raise its bar:

- **Header**: sticky, 11–12px, **sentence case with positive tracking** — never
  uppercase Poppins, which has no true small caps and whose geometric counters
  uppercase destroys. One header treatment, one padding.
- **Density modes**: 32 / 40 / 48px row height with 12/16/16px cell padding,
  persisted per user. A density mode must not change column widths or the type
  ramp — only rhythm.
- **Numerals** right-aligned with `tnum`; text and status left-aligned with an
  icon; nothing centred except a checkbox column.
- **Zebra off**, 1px row rules one step below the card border. Zebra on tinted
  cards is the single loudest "unstyled grid" tell.
- **No wrapping in cells** — truncate with a `title`, and make an **expandable
  row** the escape hatch. `employer/compare` and `timesheets/[id]` both need
  this: a 42rem-wide raw `<table>` with a sticky first column and no sticky
  header is a worse version of the same idea.
- **Selection**: hover-revealed checkbox, select-all in the header corner,
  Shift-range, Esc to clear. The **bulk bar replaces the toolbar** when a
  selection exists, and stays sticky.
- **Pagination**: explicit counts — "Showing 1–50 of 12,480".
  `admin/payouts` hard-caps at 200 rows with no pager; `admin/roles` and
  `admin/cms` have no pagination at all.

**Where this stands (28 Oct).** Built: `DataTable` with the stacked phone
layout, toolbar, explicit pagination and page size; selection with a bulk
bar. Changed from the plan: cells that hold names or messages wrap (two
lines) instead of truncating, because the cut hid the data (QA-140, 143,
156), and selection checkboxes are always visible on touch, which has no
hover. Not built: density modes, Shift-range selection.

---

## 6. Phase 4 — Admin console: from wallpaper to an ops desk

The rewrite's admin is competent and forgettable. Fix the hierarchy, then make
it editable — "we can only show data" is the complaint, and it is a fair one.

1. **One hero number, not six tiles.** The dashboard opens on a single figure
   that answers "what needs me today", a directional delta **with an explicit
   window** ("+12 this week", never a bare "+12"), and the supporting tiles drop
   to a secondary row. Never render `None` or `Zero` as a hero — a dash, or the
   real state ("No interviews scheduled").
2. **Narrative above numbers.** An attention band is already there and is the
   best idea on the page; make it the top of the console, ordered by what a
   human owes someone — payouts awaiting a bank reference, interviews with no
   link, profiles never scored.
3. **Charts that say something.** Replace the decorative trend line with the
   questions staff actually ask: interview → employer view → shortlist →
   offer → hire, as one funnel with its conversion rates. Adopt Ashby's move:
   every chart ships a one-line "what you are seeing, and how to read it".
4. **Triage with named exits.** Sentry's doctrine, which Linear implements and
   which is what makes an ops console trustworthy: every item leaves the queue
   by exactly one of four paths — not actionable, resolved, accepted, or waiting
   on someone — with a snooze that returns on new activity.
5. **Inline editing in the lists.** This is the "findtern.in can change a thing
   and we can't" gap. The endpoints already exist and have no UI:
   `PUT /api/admin/interns/[id]/approval`, `/status`, `/visibility`, `/ratings`,
   `/skills`, `POST /api/users/[id]/activate|deactivate`. Row-level approve,
   show/hide, activate and a ratings cell that opens inline — using the Watermelon
   **inline-table-control** (`npx shadcn@latest add https://registry.watermelon.sh/r/inline-table-control.json`)
   so the edit does not steal focus. Optimistic update with a rollback, and the
   server's refusal shown verbatim.
6. **Finish the console**: `/admin/companies/[id]` (projects, proposals,
   interviews, payments, upcoming, hired), an editable roles page (the read-only
   matrix is the thing blocking a small team), and `/admin/settings`.

---

## 7. Phase 5 — Employer console: 17 pages onto the system

The employer area has never been through the primitives rebuild. It is the
densest divergence in the codebase and it is the surface that pays.

1. **Candidate card.** Score is the hero: the band name, the number at 32px in
   `brand-700` with `tnum`, and the four sub-scores as one compact four-column
   meter rather than a sentence of `AI Interview Ratings: 9.9 · Communication:
   7.8 · …`. Add what the live site shows and we do not: hourly price next to
   the score, city, laptop. Actions become a single primary (Shortlist) plus a
   quiet row, not three equal outline buttons.
2. **Compare** as a real comparison matrix — sticky name column, sticky header,
   aligned numeric rows, per-row verdict on which candidate wins each axis —
   instead of a 42rem raw table with 11 local primitives.
3. **Timesheet review is the daily-use surface.** It deserves the most care in
   the whole employer area: a day grid with P/A/F/H, hours tallied per week,
   approve/reject with an optional note, and an export. Everything else is
   occasional.
4. **Cart → checkout as one flow** with a sticky order summary, instead of two
   pages that re-derive totals.
5. **Schedule** keeps the four actions built earlier, presented as a state
   machine rather than a button row — reminder / reschedule / feedback / missed
   are only meaningful at particular points in an interview's life.
6. **Navigation** stays the sidebar, per your decision.

---

## 8. Phase 6 — Intern app + retention

Retention work, held to one rule: **raise the volume and quality of evidence
behind the score, not screen time.** The metric that replaces DAU is *shortlist
rate per interview taken* and *median days from first interview to first
employer view*.

1. **Recruiter readiness**, not "profile strength" — a name that is a statement
   about visibility rather than a judgement of the person. Teal's model is the
   proof it works: a resumable list of concrete issue cards, each naming the
   exact field to fix, with a live count of what is left. Seven steps, ordered
   by value, with "take the interview" clearly the big one.
   **Cap the meter below 100%** — LinkedIn kept a white sliver at the top of its
   dial on purpose.
2. **Milestones phrased as visibility unlocks.** "You've crossed 7.0 — you're
   now visible to employers who shortlist at 7 or above" is a capability
   statement. "Level 4 unlocked" is vanity. One-time, non-repeatable, career-
   meaningful: first interview, first score read, first employer view, first
   shortlist, first interview booked, first offer. One 400ms celebration each,
   `--ease-emphasized`, and nothing loops.
3. **A forgiving weekly streak**, per your decision, built on Duolingo's own
   published A/B results rather than on the popular version of the idea:
   - **Weekly, not daily.** The users are students with exams and placement
     season; a daily streak in a product needed a few times a month manufactures
     guilt against real usage.
   - **User-chosen cadence and a grace period** — Duolingo's Streak Wager
     (+14% day-7 retention) and opt-out duration both beat rigidity.
   - **Never notify on a broken streak.** Their own copy guidance rejects
     "You dropped 12 days!".
   - **Switch unit past ~30.** 2→3 days reads as +50%, 200→201 as +0.5%.
     Beyond 30, show "7 interviews completed" or "top 20% of your cohort".
4. **Never let readiness move the score.** The score is an assessment outcome —
   stable, explainable, moving only on real signal. Readiness is a profile state
   the user controls. Two separate meters, never linked.
5. **The transparency moat.** The candidate gets **the same score report the
   employer sees** — per-axis scores, what each axis means, and what to do next.
   Research on this category is unambiguous: candidates' distrust of AI
   interviewing comes from the absence of a reciprocal element, and the same
   study finds applicants "feel unseen and devalued". This is also the cheapest
   differentiator against a market of paid badges.
6. **Keep the live site's best asset.** Its green profile card has more identity
   than anything in the rewrite. Bring the gradient identity back, with our
   typography and spacing.
7. **Badge rules**, if any ship: free, verifiable, and legible to a stranger in
   ten seconds — verified identity, score stable across three sittings, full
   battery completed. Each links to its evidence. A badge that cannot be
   verified by an employer in ten seconds gets deleted.

**Explicitly not doing:** paid badges or boosts · a global student leaderboard
(it manufactures exactly the hierarchy harms you do not want in an 18–24
audience, and its motivational effect declines as the population grows) · XP
economies layered on a score that already means something · confetti · streak-loss
notifications · invented countdowns (a coaching platform was fined for exactly
that under the CCPA Dark Patterns Guidelines, 2023).

---

## 9. Phase 7 — Motion and dark mode

**Motion.** Five durations cover the product: instant 50ms, fast 100–120ms, base
150–200ms, medium 250–280ms, slow 400–600ms. Four easings, no others: out
`cubic-bezier(.22,1,.36,1)`, emphasized `cubic-bezier(.05,.7,.1,1)`, in
`cubic-bezier(.4,0,1,1)` for exits only, soft `cubic-bezier(.4,0,.2,1)`. Animate
`transform` and `opacity` only. Exit runs ~75% of entrance. Never `ease-in` on
an entrance. Never bounce on functional UI — one exception, once, for a real
milestone. The frequency rule: if someone triggers it dozens of times a day, it
is under 150ms; a table row hover fires hundreds of times a day, so it is 50ms,
hard cap. At most two simultaneous animations, stagger ≤6 items × 30ms,
`prefers-reduced-motion` drops to 0ms rather than to an alternative.

The three shells currently disagree — intern uses `--dur-*` tokens, admin and
employer use bare `transition-colors`. One token set.

**Dark mode: not shipped.** The `dark` variant and its token values are
declared in `globals.css`, but nothing sets the `.dark` class, so every
console renders light. The plan below stands for when it is picked up:

- Strategy (C) — dark marketing, light product. Both consoles stay light by
  default; dark is a genuine preference, not the default reading surface.
- Surface ladder 3–4 steps at ~4–6% luminance delta, borders as translucent
  white at 0.05–0.08 (never grey hex), border contrast one step up vs light,
  accent desaturated ~15–20% and lifted, text `#fafafa`–`#ededf3`, never pure
  white.
- **Poppins-specific**: thin strokes disappear on dark and the geometric bowls
  halo. Minimum weight 400 on dark, 450–500 for body. Never 300.
- Define the tokens and apply to the 45 pages **after** Phase 0, or you style
  everything twice.

---

## 10. Phase 8 — Finally, the polish pass

After the system holds: run the mechanical detector over the changed surfaces
once, screenshot desktop and mobile together, fix everything that pass shows in
a single batch, confirm once, stop. Then the beautification pass proper — the
one you originally wanted — on top of a system that can hold it.

---

## 11. Sequencing and effort

| Phase | Why it is here | Rough size |
|---|---|---|
| 0 Foundations | nothing visual is cheap until this lands | large, mechanical |
| 1 Shell | fixes a real scroll bug and the tablet inconsistency | small |
| 2 Loading/empty/error | cheap, and it is what "not a prototype" means | small |
| 3 Tables | the data lives here | medium |
| 4 Admin console | hierarchy + the editing gap you flagged | large |
| 5 Employer console | the surface that pays | large |
| 6 Intern + retention | the surface that retains | large |
| 7 Motion + dark | needs a stable system underneath | medium |
| 8 Polish | last | small |

Phases 0–3 are unglamorous and change almost nothing you can see in a
screenshot. That is the point: they are what makes 4–8 land as one product
instead of three.