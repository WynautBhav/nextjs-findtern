# UI/UX direction for the employer and intern consoles (7 Nov 2026)

Written after rendering the live pages (Playwright, 1440 / 390 px) and comparing the candidate search with Upwork's talent search. Read this whole file before touching UI. It is the brief; `PRODUCT.md` is the product truth; `AGENTS.md` still rules.

Skills in force: **impeccable** (`~/.hermes/skills/creative/impeccable`, read its `reference/craft-floor.md` before any UI edit; mode here is **Operate**: scanability, consistency, precision) and **taste-skill** (`~/.hermes/skills/creative/taste-skill/references/app-screens.md`: quiet borders, no glows, no gradient text, no invented vanity numbers).

## What we keep (do not redesign these)

Poppins only. One accent, `brand-700`, under ~5% of pixels. The `console-shell` frame, radius tokens (`rounded-apple-*`), the 44 px touch rule, the `nums` utility, the `Surface` / `Pill` / `EmptyScene` / `PageHead` / `FilterTabs` primitives, the confirm-in-page rule. Marketing pages are out of scope. Employers see **masked** candidates until a hire: initials instead of a name, no contact details, and the photo only if the student uploaded one (owner call 6 Nov: photos show before hire, `src/components/employer/candidate-avatar.tsx`). Do not weaken that. No apply button exists, by design. No invented urgency, no paid ranking, no fake numbers. Data we do not have (the `projects` table has no stipend or duration) is not shown; pay is the score-band hourly rate, read it from `src/lib/employer-pricing.ts` / `src/lib/score.ts`.

## Diagnosis (evidence from the renders)

1. **Candidate cards are noisy and do not say why a person fits.** Every card repeats four rating bars (Comms / Coding / Aptitude / Interview), a 40 px score, two to four buttons, and the same five skill chips. Upwork's card gives one headline, one proof line, rate, a short blurb and ONE primary action. Ours has no "matches 4 of your 5 skills" line even though the page filters by skills.
2. **Masked identity looks broken.** "GV", "SM", "AS" as a title reads like a bug. Masking is a feature, so it must look designed: a deliberate anonymous mark, a readable label ("Candidate GV"), and one line explaining masking, once per page, not per card.
3. **The filter rail eats 40% of the width** and shows five ratings sliders open by default. The required-skills box is a second heavy panel above the results.
4. **Open roles (intern) is a plain text list.** No company-neutral facts grouping, no score-band pay line, no "you match 3 of 5 skills", skills coloured by an unexplained rule, poor scanning. Status pills appear but are small.
5. **Projects list (employer)** repeats the same generic description, shows three equal outline buttons per row, and the page has ~140 px of dead space above the title.
6. **Messages** empty state is two small boxes at the top of an empty page.
7. **Inconsistent card voice on dashboards**: one gradient card, one dark card, white cards, a bar chart with one bar. The intern dashboard says "Nothing is waiting on you right now" and then shows four tiles of unrelated numbers.
8. Icon arrows on every tile (`↗`), tiny uppercase labels, and `eyebrow` kickers above headings (banned by the craft floor: delete them where found).

## Rules (all builders)

- One **primary action per row/card**; secondary actions go in `RowMenu`. A row is a stretched real link.
- Score is shown as **one compact badge**: number plus band word (`8.8 Latte`), never as a 40 px hero on every card. Axis ratings live in Quick view and the profile, as a single compact strip at most.
- Lists people work in are aligned rows or two-line cards with the same left alignment; figures use `nums`.
- No card inside a card. No `border-left` accent > 1 px. No gradient text. No decorative blur. No emoji as icons (lucide only, one stroke weight). No kicker above a heading.
- Every page has: a title from `PageHead`, content that fits its **first viewport at 390 px and 1440 px** without dead space, loading (`Skeleton`), empty (`EmptyScene` with next action and who acts) and error (`LoadError`) states.
- Secondary text `text-text-subtle`; body `text-sm` minimum; contrast AA; focus rings visible; reduced motion respected; **no horizontal scroll at 390 px**.
- Motion: one authored moment per page at most (list reveal or tab change), ease-out, under 250 ms.
- Copy: names the action ("Send proposal", not "Submit"); errors name the problem and the fix.
- Do not change routes, API contracts, SQL, auth, money logic or the masking rules. Presentation and information design only (plus small pure helpers with tests).

## How to verify (do this, do not guess)

The dev server runs on http://localhost:3000 against a seeded local DB (170 interns, 12 employers). Screenshot any page as a logged-in role and then READ the PNG with the `read` tool:

```
node /tmp/shots/shot.mjs employer d /employer/candidates      # d=1440  t=820  m=390
node /tmp/shots/shot.mjs intern m /intern/opportunities /intern/dashboard
FULL=1 node /tmp/shots/shot.mjs employer d /employer/projects   # whole page
```
Output lands in `/tmp/shots/out/<role>-<slug>-<viewport>.png`; the script prints `HORIZONTAL-OVERFLOW` if the page scrolls sideways. Logins (seeded): employer `hiring@northwind.dev`, intern `candidate@findtern.dev` (hired), password `Findtern@2026`; other interns are `*@students.findtern.test` (same password). First load of a route compiles it and can take ~30 s; the script waits. Run each look in one batch (desktop + mobile), fix what the batch shows, look again; stop when two consecutive looks show nothing to fix.

Mechanical check at the end: `~/.hermes/skills/creative/impeccable/scripts/impeccable detect --json <changed files>` once, and fix real findings. Then `npx tsc --noEmit`, `npm run lint` (no new errors), `npm test`.

## Primitives added in U1

Import from `@/components/app/<file>`.

