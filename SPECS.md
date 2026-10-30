# SPECS.md: the intern and employer consoles, specified

Locked 29 Oct 2026. This file replaces `DESIGN.md` as the design and UX
source of truth. Read `ARCHITECTURE.md` first. Change this file only on an
owner decision, and log the change in §9.

**Priority, in this order:** no bugs (security, data, money) → the flows
work end to end → clear UX → a calm, premium look. A screen that looks
good but loses data has failed.

**In scope:** `/intern/**` and `/employer/**`. Admin and college keep
working and follow the same rules whenever a shared file changes, but they
are not being redesigned in this pass.

---

## 1. What is wrong today (measured 29 Oct, intern + employer code)

| Problem | Evidence |
|---|---|
| No spacing system | 10 different `space-y-*` values and 12 different `gap-*` values. This is the "weird spacing". |
| No page templates | Each page invents its own layout, so the same job looks different on each screen. |
| Oversized files mixing jobs | `candidates/page.tsx` has 1155 lines, `send-proposal-form` 975, `onboarding-form` 737. |
| Contrast failures | `text-ink-400/500` used for text 21 times. Both fail WCAG AA on white. |
| Locale-dependent dates | `toLocale*String` called directly 7 times. |
| Open bugs | QA-008, 011, 012, 014, 107, 108, 109, 113, 114, 115, 116, 117, 126, 152, 153, 154 (`docs/qa/bug-ledger.md`) |

## 2. Design direction

**Calm, dense where people work, airy where they read.** Think of Linear's
lists, Stripe's dashboard detail pages, and Apple's settings forms. It
should feel like a tool someone trusts with money and hiring, not a landing
page.

- **One focal point per screen.** The single thing to look at or do next
  is the largest or the only amber element. Everything else is quieter.
- **Type and spacing do the work, not boxes.** Fewer cards, fewer borders,
  fewer pills. Group things with whitespace first, a divider second and a
  card last.
- **Same job, same component, on every screen.**
- Brand: green (`brand-700`) for structure and primary actions. Amber
  (`accent`) for at most one call to action per screen. Poppins only.
  The values live in `globals.css`.

**Banned (the "AI template" look):** three equal icon cards in a row; a
row of six identical stat tiles; an icon in front of every heading;
glass and glow; a border and a shadow on the same card;
centred text on data screens; "Unlock / Elevate / Seamless", exclamation
marks, "Welcome back 👋"; every button looking primary; a tagline under
every heading.

**Dashboards are the exception (owner, 30 Oct; see §9).** A dashboard is
a bento of tiles, measured from the reference shots (Donezo, Coursue,
logip): a framed canvas (`ink-100`, 12px inset) holding a white inset rail
and white tiles; a row of at most four key-number tiles, exactly one
filled with the brand (a `brand-600 → brand-950` gradient, the only
gradient on the screen); one chart in plain markup (no chart library) with brand bars and a
hatched pattern for "not sent yet"; every tile has a title row with one
round action in its top-right corner. Tiles are white with a soft shadow
(`shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_-12px_rgb(7_47_36/0.10)]`)
and **no border**. Key numbers sit right under their `text-sm` label,
`font-medium`, sized to the tile (`clamp(2rem, 16cqi, 3.25rem)`) so a
figure never wraps; a long value splits into a value and a grey unit
("11 Oct" + "2026"). No sparkline, meter or ring on a key number
(taste-skill: "KPIs are type, not tiles"; impeccable craft floor). The brand tile carries
faint white contour lines, the one textured surface on the screen.
The key-number row settles in (the one entrance) and bars grow from the baseline, under `motion-safe:` only. A tile shows only a number the database has: a
tile with nothing true to show is left out, never filled with a zero.

## 3. Foundations

### 3.1 Spacing: one scale, fixed jobs

Base unit 4px. **These are the only allowed values in intern and employer
code.** Anything else is a lint failure once `check:rules` exists.

| Job | Class | px |
|---|---|---|
| Icon to its label, a figure to its unit | `gap-1.5` | 6 |
| Items in a row (chips, buttons, meta) | `gap-2` | 8 |
| Cells in a list row, label stack | `gap-3` | 12 |
| Form fields, a section heading to its content, grid of tiles | `gap-4` / `space-y-4` | 16 |
| Padding inside a card or panel | `p-5` (phone) / `lg:p-6` | 20 / 24 |
| Between sections of a page | `space-y-8` (phone `space-y-6`) | 32 / 24 |
| Page head to first section | `mb-8` (phone `mb-6`) | 32 / 24 |

Tight meta lines (a timestamp under a title) may use `gap-1`/`space-y-1`.
Nothing else: no `2.5`, `3.5`, `5`, `10` or `0.5`.

### 3.2 Type: roles, not sizes

| Role | Class |
|---|---|
| Page title (only through `PageHead`) | `text-2xl font-semibold` |
| Section title | `text-lg font-semibold` |
| Card or row title | `text-base font-medium` |
| Body, table cell, form label | `text-sm` (14px floor) |
| Meta, helper text, timestamps | `text-xs text-text-subtle` |
| Eyebrow, badge | `text-2xs uppercase tracking-wide` (badges only, never headings) |
| Figures | `nums font-semibold`; the hero figure is `text-3xl` |

Weights 400 / 500 / 600 only. No 700 in the app. No arbitrary sizes.
Secondary text is `text-text-subtle`, never `ink-400/500`.

### 3.3 Surface and shape

- Page background `surface` (ink-50). A card is white with
  `border-ink-200/80` and **no shadow**. Shadows only on floating things
  (menus, dialogs, sheets, toasts).
- Radius: controls `rounded-apple-sm`, cards `rounded-apple-xl`. Nothing else.
- A card is a container you can act on as a unit. A section of reading
  content is not a card: it is a heading plus content on the page
  background.

### 3.4 Layout

- **Breakpoints:** phone < 768, tablet 768–1023, desktop ≥ 1024 (sidebar
  shown), wide ≥ 1440. Tested widths: **375, 768, 1440**.
- **No horizontal page scroll at 375. Ever.** Tables stack into rows on
  phones.
- Content max widths: list and table pages fill the console (max 1440).
  Forms use `max-w-2xl`, one column. Reading text is capped at 70ch.
- Detail pages: main column plus a sticky aside at desktop (`lg:grid-cols-[1fr_20rem]`).
  On phones the aside comes first if it holds the primary action,
  otherwise after the main column.

### 3.5 Touch, focus, motion (rules from closed QA bugs)

- **44px tap targets** on touch for every link, button, checkbox, radio
  and switch (QA-104/116/154). Use the `touch:` variant. Small controls get
  a 44px `::before`.
- Visible focus ring on everything focusable (`ring-2 ring-ring
  ring-offset-2`). Keyboard reaches everything, in visual order.
- Motion explains a state change, nothing else. 120–200ms, `transform`
  and `opacity` only. With `prefers-reduced-motion`, animations take 0ms.

## 4. Components: one per job

Use these. If one is ugly or wrong, **fix it in its file** (the fix then
reaches every screen). Never write a local copy. Components listed as
"rework" are rebuilt to this spec in P1.

| Job | Component | Status |
|---|---|---|
| Page frame, sidebar, top bar | `ConsoleShell` (`tone="light"` for intern: framed canvas, white inset rail, every page listed, FAQ in the rail footer, contact and email in the account menu) | keep, tune spacing |
| Page title, lede, one action | `PageHead` | rework to §3.2 |
| A container you act on | `Surface` | rework to §3.3 (no shadow) |
| Section heading plus its action | `SectionHead` | keep |
| Status | `Pill` + one status map | rework, one map for all statuses |
| Key-value details | `DetailRow` | keep |
| Filters with counts | `FilterTabs` | keep |
| Row actions | `RowMenu` (one visible action plus "⋯") | keep |
| Buttons | `Button` / `ButtonLink` from `ui/button`, variants `primary`, `accent` (max one per screen), `outline`, `ghost`, `link`, plus a destructive variant | keep, no hand-written button classes |
| Confirm a destructive or irreversible action | `useConfirm` (Cancel takes focus, "Yes, …" confirms) | keep |
| Empty state | `EmptyScene`: what happened, what to do, who acts | keep |
| Error state | one `LoadError` with retry | consolidate (`load-error`, `route-error`) |
| Loading | skeleton shaped like the page (`ui/skeleton`) | keep |
| Dashboard hero | `StatTile` row + `Tile` bento (`components/app/tiles.tsx`) | D1 decided 30 Oct |
| Lists people work in | aligned rows: title link stretched over the row, figures right-aligned with `nums`, status `Pill`, one action plus `RowMenu`; stacks on phones | rework into one `ListRow` |
| Form field | label, control, helper or error text below; one shared `Field` | build in P1 (onboarding has its own `fields.tsx`; promote it) |
| Dates | `DmyDateInput` (DD/MM/YYYY) | keep |
| Side panel for detail without leaving the list | `ui/sheet` | keep |
| Toast for a finished async action | to be added from the Watermelon registry | add in P1 |

New primitives come from the Watermelon registry
(`npx shadcn@latest add https://registry.watermelon.sh/r/<name>.json`),
then are restyled to these tokens.

## 5. Page templates

Every intern and employer page is one of these. Name the template in a
comment at the top of the page.