- `avatar.tsx`: `<Avatar name? initials? src? masked? online? label? size="sm|md|lg" className? />`. `masked` gives "Candidate GV (identity hidden until you hire)". Dot has sr-only Online/Offline. Helpers in `avatar-helpers.ts`: `avatarTint(seed)`, `avatarLabel({name,initials,masked})`.
- `score-badge.tsx`: `<ScoreBadge score size="sm|md" />` renders "8.8 · Assured"; `scoreLabel(score)` (also in `score-helpers.ts` with `scoreA11y`). Band words come from `BANDS` (Standard/Skilled/Assured), not plan names.
- `meta-list.tsx`: `<MetaList items={[{icon?, text}]} />`, empty items dropped.
- `match-line.tsx`: `<MatchLine candidateSkills wantedSkills />`; `skillMatch(candidate, wanted) => {matched, missing, total}` in `skill-match.ts` (cap 7, case-insensitive).
- `layout-kit.tsx`: `Toolbar`, `SplitPane {list, detail, stickyDetail?}`, `SkeletonRow`, `SkeletonCard`, `SkeletonList {rows?}`, `InlineStat {label, value}` (put inside a `<dl>`), `Callout {tone: info|warning|success, title?}`.
- `Pill` gained `icon` and `size="sm|md"`. `PageHead` no longer renders `eyebrow` (deprecated prop).
- Console pages wrapped in `container-page section-y` no longer double-pad or leave ~100px blank above the title: `#main > .container-page` / `.section-y` overrides at the end of `globals.css`.

---

# v2 (7 Nov 2026): give the product a face

The v1 pass fixed clutter and removed the noise. The owner's verdict: "bland AI slop". Cause: v1 only subtracted. Every panel is a white card on a near-white ground, every number is the same size and weight, and the Findtern Score (the one thing the business sells) is a 12 px amber pill. Read `~/.hermes/skills/creative/taste-skill/references/app-screens.md` ("Give the product a face") and `impeccable` `reference/bolder.md` again: quiet is the starting point, not the goal.

## References (Awwwards MCP, `awwwards-mcp@1.18.0`, pulled 7 Nov; screenshots in /tmp/aw/)

| Site | What to take | What NOT to take |
|---|---|---|
| Wafer.ai (Honorable Mention, Oct 2026) | Muted, tinted ground; data drawn as the visual (one white line with captioned points); tabular numerals as captions | The cloud photo, the dark pill nav |
| Lev (Oct 2026) | Very large headline set tight against one line of calm body copy; real contrast between 300-weight giants and 500 labels | Full-bleed photography (we have no photos) |
| Signal-A Studio (SOTD) | Hairlines instead of boxes; extreme scale contrast in one block; no chrome | Serif/uppercase display (Poppins only) |
| Serus (HM) | A calm dark dial as the product's emblem on a light page | The purple |
| Nereo | A single glowing primary action on dark | Gradient glow, we are not doing that |

## The face (decisions; do not re-litigate)

1. **Ground.** The console canvas is a tinted mint-grey (`--color-canvas`, defined once in `globals.css`), panels are white on it with a hairline border and no shadow. Never white-on-white. Inside a panel, separate with hairlines, not nested boxes.
2. **Figure face.** Big numbers are Poppins **300**, tracking `-0.04em`, tabular (`nums`), 40-72 px. Their labels are 13 px weight 500 `text-text-subtle`. Everywhere else weights are 400/500/600 only (no 700/800 in the app). Page titles: `text-3xl sm:text-4xl`, weight 600, tracking `-0.03em`, leading `1.08`.
3. **Signature element: the Score Dial.** Findtern's score is the mean of four axes (Communication, Coding, Aptitude, Interview). The dial is a ring of four arc segments, one per axis, each filled to its rating out of 10 in `brand-600`, over a track of `ink-200`; the mean sits in the centre as a light-weight numeral, the band word under it. It exists at four sizes (xs 28, sm 56, md 104, lg 176 px). It replaces the amber pill everywhere: `ScoreBadge` becomes "xs dial + number + band word" on a neutral hairline pill. Amber stops being the colour of the score. No glow, no gradient, no animation beyond a 500 ms stroke-in that `prefers-reduced-motion` disables.
4. **Colour goes on data.** The brand green appears on dial arcs, active nav, the one primary button per screen and positive deltas. Not on chips, borders or icons. Skills chips are neutral (`bg-ink-100`), matched skills get `brand-50` text `brand-800`.
5. **KPIs are type, not tiles.** A figure strip is label + 300-weight number + one quiet hint, separated by 1 px vertical hairlines, inside ONE panel. No icon circles, no per-figure cards.
6. **One hero per dashboard**, dark `brand-950`: the greeting/title in light weight at 40-56 px, a one-line state sentence, the three figures that matter as giant numerals, and the dial on the intern side. Everything below it is flat panels on the canvas.
7. **People as themselves.** Avatars keep their tint (`avatarTint`); masked candidates keep the deliberate masked mark. No change to masking.
8. **Words of the trade.** "Needs your decision", "Waiting on the candidate", "Assured band". Never "Items" or "Records".

## Hard limits (unchanged from v1)

Poppins only, no new dependencies, Lucide only, theme tokens only (add tokens to `globals.css`, never hex in components), no gradient text, no glow, no emoji, no kicker above headings, one primary action per row, no card inside a card, 44 px touch targets, no horizontal scroll at 390 px, loading/empty/error states stay. Do not change routes, API contracts, SQL, auth, money logic or masking.

## Verification per builder

Screenshot every page you touched at `d` and `m` (`node /tmp/shots/shot.mjs <role> <d|m> <path>`), READ the PNGs, fix, look again. Then `npx tsc --noEmit` and `npx eslint <your files>`. Report what you saw, not what you intended.