1. **Dashboard** (`/intern/dashboard`, `/employer/dashboard`):
   `PageHead`, then the key-number row (≤ 4 `StatTile`s, one brand-filled),
   then a bento of `Tile`s: the one thing waiting (the only amber button),
   one chart, the activity, and the glanceable facts. Each tile's corner
   action goes to its list page. See the §2 exception.
2. **List** (proposals, timesheets, candidates, orders, interviews,
   notifications, opportunities, projects, drives): `PageHead` with the
   primary action, `FilterTabs`, then `ListRow`s, then pagination or "load
   more". Empty, no-results (with "Clear filters") and error states are
   three different screens.
3. **Detail** (proposal, intern profile, timesheet, drive, opportunity):
   breadcrumb, `PageHead` with status `Pill`, main column (sections of
   `DetailRow`s), aside with the primary action and key figures.
4. **Form / wizard** (onboarding, send proposal, bank details, settings):
   one column, `max-w-2xl`, fields grouped in titled sections, actions
   bottom right (sticky on phones). Wizards show "Step n of N", keep their
   place on reload (QA-107) and let you go back.
5. **Flow** (cart → checkout, accept offer): a sticky summary aside with
   the total, which is computed on the server.

## 6. Behaviour rules (every screen)

- **Every async action has four states:** idle, pending (button disabled
  with a spinner, label kept), success (toast or inline confirmation,
  then the data refreshes) and error (the server's sentence, inline, input
  kept).
- **Forms:** validate on blur and on submit, never on each keystroke.
  Errors sit under the field and focus moves to the first one. A disabled
  submit button says why. Number fields are numbers (QA-126). Dropdowns
  are used for city, state, country and bank.
- **Destructive or irreversible actions confirm** (withdraw, reject,
  delete, pay; QA-115). The body states the consequence.
- **Counts agree.** A number in a hero and the list it points to come from
  the same query (QA-008).
- **Saved data shows as saved.** A form with stored data opens filled or
  in a read-only view with an "Edit" button (QA-011).
- **Text never clips data.** Names and messages wrap. Truncation only with
  a `title` and only where the full value is one click away (QA-117).
- Copy: plain, specific, second person, no exclamation marks. Status
  labels come from the one status map. Hidden company copy reads naturally
  (QA-108).
- Privacy: employers see initials until an offer exists. Interns see times
  in IST, labelled.

## 7. Definition of done (per screen group)

A group is merged only when **all** of these hold:

1. `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run test:security`
   → `npm run db:verify` → `npm run build`, all green. `npm run e2e` is
   green if a flow was touched.
2. `npm run check:rules` passes (once built).
3. Screenshots at 375 / 768 / 1440 for every page in the group, with
   realistic seeded data **and** the empty state, saved in
   `docs/design/shots/<role>/<page>/`.
4. No horizontal scroll at 375, all tap targets ≥ 44px, no console errors,
   and axe reports no serious or critical issues.
5. Every QA ledger entry for those pages is closed or explicitly
   re-scoped by the owner.
6. Reviewed against §2–§6 by someone who did not build it (a fresh agent
   or the owner), using the screenshots. A fail goes back. Nothing merges
   as "polish later".

## 8. The plan

The frog goes first: **P1, the foundation.** It is the riskiest step,
because it touches files every console uses, and it fixes the most
clutter per line changed. Page work done before it would be redone.

| # | Phase | Contents | Exit |
|---|---|---|---|
| **P0** | Baseline (½ day) | `npm run shots` of all 35 intern and employer pages at 375/768/1440. Score each against §2–§6 and log new issues in the ledger. | Baseline shots committed, issue list per page. |
| **P1** | **Foundation (the frog)** | Rework `PageHead`, `Surface`, `Pill` + one status map, `ListRow`, `Field`, `LoadError`, toast. Tune `ConsoleShell` spacing. Build `scripts/check-rules.ts` (spacing allowlist, `text-[Npx]`, `rounded-[`, `ink-400/500` text, `toLocale*String`, `window.confirm`, `catch {}`, write routes without `requireMutation`) and wire it into CI. Fix the systemic bugs: tap targets (QA-116, 154) and clipped text (QA-117). | Admin and college shots show no regressions; rules check is in CI. |
| **P2** | Intern daily surfaces | dashboard, timesheets, proposals + detail, interviews. QA-108, 152, 153. | §7 |
| **P3** | Employer daily surfaces | candidates (split the 1155-line page), timesheets + review, proposals + proposal detail, dashboard. QA-008, 014, 113, 115, 117. | §7 for the group. |
| **P4** | Forms and flows | intern onboarding (QA-107, 109), employer onboarding (QA-114), send proposal (QA-126), cart → checkout, settings and bank details (QA-011), account (QA-012). | §7 |
| **P5** | The rest | intern profile, documents, earnings, record, college, opportunities, notifications; employer compare, schedule, orders, projects, drives, alerts. | §7 |
| **P6** | Verification | Full e2e per role, a 375 + 1440 sweep in Chromium and WebKit, ledger at zero P1 and zero P2 for intern and employer, owner walkthrough. | Owner sign-off. |

**Owner decisions to confirm** (defaults apply until answered):
- **D1, dashboard hero:** *Decided 30 Oct: key-number row with one
  brand-filled tile, then a bento (§2 exception).*
- **D2, density:** list rows at 56px (comfortable) or 44px (compact) on
  desktop? *Default: 56px for employer candidates, 48px elsewhere.*
- **D3, dark mode:** out of scope for this pass? *Default: yes, out of scope.*

**Each session:** start by reading `ARCHITECTURE.md`, this file and the
open ledger entries for your group. Work on a short branch (ARCHITECTURE
§8). End with the §7 checks, ledger updates and an entry in §9 if a rule
changed.

## 9. Changelog

- 29 Oct 2026: written. Replaces `DESIGN.md` (owner: "it doesn't help
  much"). Rules kept from it, because they fixed real QA bugs: 44px
  targets, Cancel takes focus, DD/MM/YYYY dates, initials before hire,
  `text-subtle` contrast, no root `loading.tsx`.
- 29 Oct 2026: owner put intern first, so P2 is now intern and P3 employer. P1
  starts with the primitives intern pages use; D1's default (plain focus
  block, no dark band) is applied to intern Home and Stipend.
- 30 Oct 2026: owner decision ("this is the level of designing we need to
  achieve no less", reference shots in `~/Desktop/reference findtern`).
  Dashboards become a bento (§2 exception): key-number row with one
  brand gradient tile, soft-shadow borderless tiles, one chart with a
  hatched "not sent yet" pattern. Gradients leave the banned list for that
  one tile. The intern console gets `ConsoleShell tone="light"`: framed
  canvas, white inset rail with every page still listed (folding "More"
  hid real pages and was reverted the same day), FAQ in the rail footer,
  contact and email in the account menu.
  Employer, admin and college keep the dark rail for now. D1 closed.
- 30 Oct 2026: owner ran the impeccable audit fixes ("missing that wow
  factor"). Key numbers sized to the tile (₹25,000 broke mid-figure at
  1440px); number tiles lose their empty middle and gain a mini picture;
  contour texture on the brand tile; chart starts at the first logged
  month and marks the current one; named companies get their mark on
  activity rows; Home's subtitle is the role, company and day count;
  entrance motion.
- 30 Oct 2026: owner: every intern page to the same level, cohesive but not
  identical; impeccable + taste-skill (`.claude/skills/design-taste-frontend`)
  both apply. Each screen answers its own question with its own signature
  element: Home the hours chart, Timesheets the open sheet as a month
  calendar (every kind of day its own mark) beside the days left to mark,
  Stipend one segment per month of the internship, Offer its terms as key
  numbers. `Surface` takes the tile look inside the light console
  (`LIGHT_TILE`). Timesheet editor: a "Work done or remark" column on every
  day (hours on Present days; a remark on any day that has happened; days
  ahead say when it opens). No eyebrow above a heading anywhere (impeccable
  ban). Mini bars, score meter and rings removed from key numbers.
- 30 Oct 2026: owner: the timesheet editor "looks boring"; finish the rest of
  the intern side with impeccable + taste. Editor: the month as a sticky
  rail (the same calendar, each day a link to its row, kinds counted, the
  send action), days grouped by week, one quiet four-way switch per day in
  place of four outlined boxes, each day's date wearing its calendar mark;
  days ahead show a locked "Remark opens on <date>" field. Interviews: AI
  scores on one shared 0–10 scale with the strongest and lowest named (the
  report is shared with the employer view). Offers: the money leads each
  card, status pills under the title. Documents: a gallery of the files
  themselves, grouped by what they are for, with PAN-on-file stated.
  Profile: the anonymous card employers see before a hire, drawn from the
  profile. Notifications: grouped by IST day. Settings: the bank account as
  a card. Open roles: skills you have are marked. College: the form on the
  tile surface.
- 30 Oct 2026: layout pass (impeccable layout + taste). Timesheet editor
  splits month and days by its own width (container query, 56rem), not the
  screen's, so 1024 px stacks the month on top; rows separated by a quiet
  divider, tighter inside. Key-number row: 12rem columns and subgrid rows,
  so labels, figures and notes line up across a row (the figure carries its
  own @container: containment on the tile switches subgrid off). Home: an
  odd last tile in the side column spans both columns. AI scores use one
  `ScoreScale` on Home and Interviews; it stacks in narrow tiles.
