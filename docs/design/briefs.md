# Design briefs: the signed-in app (WP2, 28 Oct 2026)

What each screen is for, what should get the space, what is wasted now, and
the form it should take. These briefs come before any redesign commit so the
thinking can be reviewed first. The standard is DESIGN.md §0, including the
"No AI slop" list.

**Evidence.** The "before" screenshots are in `docs/qa/baseline/<role>/`
(`<route>-1440.jpeg`, `-768.jpeg`, and at 390 both `-390-top` and
`-390-bottom`). They were taken by `scripts/design-shots.mjs` on the seed
database, so the data is fictional and safe to commit. The same set was also
taken on the scrubbed live copy and kept out of the repo, because it
contained real names. The seed data is thin in places (an "approved"
timesheet with 0 days, a hired intern whose offer still reads "accepted").
Where a brief depends on fuller states, it says so.

**Who wrote what.** The shell and employer briefs are mine. The intern, admin
and college briefs were drafted by three separate agents, each working from
the shots and the source, and then edited by me: corrections are marked
*[ed.]*. I review every group against §0 before handover.

## Research: what we take and what we leave

- **Linear, Stripe dashboard, Vercel.** We take their structure and their
  restraint, not their colours or gradient heroes:
  - one page title with no tagline;
  - a single toolbar row (search, 2–3 facets, everything else folded);
  - status filters as segmented tabs with counts, instead of a row of tiles
    repeating the same numbers;
  - dense 40–48px rows with right-aligned tabular figures and row actions in
    the last column;
  - details on their own page with a facts rail;
  - empty states that name the next action in one line.
  - Stripe's "one figure that matters, in the header line" replaces our tile
    rows. Linear's quiet inline row metadata replaces our pills on
    everything.
- **Wellfound and Internshala (the candidate side).** Both show roles and
  candidates as scannable lists, not tall cards. Internshala's candidate
  cards are the cautionary example: a wall of equal cards with every action
  repeated. Our employer candidates page is drifting there.
- **Watermelon registry (`@watermelon`, 1,178 items, read 28 Oct).** Most
  items are animated showpieces: 3D cards, progressive blur, card swipes,
  "AI agent" pickers. That is the slop list in component form, and none of
  them will be installed. Plain candidates, only if our own primitive can't
  do the job: `data-table`, `inline-table-control` (admin inline edits),
  `continuous-tabs` (segmented filters), `pagination`. Each would be read
  before installing, and its base variant restyled to our tokens.
- **Skills used.** impeccable critique, audit and polish per group, in that
  order, as DESIGN.md §0 requires. No new skills installed.

## Shared changes, made once and used by every role

1. **The "Ask me" launcher (`chat-widget.tsx`).** It is a 64px gradient pill
   with a glow, both of which are slop tells, and it covers content on every
   screen:
   - at 1440: scores, "View" links, rail figures, the college student search;
   - at 390: CTAs, the last card, and the third tab of the college tab bar,
     so **Roster can't be reached on a phone**.

   It becomes a 44px solid icon button, placed above the phone tab bar, and
   pages get bottom padding equal to its height. Admin already hides it.
2. **Status-filter tabs replace tile rows.**
   - Employer proposals, timesheets and orders, and many admin lists, open
     with 3–4 equal tiles that repeat the counts the list could filter by,
     some holding words ("No hires yet", "None") instead of figures.
   - One `FilterTabs` primitive (segmented, with counts, URL-driven) replaces
     them. A screen keeps at most one focal figure, in the header line.
3. **Row actions.**
   - Edit / Withdraw / View on every proposal row, and four actions on every
     project card, repeat the same buttons down the page.
   - The row itself becomes the link. Secondary actions go into a `⋯`
     overflow menu (one shared component). Only the one action that matters
     for the row's state stays visible.
4. **Dates.**
   - Native `mm/dd/yyyy` inputs in the employer schedule filter, eight admin
     filters and the college drive builder break the DD/MM/YYYY rule.
   - One DD/MM control, applied on change, with no separate Filter / Apply
     button.
5. **Breadcrumbs.** Dynamic segments read "Details", "Intern", "Students /
   Students" and "Company Profile" (Title Case). Every detail page will pass
   its own crumb label (the record's name), and labels are sentence case.
6. **Sidebar.**
   - At a 900px-tall window, nav items below about the 9th scroll inside the
     sidebar: employer Alerts, admin Payouts and below.
   - Tighter group spacing, and the daily queues come first.
   - *[ed.]* The "sidebar stops at 900px" seen in full-page shots is a
     screenshot artefact (the sidebar is sticky and fills the viewport), not
     a bug.

## Order of work (riskiest first)

1. **Shell + employer.** Densest flows (candidates, proposals, timesheets).
   It introduces the shared pieces above, so it is most likely to change the
   primitives the other groups reuse.
2. **Admin.** One table pattern across 20 lists, plus phone triage.
3. **Intern.**
4. **College.**

Each group: critique → audit → fixes → polish → 390/768/1440 shots →
self-check against §0 → handover.

## Found while briefing: not design, filed for the ledger

These are data or logic disagreements that a redesign would only expose. I'm
passing them to the tester for `docs/qa/bug-ledger.md` and not fixing them
under a design commit:

- **Employer:**
  - Orders shows "3 payments due" (header CTA) beside a "Still to pay:
    Nothing outstanding" tile.
  - The dashboard hero says "4 things need you" over a 2-item "Waiting on
    you" list.
  - The candidate profile shows preferred cities as "Bengaluru, Bengaluru,
    Remote" (no dedupe).
  - Account says "Profile complete" while required escalation-contact fields
    are empty.
  - A timesheet with 0 days filled was approved.
- **Intern:**
  - Two different Findtern scores on different screens: 8.8 / Coding 9.3 on
    Home, Interviews, Profile and Offer, and 8.2 / Coding 8.5 on Record.
  - Role detail tells a hired intern "You have an offer for this role".
  - Settings shows an empty bank form to a paid intern, with no saved read
    state.
  - Record shows a raw ISO date ("2026-10-30").
- **Admin:**
  - Hires show as 0 (pipeline, analytics, companies) and as 13 (reports,
    dashboard).
  - Transactions reports "Received ₹0" while orders reports ₹2,80,000
    collected.
  - The companies list shows Northwind with 0 projects and 0 proposals,
    while its detail page shows 3 and 9.
  - "Avg hiring speed −9.8 days".
  - The account page states two different password rules.
  - Candidate detail shows the full Aadhaar and PAN numbers.
- **College:**
  - The drives list puts a closed drive above the live one.
  - A new employer who signs up from `/drive/[token]` loses the drive link
    (no `next`). Source reading only; needs verifying.
  - `/drive/[token]` has no error handling on its query.

---

## Employer

### /employer/dashboard: Home
- **Job.** Daily: what is waiting on me (pay, pick up a meeting, approve
  hours), and who is worth looking at.
- **Deserves the most space.** The "Waiting on you" list. It is the real
  action list, ordered by who is blocked.
- **Wasted now.**
  - The hero headline "4 things need you" counts something different from
    the list below it (2 items).
  - Its four tiles (Awaiting a reply 6 / Accepted, to pay 3 / Hired "No
    hires yet" / Declined "None") repeat the Proposals screen, and two of
    them hold words.
  - At 390 the hero fills the whole first screen before any action.
  - The "Matches" rail shows a score with the label "Latte" under each
    figure (a meaningless band name), and "Ask me" sits over the matches.
- **Form.**
  - Desktop: header line, then the action list, then projects and matches
    side by side.
  - Phone: action list first.
- **Change.**
  1. HeroBand shrinks to a greeting plus one sentence that matches the list
     ("2 things are waiting on you"), with the amber CTA as the first item's
     action. The tiles go; the pipeline counts become a single quiet line
     linking to Proposals.
  2. "Waiting on you" rows carry their one action. Projects become compact
     rows (name, sent · accepted, status).
  3. Matches: initials, top skills, score. Drop the band word, or say what
     it means.
- **States.** New employer (no project, so "Post your first project" leads);
  nothing waiting (one quiet line, no empty art); payments due; meeting
  today (join window); load error.

### /employer/candidates: Candidates
- **Job.** Find and compare people for a project, then shortlist, propose or
  book. This is the core screen; used in bursts.
- **Deserves the most space.** The ranked results, with the score, the match
  to the project's skills, availability and price, and the one next action.
- **Wasted now.**
  - 2-up cards at about 300px each: 24 results is 6,400px at 1440.
  - Every card carries four mini score bars, a skills row, a description,
    two buttons and three links (Quick view / Compare / Profile).
  - The left filter column stays at full height, and "Ask me" covers
    card 2.
- **Form.**
  - Desktop: a dense result list. Each row has initials, city and mode,
    score (large, `nums`), top skills with matches in bold, price, laptop,
    and Shortlist plus `⋯`. Quick view opens the existing sheet.
  - The 4 axis scores go into the quick view, not the row.
  - The filter column stays and becomes sticky.
  - Phone: two-line rows plus a Filters sheet.
- **Change.**
  1. Rows, not cards.
  2. One primary action per row, chosen by state: Shortlist, then Send
     proposal once shortlisted, then View proposal once sent. Compare
     becomes a checkbox in the row.
  3. The "Matched to …" note becomes a single line in the toolbar.
- **States.** No project (pick one); no matches (widen the filters, with one
  Clear); 1; 48 per page; a long skills list (truncate to 3 + n); hidden
  candidates; load error.

### /employer/intern/[id]: Candidate profile
- **Job.** Decide whether to propose or book, before hire. After hire,
  reference.
- **Deserves the most space.** The score breakdown, skills and the decision
  (price plus the action).
- **Wasted now.**
  - The score 8.8 appears twice (header and the AI-results block).
  - The price appears twice (header and the "What hiring costs" card).
  - The breadcrumb reads "Intern / Details".
  - Academics is a 6-row card for one degree. Languages is a half-width card
    of 2 lines.
- **Form.** A detail page. The header carries the decision; the main column
  holds the evidence; a facts rail.
- **Change.**
  1. The header keeps the score and price once. The AI block shows only the
     4 axes and the report link.
  2. Academics and languages become DetailRows in one Surface.
  3. "Your proposals to them" moves to the header as a status line when one
     exists.
- **States.** Before hire (initials, no photo); hired (name); hidden or
  removed candidate; no AI interview yet; load error.

### /employer/compare: Compare
- **Job.** Put 2–4 shortlisted people side by side before a decision. Rare.
- **Deserves the most space.** The comparison table (rows = attributes,
  columns = people) with the best value per row marked.
- **Wasted now.** The empty state is a 340px dashed box with art and a
  "You - pick at least two" chip, for a page that is mostly reached empty.
- **Change.**
  1. Empty: if the shortlist has people, list them here with checkboxes;
     otherwise one line plus "Browse candidates".
  2. Filled: a sticky first column, `nums` right-aligned, the best value per
     row in brand weight, never colour alone.
- **States.** 0, 1 (pick one more), 2–4, a removed candidate.

### /employer/projects: Projects
- **Job.** Open, edit or close what you're hiring for. Weekly.
- **Deserves the most space.** Each project's status and traction (sent,
  accepted) and Find candidates.
- **Wasted now.**
  - 2-up cards with 4 actions each, including a red Delete on every card.
  - A sparkle icon on the "Full-time path" pill (§0 bans it by name).
  - A stray bullet glyph before every description.
  - Identical boilerplate descriptions, 3 lines each.
- **Form.**
  - Desktop: a list. Each row has the name, mode·city, skills (one line),
    sent · accepted, the status Pill, Find candidates, and `⋯` (Edit, Close
    or Reopen, Delete with confirm).
  - Phone: two-line rows.
- **Change.** Rows, one action, and the overflow menu. "Full-time path"
  becomes plain text in the meta line. The description goes from the list to
  the edit view.
- **States.** None (EmptyScene, "Post your first project"); all closed; a
  long name; load error.

### /employer/proposals and /employer/proposal/[id]: Proposals
- **Job.** Track offers and act on the stuck ones (pay, edit, withdraw).
  Several times a week.
- **Deserves the most space.**
  - List: status and the next step per offer.
  - Detail: the terms and "what happens next".
- **Wasted now.**
  - List: four equal tiles that repeat the status filter. Each row is 120px
    for 3 facts and carries Edit / Withdraw / View. The status select
    duplicates the tiles.
  - Detail:
    - the conduct rules are a 2×2 grid of icon cards plus a banner, about
      540px;
    - Terms and Work setup are two cards for one table of facts;
    - "What happens next" sits beside "Sent 28/10/2026, Hired 28/09/2026"
      (a seed-data clash, but the rail shows dates without labels it can
      defend).
- **Form.**
  - List: a table at desktop (candidate, role · project, money/month,
    starts, status, next-step action, `⋯`); two-line rows on phone. The
    status filter becomes `FilterTabs` with counts.
  - Detail: keep the header plus the figure strip (it is good). One terms
    table. The conduct rules become one Surface with a plain list of 4 short
    rules and the penalty sentence.
- **Change.** As above. The amber accent goes on "Pay to confirm" only.
- **States.** None; all waiting; accepted (pay); hired; withdrawn or
  expired; edited ("Updated"); a long role name; load error.

### /employer/send-proposal: Send a proposal
- **Job.** Build an offer for one picked candidate. Usually reached from a
  candidate, so landing here empty is common.
- **Wasted now.** The empty state is a 340px dashed box with art, a "You -
  pick a candidate first" chip and a stray "Your projects" link.
- **Change.** Empty: list the shortlist (initials, score, Send proposal)
  when there is one; otherwise one line plus "Browse candidates". The filled
  form is outside the baseline shots, and will be critiqued when the group
  is built.
- **States.** Empty with or without a shortlist; filled; validation errors;
  price below band.

### /employer/schedule: Schedule
- **Job.** Join today's interviews, chase unanswered slot offers, move
  times. Spiky.
- **Deserves the most space.** The next booked interview (time, Join).
- **Wasted now.**
  - A filter card with a native `mm/dd/yyyy` input, three selects and a
    Filter button.
  - Every interview card shows 3 slot boxes plus 3 outline buttons plus
    "Profile", and a closed interview gets a 260px card that says "Nothing
    more to do here".
- **Form.**
  - Desktop: grouped list (Booked → Waiting on candidate → Past, collapsed).
    Booked rows show the picked time large, plus Join. Waiting rows show the
    3 offered times inline as text, plus Remind and `⋯`.
  - Phone: the same, stacked.
- **Change.** The toolbar row with the DD/MM control, applied on change.
  Past interviews collapse to one-line rows.
- **States.** None ("Book from your shortlist"); a booked interview within
  the join window; no meeting link yet (QA-001 refusal copy); past; load
  error.

### /employer/timesheets and /employer/timesheets/[id]: Timesheets
- **Job.** Review and approve monthly sheets. Monthly, per intern.
- **Deserves the most space.**
  - List: sheets waiting for review.
  - Detail: the day grid plus the decision.
- **Wasted now.**
  - List: three tiles that disagree in kind ("Nothing waiting" / 1 / "None
    yet"); 150px rows; the intern's note repeated in quotes on every row.
  - Detail: a 0/0/0/0 figure strip above a grid of 30 "–" boxes; a weekly
    summary column repeated 5 times; four rail cards.
- **Form.**
  - List: a table (intern, period, project, days present, hours, status,
    sent), waiting first, `FilterTabs`.
  - Detail: keep the grid, with one totals row at the bottom in place of the
    per-week column. The rail holds the decision (Approve / Send back with
    note) and links.
- **States.** None; waiting; approved; sent back; an empty sheet (warn
  before approving); load error.

### /employer/cart, /employer/orders: Shortlist and Orders
- **Job.** Shortlist: decide who to meet or propose to. Orders: what was
  paid, what is due, invoices.
- **Wasted now.**
  - Shortlist: titled "Shortlist" but the nav and crumb say "Cart". Its
    4-step stepper of large cards doubles as the page's only navigation.
  - Orders: three tiles of words ("No hires yet", "Nothing paid yet",
    "Nothing outstanding") under a "3 payments due" CTA that contradicts
    them.
- **Change.**
  1. One name: "Shortlist" everywhere (nav, crumb, title).
  2. The stepper becomes a single-line progress (Shortlist 0 → Proposed 6 →
     Accepted 3 → Hired 0) linking to filtered Proposals.
  3. Orders: `FilterTabs` (Hires / Schedule / Invoices) with one focal figure
     ("₹75,000 due now") when anything is due.
- **States.** Empty shortlist; payments due; paid hires with an instalment
  schedule; invoices only; load error.

### /employer/alerts: Alerts
- **Job.** See what happened and jump to it. The same pattern as intern
  notifications, and one component should serve both.
- **Wasted now.** A mark-read column with its own divider on every row, and
  the time as a third line. The active nav item is clipped at the bottom of
  the sidebar at 900px.
- **Change.** 64px rows: dot · title · one-line message · time on the right ·
  mark read on hover or focus (always visible on touch). Hide the tabs when
  All equals Unread.

### /employer/account: Company profile
- **Job.** Keep company, billing and contacts right; change the password.
  Rare.
- **Wasted now.**
  - The password card has an icon tile, a washed-out disabled button and
    helper text in `text-xs`.
  - The "Elsewhere" card repeats the nav.
  - The rail "Profile: Complete" contradicts the empty required escalation
    fields.
- **Change.** Single column at reading width. Password becomes an
  expandable row. Drop "Elsewhere". Disabled buttons use the shared disabled
  style.

### /employer/drives and /employer/drives/[id]
See the college section ("college-adjacent"). They are built with the
college group, because their components are shared with the officer's
console.

---

## Intern (drafted by agent, edited)

Source: `docs/qa/baseline/intern/*` (seed intern Sana Kapoor: hired, paid once, not activated, 1 approved sheet, 0 docs) + `src/app/intern/**/page.tsx`. Measured against DESIGN.md §0 and its no-AI-slop list.

### Intern area: cross-screen findings

1. **The college drive banner is on every screen and broken at 768.** `components/intern/college-live.tsx:102` uses `sm:flex-row` with a `shrink-0` PushToggle whose long sentence never wraps, so at 768 the drive message squeezes to one word per line (about 600px tall) with the "can't show call alerts" line drawn over it. At 1440 it costs about 120px above every page title, and at 390 about 220px, which is a third of the first screen. The ping dot (`motion-safe:animate-ping`) loops forever, which breaks "nothing loops". Fix: one line (drive name, "open until 4 Nov", alert toggle) with the explanation behind a disclosure, dismissible per session. Show it at full size only on Home and College.
2. **The "Ask me" chat launcher covers content on every screen.** It is a 64px gradient pill (`chat-widget.tsx`, `bg-gradient-to-br … hover:shadow-glow`). At 1440 it covers rail text: Home score breakdown "AI interview 9.1", "How you are paid", the Timesheets "How it works" step 4, the Stipend step 2, the Settings "Contact page" link and the Profile checklist. At 390 it sits over the last card and on CTAs ("Add them in your profile", "Open your offer"). Fix: collapse to a 48px icon button once the user scrolls, or once per session, and add bottom padding equal to its height plus the tab bar to the page. Drop the gradient and glow (both are slop tells).
3. *[ed.]* The sidebar seeming to stop at about 900px is a full-page screenshot artefact (it is sticky at viewport height), not a bug. See "Shared changes" 6.
4. **Every page title is a 48px hero with a two-line lede.** Page ledes explain the obvious ("Mark each day of your internship and send it to your manager for approval.", "The files attached to your profile…"), and then every SectionHead adds its own hint too: "a tagline under every heading". Keep a lede only where it carries state (Offers: "2 offers waiting on your answer"; Notifications: "5 unread"). Cut the rest.
5. **The "How it works" numbered card shows up three times** (Timesheets, Stipend, Role detail "What happens next") and fills the rail permanently, even for an intern on month three. Show it in the empty or first-time state only. After that, use one "How this works" disclosure.
6. **Status pills are on everything**, including skill tags as Pills (Open roles ×5 per card, Role detail, Offer detail as green `live` pills) and the "No" pills on Record. Skills should be plain text chips from a different component, not status `Pill`. Keep `Pill` for status.
7. **The score is inconsistent across screens.** Home, Interviews, Profile and Offer read `extraData.findternScore` (8.8, with Coding 9.3 / Aptitude / AI interview / Communication). Record's "Assessment score" proof reads another source (`journey.ts`): 8.2, with Coding 8.5 and "Problem solving". The same intern sees two scores. Design must not paper over this: flag it to engineering before the Record redesign.
8. **Dates come in four formats on one screen.** "30/10/2026", "30 Oct 2026", "31 Aug – 29 Sept 2026", "28 Sept" and, on Record, the raw "2026-10-30" (the `Start` fact in `journey.ts:487`, which breaks the DD/MM rule). Pick one: DD/MM/YYYY for typed dates and "28 Oct" for relative-recent dates, used the same way everywhere.
9. **Rails duplicate the main column.** Home shows Next interview both as a tile and as a rail card. Stipend shows Paid, Pending and Monthly both in the hero and in the engagement card. Proposal detail shows Joining date, Duration and Stipend both in the rail and in the details table. Every fact gets one home per screen.
10. **Icon-before-heading slop.** Profile sections have an icon on every heading (Sparkles on Skills). Offer detail has a Sparkles icon on "AI interview ratings" and icon tiles on Company and Instructions. Interviews has a sparkles eyebrow on "AI interview results". Settings has a LifeBuoy icon on "Need help?". Remove them all.

---

### /intern/dashboard: Home
- **Job:** see the one thing waiting on you (log hours, answer an offer, pick an interview time, pay activation), several times a week.
- **Deserves the most space:** the single pending action and its CTA. When there is no action, the stage-specific fact: score before hire, hours and stipend while working.
- **Wasted now:** a third StatTile, "Next interview: None booked", in the hero for a working intern (repeated in the rail when one is booked). A full-width "Nothing is waiting on you right now." strip right below a hero lede that already says so. Activity rows run about 125px each for 2 facts plus a separate "Open →" line. The rail stacks 4–5 cards, including a "Profile status: Profile pending" pill next to "Open to work" for a hired intern, which reads as contradictory, and a dashed "See your profile as employers do" link card. At 390 the hero alone fills the first screen and the "Next interview" tile sits under the tab bar.
- **Form:** a hero, then one list (activity), then a narrow rail at ≥xl. On phone: hero, action, activity, and the rail facts collapsed into one Surface of DetailRows.
- **Change:**
  - Make the hero tiles stage-aware with no empties. Working: Hours approved / Paid to you / next payout or next sheet. Searching: Score / Offers waiting / Next interview. Drop any tile whose only value would be "None".
  - Merge StatusStrip into the HeroBand action. Delete the "Nothing is waiting" strip when the lede says it.
  - Activity: make each row one line (title · date) plus one meta line, with the whole row as the link. No separate "Open →" line, and rows of about 56–64px.
  - Rail: one Surface with score breakdown, visibility toggle, and college as DetailRows. Replace "Profile pending" with the real reason ("Not activated", which links to activation) or hide it while working. Keep the "Hello, Sana" title, but the eyebrow "YOUR INTERNSHIP" plus lede "Your internship, and anything waiting on you." say the same thing: cut one.
- **States:** new intern (GettingStarted steps: profile → activation → AI interview); offers waiting (amber CTA = Answer offer); interview booked (join window); working; hidden profile; failed-payout alert; thread load error.

### /intern/opportunities: Open roles
- **Job:** browse who is hiring, to judge whether the profile matches. There is no apply button. Visited weekly at most.
- **Deserves the most space:** role title, mode/city, skills match, and whether you already have an offer.
- **Wasted now:** 24 equal two-column cards, each about 150px. Every description is the same seeded boilerplate ("Deliver production features… agile 12-week fellowship"), clamped to 3 lines. Every card has its own "Read the role →" although the whole card is already a link. The amber "Can lead to full time" pill appears on half the cards, so amber means nothing. The page is 4,450px tall at 1440. The lede is 2 lines of policy. The count line "24 roles open · offers from 1" is ambiguous.
- **Form:** at desktop, a dense list (one row per role: initials, title, mode·city, posted, first 3 skills, offer status), not cards, because these are scanned and compared. At phone, the same rows stacked as 2-line items.
- **Change:**
  - Convert to a `Surface` list with dividers, at about 64px per row. Cap the description at 1 line or drop it from the list (it is on the detail page).
  - Mark only real state: "Offer waiting" in amber, "Hired" or "Offer closed" in neutral. The card currently shows "Offer received" for any proposal, including a closed or hired one (`role-card.tsx` `considered`). "Full time possible" goes in grey text, not an amber pill.
  - Add skill-match emphasis: bold the skills the intern has, from the profile skills. The data exists on the profile. Sort stays newest first.
  - Shorten the lede to one line or drop it. Move "nothing to apply to" into the empty and locked state.
- **States:** locked (`LockedRoles`: profile + activation steps); empty (no roles); one; 60 (the cap, so say "60 most recent"); a long title wrapping to 2 lines; error.

### /intern/opportunities/[id]: Role detail
- **Job:** read one role in full and see where you stand with it. Occasional.
- **Deserves the most space:** the scope of work and your status with this role (offer → open it).
- **Wasted now:** three stacked cards for one paragraph, one skill row and a 4-step list. "What happens next" hard-codes steps 1–2 as done for every intern, even a hired one, who still reads "You have an offer for this role." because the page checks `status === "hired"` and not `isHiredProposal`. Pill says "Offer received". The rail says "Where: Remote" and "City: Bengaluru" for a remote role. "How you are paid" restates the offer. At 390 the CTA sits mid-page and "Ask me" covers the rail.
- **Form:** detail page. A single reading column of max ~68ch with a DetailRow rail at ≥lg. On phone, a facts strip first, then scope.
- **Change:**
  - One Surface: title, mode·city·posted line, scope (text-base), skills as plain chips. Status and CTA go top right, not at the bottom of step 4.
  - Derive the steps from real state (`existing` + `isHiredProposal`), or drop them when an offer exists and show only "Open your offer".
  - Hide City for remote roles. Remove the "How you are paid" card. Move "Name shared once hired" to helper text under Company.
- **States:** no relation (the no-apply explanation); offer waiting (amber CTA); hired; offer closed; locked; missing scope; 404.

### /intern/proposals: Offers
- **Job:** answer offers (accept/decline) and find past ones. Rare but high stakes.
- **Deserves the most space:** "Waiting on you" offers, with money, joining date and decide buttons inline.
- **Wasted now:** with 1 hired offer, a 540px card sits alone in a 2-column grid, leaving the right half of the page empty. Icons sit before each meta label (Calendar, MapPin, Briefcase) in `text-xs`. The status detail "The company completed the payment. Log your hours on Timesheets." is useful but has no link. The "Full Time Job Role" pill is in Title Case.
- **Form:** at desktop, open offers as full cards with inline OfferDecision. Accepted/hired as a compact row list. Closed as a plain table-like list (role, company, money, date, status). Single column when there are ≤2 offers. At phone, everything is stacked, with decision buttons full width.
- **Change:**
  - Keep the grouping (good). Make the open group the focal card, with the amber accent on Accept only. Show the active and closed groups as rows.
  - Turn the status detail into a link ("Log your hours →") for hired offers.
  - Drop the meta icons. Move labels to `text-sm` and figures to `nums font-semibold`. Rename the pill to "Full-time role".
- **States:** empty (EmptyScene: "Companies come to you"); one open; several open with the decline counter (`declinesUsed`/`FREE_DECLINES`); updated offer ("Updated" pill); expired/rejected; long role or company names; error.

### /intern/proposals/[id]: Offer detail
- **Job:** read the terms and decide, then come back as reference (manager contact, hours). Rare and high stakes.
- **Deserves the most space:** the decision rail (stipend, joining date, Accept/Decline) while open; once hired, the manager contact and "Log your hours".
- **Wasted now:** the page is 3,400px tall. Seven bordered instruction cards with an icon each ("Do Not Accept Casually", "Do Not Withdraw…") in about 12px text sit below a hired intern's offer, although the heading says "Before Accepting a Proposal". Joining date, Duration and Stipend appear in both the rail and the table. "Location: Remote" duplicates Work mode. Two rows say "Not specified". "Roles and responsibilities" shows the employer's flattery message. The AI ratings card has a Sparkles icon and green 8.8/10 bars, a third copy of the score breakdown. Skill pills are green "live" pills.
- **Form:** detail. The rail decision card stays sticky at desktop and first on phone (good, keep). Terms go in one DetailRow table.
- **Change:**
  - Show Important Instructions only while the offer is open. Collapse them into one Surface with 7 short rules as a plain list (`text-sm`), the penalties in one sentence, and the full text behind a disclosure. Merge them with the OfferDecision confirm step if they are legally required there.
  - Remove the rail facts from the table (or the reverse). Hide rows whose value is "Not specified", or group them under "Not set by the company".
  - Remove the AI ratings card for interns: the intern already has it on Interviews. Keep "Required skills" as plain chips inside the terms card.
  - For hired offers, put the Company card (manager, phone) right after the rail. It is the most-used fact after hire.
- **States:** open (decide); open and edited ("Updated", info note); accepted, awaiting payment (company locked); hired; full-time variant (Job details + offer letter download); declined/expired; side query failed (inline error already exists); long JD HTML.

### /intern/interviews: Interviews
- **Job:** pick a time and join a company round; read the AI interview report. Spiky: heavy around interviews.
- **Deserves the most space:** an upcoming company round (slot picker or Join). When there is none, the AI report.
- **Wasted now:** a page lede plus 2 SectionHead hints that all say the same thing. The AI report is 5 equal tiles (score + 4 axes), the "stat tile wallpaper", with a sparkles eyebrow and the intern's own name as the card title. "Save as PDF" drops onto its own line at 390. A hired intern gets a 360px dashed EmptyScene with "Look at open roles". The "Preparing for a company interview" footer card is always shown.
- **Form:** at desktop, company rounds as a list of cards (each needs a slot picker, so cards are right), then the AI report as one Surface: big score on the left, 4 axes as compact bar rows on the right. Past rounds as a dense list. At phone, everything stacked, with the score above the axes.
- **Change:**
  - Order by urgency: upcoming rounds first, then the AI report, then past rounds. The code puts AI first.
  - Restyle the AI report as score plus axis rows (the same component as the Home rail, one component for one job). Remove the eyebrow icon and the name heading.
  - When working or with no rounds, show a one-line empty ("No company interviews booked.") instead of the art EmptyScene, with no Open roles CTA. Show the "Preparing" card only when a round is upcoming.
- **States:** not activated (Go to activation); paid, no AI interview (request button); AI scheduled/joinable (`AiInterviewJoinCard`); scored; round with 3 slots to pick; booked (Join live window); times to follow; past: done with feedback / missed / expired / cancelled; error.

### /intern/timesheets: Timesheets
- **Job:** start, fill and send a monthly sheet, and see whether it was approved or sent back. Weekly while working.
- **Deserves the most space:** the current or next sheet and its action (New timesheet / Edit / Send). A "Sent back" note when one exists.
- **Wasted now:** one 150px card for "31 Aug – 29 Sept 2026, Approved 3 Oct" with a lone "View" outline button. The "Next timesheet" rail card is 125px for one sentence ("Opens on 30 Oct 2026 (30 Oct – 29 Nov 2026).", with the date repeated). "How it works" (4 steps) is permanent. Three date formats appear on one screen ("30/10/2026", "30 Oct 2026", "31 Aug – 29 Sept 2026"). The page lede repeats the How-it-works step 1.
- **Form:** at desktop, a table: period · days marked · hours · status · sent/approved date · action. These are records the intern compares month to month. At phone, a list of rows (period + status on line 1, meta + action on line 2). The single-sheet view (`?sheet=`, TimesheetGrid) stays a full-width grid.
- **Change:**
  - Put the next-sheet state in the PageHead action area: "New timesheet" when available, or "Next opens 30/10/2026" as text. Remove the rail card.
  - Make sheets table rows. Show the manager note inline under a sent-back row (accent left border, already in code, keep). Make the row the link, with no separate View button.
  - Show "How it works" only in the no-sheets state. Move the selector for multiple hires to tabs or a segmented control instead of a 3-column card grid.
- **States:** no hire (EmptyScene → offers); accepted, awaiting payment; hired with no sheets (first opens on X); draft; submitted (Withdraw); sent back with note; approved; many months (scroll, newest first); multiple internships; not found; error. Design the grid editor too (it is not in the baseline shots).

### /intern/earnings: Stipend
- **Job:** check what has landed, what is next and when. Monthly, around payout.
- **Deserves the most space:** the last payment and the next scheduled one (amount + date). The full payment history.
- **Wasted now:** the hero eyebrow is "MONEY" with a 2-line lede about the page's own design ("Paid and scheduled are kept apart, so you plan with money that has landed"). The hero tiles "Paid / Pending: Nothing scheduled / Monthly" are repeated in the engagement card ("Monthly / Paid / Pending: None scheduled / Still to come"). The card has two equal buttons, filled "View timesheets" and outline "View proposal". "How payment works" is a permanent 4-step rail. The payment row does not say which month or internship it pays for. At 390 "Pending payout / Nothing scheduled" wraps into 4 lines in a half-width tile.
- **Form:** a hero with 2 figures (paid; next payout or "none scheduled"). Engagements as compact rows. Payments as a table at desktop (date · amount · period/internship · reference · status) and a list at phone.
- **Change:**
  - Cut the hero to Paid + Next payout. Show Monthly stipend in the engagement row only. Use "Check your bank details" only when there is no bank account or a payout failed. Otherwise it becomes a quiet link.
  - Make the engagement a row: role · company · monthly · paid / total ("₹25,000 of ₹37,500") with a thin progress bar. That explains "Still to come" without a fourth figure. Links become text links.
  - Payments become a table with the period and the internship. The UTR reference goes in a copyable mono cell.
- **States:** empty (no hire; accepted, awaiting payment); hired, nothing paid; paid; pending with date; failed (alert exists, keep); not eligible (score below 6 copy); multiple internships; long payout history; error.

### /intern/record: Your record
- **Job:** have a verifiable, exportable account of what you did, to download and share. Rare but valuable.
- **Deserves the most space:** the proof items (what, when, who confirmed) and Download.
- **Wasted now:** 3 equal StatTiles, then a full-width strip "4 verified items…" that repeats tile 3 ("Times someone vouched 4 records"). Proof cards have a gradient top border (amber→green) and uneven heights in a 3-column masonry, with whitespace holes. "Everything that has happened" repeats the Home activity thread word for word. The "What this record is not" section has 4 "No" pills. The page is 2,400px. The record score (8.2, "Problem solving") disagrees with every other screen (see finding 7). "Start 2026-10-30" is the raw ISO date. "Confirmed by Your manager" has a capital Y.
- **Form:** a document or timeline. A single column of proof entries in date order, like a CV section (date in the left gutter, item, facts as DetailRows, "confirmed by"). Same at phone. Not cards in a grid.
- **Change:**
  - One header row: the title, a one-line summary ("24 hours approved · ₹25,000 paid · 4 confirmed items"), and Download. Drop the tiles and the count strip.
  - Make proofs a chronological ledger with no gradient borders. Put Copy and Open as quiet icon buttons on hover or focus (always visible on touch).
  - Remove the duplicate activity thread, or fold the in-progress items into the ledger as "pending". Reduce "What this record is not" to one sentence under the header.
- **States:** empty (nothing yet); score only; working (hours + stipend); many items (group by internship); long work notes; score source mismatch must be resolved, not designed around; error.

### /intern/documents: Documents
- **Job:** check which KYC files Findtern holds and open one. Rare.
- **Deserves the most space:** which required documents are present or missing.
- **Wasted now:** the empty state is a 300px dashed scene with art for what is really a checklist. The populated state (code) is a 2-column grid of 16:10 previews, so Aadhaar and PAN images render large on screen, which is a privacy problem over the shoulder. The lede and the bottom Info line say the same thing twice.
- **Form:** a list. One row per document type (Profile photo, Aadhaar, PAN, Intro video, Marksheets, Certificates): small thumb or icon · name · type·size·date · Open. Missing types show as rows with "Not added" and an Add link. Same at phone.
- **Change:**
  - Replace the grid with a list. Blur ID images or show them only on Open, never inline.
  - Show the missing required types as rows, which merges the empty state into the list. Keep one privacy sentence.
- **States:** none; partial; all present; many certificates; a file that fails to open (signed URL error); error.

### /intern/profile: Your profile
- **Job:** see what employers see and what is missing. After edits, and when chasing visibility.
- **Deserves the most space:** the employer-view card (score, skills, about), then "what is left" (readiness).
- **Wasted now:** every section heading has an icon (Sparkles, Video, BookOpen, Laptop, GraduationCap, Languages). There are 7 separate full-width Surfaces for short content: Languages is 2 lines in a 140px card, About is 2 lines. "Preferred cities: Bengaluru, Bengaluru, Remote" is deduped wrong. "Profile completeness 50%" shows a 10-item checklist where done items look disabled and an "Ask me" overlap hides items 8–9. The page shows the full name and a large "SK" tile while saying employers see initials only. The page reads "Profile pending" for a hired intern.
- **Form:** detail. At desktop, one main Surface split by SectionHead dividers (not 7 cards) with a rail for readiness, visibility and private details. On phone, readiness first (it is the action), then the profile.
- **Change:**
  - Remove the heading icons. Merge the sections into 1–2 Surfaces with `border-t` dividers. Put About and Languages in a 2-column DetailRow block.
  - Rename completeness to "Recruiter readiness" (DESIGN §8.1). List only the missing items, each linking to its field. Cap the meter below 100%. Hide it when complete (the code already does).
  - Show the employer view literally (initials, city, score) as the hero card. Put "your private details" visibly apart.
  - Fix the city dedupe (data/formatting).
- **States:** brand-new (mostly empty sections: each says what to add, not "Not added" ×10); complete; hidden; not scored (no score block); long about or skills lists; no photo; error.

### /intern/college: Your college
- **Job:** join or confirm your college and consents. Once, plus during a drive.
- **Deserves the most space:** the membership status and the two consent choices.
- **Wasted now:** the "Call alerts" rail card repeats the drive banner directly above it ("This browser can't show call alerts…" appears twice on one screen). A building-icon tile sits on the college card. "Leave college" in red sits next to the primary action, the same weight as a destructive text link. This screen is otherwise close to right: plain copy, real consent text. Keep it.
- **Form:** a form page, single column (max ~42rem) at desktop with the alerts setting inline. The same at phone.
- **Change:**
  - Remove the rail. Put the alert toggle once, as a row in the consents list ("Call alerts during drives"). On this page the drive banner becomes the alerts row.
  - Drop the icon tile. Move "Leave college" to the bottom, separated, with a confirm.
  - Check the DPDP rule: the code says the boxes start empty, and the shot shows both ticked for a joined member. Fine, but design the unjoined state with unticked boxes.
- **States:** not joined (search, prefilled from academics); pending verification; verified; drive live; consent withdrawn; push unsupported or denied; error.

### /intern/notifications: Notifications
- **Job:** see what happened and jump to it. Several times a week.
- **Deserves the most space:** unread items that need action ("Needs you" group).
- **Wasted now:** the mark-read check sits in a separate 56px column with a vertical divider on every row, and the row chevron is pale. Lapsed "An employer wants to talk right now" requests from hours ago still read as urgent, unread, with "accept to get the call link". "Proposal accepted: Northwind Labs accepted your proposal" is the employer's verb, shown to the intern. All/Unread tabs both show "5". The footer line about "no streak reminders" explains the product's restraint to the user.
- **Form:** a list (correct). Desktop rows about 64px: dot · title · message (1 line, truncated) · time on the right · mark-read on hover or focus. Phone: 2 lines plus a swipe or long-press menu, or keep the check but inline.
- **Change:**
  - Use relative time for the last 24h ("5 h ago") and DD/MM after that. Put the time on the right, not as a third line.
  - Render expired call requests as past ("Missed call request · 12:20 am"), not as active. This needs the `data` expiry in `internNotificationHref`/row.
  - Rewrite intern-facing titles by type (proposal accepted → "You accepted Frontend Intern"). Remove the footer line. Hide the tabs when All equals Unread.
- **States:** empty; all read; unread only; Needs you + rest; 100 (the cap, so say so); very long message; error.

### /intern/settings (+ /intern/bank-details → #bank): Settings
- **Job:** keep the bank account and contact right, change the password. Rare, but the bank account blocks payouts.
- **Deserves the most space:** the bank account, because it decides whether stipend lands.
- **Wasted now:** a hired intern with a paid stipend sees an empty bank form ("Choose your bank", placeholders) with no "missing" warning and no saved read state (`BankDetailsForm` is always an edit form). Every section carries a hint plus a card. The password card is the tallest block, for the least-used task. The Findtern ID is a raw 36-character UUID in `text-xs` mono. "Need help?" has a LifeBuoy icon heading. A disabled "Change password" button looks broken.
- **Form:** a form page. Desktop: sections in one column (max ~42rem) with the account rail. Phone: stacked, with the bank section first when it is missing.
- **Change:**
  - Bank: a read state when saved (bank · ****1234 · IFSC · holder) with "Change". An amber callout when it is missing and the intern is hired ("Your next stipend can't be paid until this is filled"). The same section serves the `/intern/bank-details` redirect.
  - Collapse Password into a "Change password" row that expands. Remove the section hints that restate labels.
  - Findtern ID: show a short form with a copy button. Remove the help icon.
- **States:** bank missing (hired vs not); bank saved; save error (field-level, IFSC format); Google-only account (no current password); phone validation; deep link `?view=` → anchor; load error (keep: no empty forms that overwrite data).

---

## Admin (drafted by agent, edited)

Based on the baseline shots in `docs/qa/baseline/admin/` (seed data, 28 Oct) and the sources in `src/app/admin/**` and `src/components/admin/*`. Every screen is judged against the DESIGN.md §0 "No AI slop" list.

### Admin area: cross-screen findings

- **Standardise on `DataTable`. `/admin/users` is the closest to right.** It has one toolbar row, sortable headers, Pill status, an inline row action, every column fitting at 1440, and a "Showing 1–25 of 133" pager. The target pattern: a toolbar with search, at most 3 visible facet selects plus a "More filters" fold at every width (not only below lg), Rows on the right, and Export in `PageHead` actions (never in the toolbar). Headers sentence case with the sort glyph after the label. Rows 48px by default and 40px in dense mode. Numerals `nums text-right`. Status through `Pill`. Row actions in the last column, sticky right.
- **Wide tables cut off their last column at 1440, and that column is usually the action.** Payouts loses "Paid on" and the `PayoutEditor` (the screen's whole job). Companies loses Onboarding, International FTE, Account and Joined. Orders loses Created and the invoice action. Notification history loses Status. Fix this by trimming columns, not by scrolling sideways: two-line cells (name over email) already exist, so fold secondary facts into them and make the actions column `sticky right-0`.
- **The table scrolls inside the page.** `DataTable` wraps the table in `max-h-[min(72vh,56rem)] overflow-auto`, so at 1440 every list stops at row 8–9 and gives you a second scrollbar above the pager (interns, users, payouts, companies). Drop the inner max-height. To keep column names in view, make the header sticky against the page (offset by the shell top bar).
- **Stat-tile wallpaper is on 11 of 25 screens** (proposal-tracker, companies, projects, payouts, orders, intern-invoices, transactions, promo-codes, reports, reports/money, reports/analytics, plus interns/[id] and companies/[id]). Each row is four equal tiles with one fact each, and on finance screens there's a decorative icon chip too; promo codes uses a sparkle icon, which §0 bans by name. Replace each row with a single summary line in `PageHead` (`₹2,80,000 collected · 8 paid · ₹0 outstanding`) or one `StatTile` focal figure. Only the dashboard keeps a hero.
- **One `StatCard`, two looks.** Orders, intern-invoices, transactions, promo-codes and reports carry icon chips; companies, projects, proposal-tracker and payouts don't. Pick none.
- **Date filters are native `mm/dd/yyyy` inputs on 8 screens.** That breaks the DD/MM/YYYY rule, and every one of them has its own Apply / Apply dates / Apply range / Filter button and takes a second toolbar row. Build one `DateRange` control (presets plus custom, DD/MM) that applies on change and sits in the toolbar row. `report-range.tsx` is the place to put it.
- **CSV export lives in three places:** a `PageHead` outline button (interns, projects, companies, proposal-tracker), inside the toolbar (orders, intern-invoices) or as a bare "CSV" chip (payouts, transactions). Always put it in `PageHead` actions as `buttonClass({variant:"outline",size:"sm"})`.
- **The page intro under every title is a tagline.** It wraps to two lines and pushes content down about 60px ("Every registered candidate: review status, scores…"). §0 calls this a copy tell. Keep it only where it states a live count (users: "120 candidates, 12 companies, 1 staff"; messages: "5 unread of 15"). Elsewhere, delete it.
- **Figures disagree across screens, and a redesign that keeps the labels will expose it.** Hires show as 0 (proposal-tracker, analytics), 13 (reports, dashboard "Placements") and 0 (companies "that hired"). "Received ₹0" on transactions and money sits beside ₹2,80,000 collected on orders. The companies list shows Northwind with 0 projects and 0 proposals, but its detail page and the pipeline show 3 and 9. The dashboard has "Avg hiring speed −9.8 days". Fix the definitions before the visuals: one label means one query.
- **Phone (390) is triage only.** What should survive: the dashboard attention list, message list plus sheet, payouts pending list (name, amount, Record button), the pipeline Proposals tab, and the intern header with review/visibility. Every table currently collapses to "Scroll sideways to see every column →" with the first column alone visible, which is useless. On mobile, render rows through a `DataTable` `mobileRow` slot: a two-line list item with primary text, the key figure right-aligned, a Pill, and a tap through to the detail.
- **Shell.** *[ed.]* Not a height bug (see Shared changes 6), but at a 900px-tall viewport, nav items after "Intern invoices" (Transactions, Payouts, Promo codes, Reports, Website, Settings, Roles) are only reachable by scrolling inside the sidebar. Payouts is a daily task and sits below the fold. Reorder so daily queues come first, or tighten the group spacing. The "Ask me" chat widget is already suppressed on `/admin` (`chat-widget.tsx:262`), so it covers no columns here.
- **What is already right and should stay:** the dashboard attention list (ordered by who's waiting, with named exits), `EmptyScene`-style empties with a next step (cms, intern-invoices), the users inline Active/Deactivate, the interns/[id] control strip, and `AdminLoadError` for failed queries.

---

### /admin/dashboard: Workspace
- **Job:** first screen every morning, revisited all day. Answers "what does someone owe a person right now".
- **Deserves the most space:** the attention list (calendar not connected, 5 payouts with no reference, unread messages, 13 offers awaiting payment, timesheets). It is the best thing in the console.
- **Wasted now:**
  - The HeroBand is about 300px of greeting plus "28 items need a person today", which repeats the list below it.
  - The hero buttons (Proposal pipeline, Reports) duplicate the sidebar.
  - "Supporting figures" is 8 equal tiles, the textbook wallpaper, and it includes "−9.8 days" and "₹0 Revenue".
  - The funnel shows 100/100/100/0% from seed data with a 2-line explainer.
  - The onboarding banner is a second attention item styled differently.
- **Form:**
  - Desktop: hero cut to one line (date plus "28 waiting · +14 this week") with the attention list directly under it, then the funnel and recent activity in two columns.
  - Phone: the attention list only. The hero shrinks to the count, and buttons become full-width row links.
- **Change:**
  1. Drop the greeting H1 to a `PageHead`-size title and remove both hero buttons.
  2. Fold the onboarding banner into the attention list as row 6.
  3. Replace the 8 tiles with one `Panel` of 4 `DetailRow`-style figures (interns, companies, placements, revenue), and hide any figure that is negative or zero.
  4. Recent activity: the date goes right and `nums`, with a "View all" link to notification-history.
- **States:** "Nothing waiting on the team" as the hero copy when the count is 0, and the attention list collapses. Each attention item is limited to its count and a link. If a query fails, that item shows "Couldn't load" rather than vanishing.

### /admin/proposal-tracker: Proposal pipeline
- **Job:** several times a day. Find stuck offers, nudge employers to pay, check interviews have links.
- **Deserves the most space:** the Proposals tab (offer, status, age, next step). The default tab is Companies, which is a rollup, not the work.
- **Wasted now:**
  - The From/To date row (native mm/dd plus a solid primary "Apply") sits above everything.
  - 4 tiles: "Hired 0" contradicts "Accepted or hired 13".
  - Sort glyphs sit left of numeric headers.
  - 7 numeric columns per company, mostly 0.
  - Rows are 67px.
  - At 390, the tiles stack before the table and the table shows only Company plus one number.
- **Form:**
  - Desktop: a tabbed `DataTable` with Proposals as the default tab.
  - Phone: the Proposals list as 2-line rows (candidate → company, Pill, age). Companies and Candidates tabs stay desktop-only.
- **Change:**
  1. Make Proposals the default tab, and put a stale-days column on it ("9 d since sent").
  2. Move the date range into the toolbar as the shared `DateRange`, and drop the separate Apply.
  3. Replace the tiles with a `PageHead` meta line, or put the counts in the tab badges (already there: 44/30/0, so the tiles are redundant).
  4. Companies tab: cut to Proposals, Accepted, Declined and Acceptance %, sorted by "awaiting payment".
- **States:** EmptyScene per tab; for Proposals, "No proposals in this range, widen the dates". Many: paginated, with the per-tab `pageKey` already supported. Long names truncate with `title`.

### /admin/messages: Messages
- **Job:** daily inbox. Website enquiries, problem reports and feedback; read, reply externally, mark read.
- **Deserves the most space:** sender, subject and first line, with unread state.
- **Wasted now:**
  - Each row is about 140px (avatar, name, subject, preview, two chips).
  - "Website enquiry" repeats on every row, so the kind chip carries no information when filtered to one kind.
  - The unread dot is a tiny blue dot on the avatar, and blue isn't a brand tone.
  - At 1440 the list spans 860px with empty space right of the preview.
  - At 390 the three filter selects stack into ~180px before the first message.
- **Form:**
  - Desktop: a list is right (it's prose, not a table), but at 2 lines per row (name · subject on line 1, preview on line 2, kind/role chips right-aligned beside the date). At lg+, consider a split view with the existing `Sheet` content docked right.
  - Phone: list plus the full-screen sheet (already works).
- **Change:**
  1. Unread = semibold sender plus a brand dot in the gutter, and drop the blue.
  2. Show the kind chip only when the "Every kind" filter is active.
  3. Put the filters behind the same fold as `TableToolbar`, with search alone visible on phone.
  4. The bulk bar replaces "Select all on this page" when anything is selected (already half there).
- **States:** EmptyScene "Inbox clear" with no filters, versus the existing "No messages match" with filters. Paginated. Previews truncate in one line. An error renders `AdminLoadError`.

### /admin/notification-history: Notification history
- **Job:** occasional audit ("did the intern get told?").
- **Deserves the most space:** recipient, title and status (read or not).
- **Wasted now:**
  - The Status column is cut off at 1440.
  - The Type column repeats the title as a grey pill ("Proposal accepted" / "Proposal accepted").
  - The Sent column is 160px of "28/10/2026, 05:48 am".
  - Recipient email is truncated mid-word.
- **Form:**
  - Desktop: `DataTable`.
  - Phone: a 2-line list (title / recipient · time, read Pill).
- **Change:**
  1. Drop the Type column and keep type as a filter.
  2. Sent becomes a relative time plus a `title` with the full IST stamp, right-aligned `nums`, as the last column.
  3. Status as a Pill (Read / Unread), visible without scrolling.
  4. "Send a notification" goes to `PageHead` actions as outline, not primary green; this page is the audit, not the composer.
- **States:** EmptyScene says nothing has been sent and links to send. Paginated. Message truncates with `title`.

### /admin/interns: Candidates
- **Job:** the heaviest screen. Review and approve, score, hide/show, check offers and payouts, many times a day.
- **Deserves the most space:** the rows, with candidate, score, review state, offer and visibility editable in place.
- **Wasted now:**
  - **11 filter selects across 3 rows**, about 140px before the header.
  - "Import ratings / Excel template / CSV / Export CSV" is four controls of mixed styles in the header.
  - The onboarding banner duplicates the dashboard.
  - Rows are 83px: a 40px avatar and "AI interview: Completed" under the score.
  - Inner scroll stops the list at about 7 rows.
  - The Review `<select>` per row is 136px wide and visually louder than the name.
  - At 390, header and banner take a full screen before any candidate.
- **Form:**
  - Desktop: dense `DataTable`, 48px rows.
  - Phone: 2-line rows (name, score `nums`, review Pill) that tap through to /interns/[id]. No inline selects on phone.
- **Change:**
  1. Show 3 filters (Review, Profile, Visibility) and fold the other 8 behind "More filters", with active chips shown (the toolbar already builds chips).
  2. Header actions: "Export CSV" outline, and an "Import ratings" menu that holds the template link.
  3. Review becomes an inline-table-control Pill-dropdown, and drop the "AI interview:" line to the `title`.
  4. Remove the inner max-height and make the header sticky to the page.
- **States:**
  - Empty after filters: "No candidates match" plus "Clear filters".
  - Many: 120+ paginated, which is fine.
  - Long email: truncate.
  - Inline edit failure: rollback with the server message.

### /admin/interns/[id]: Candidate detail
- **Job:** daily, per candidate. Decide review/visibility, enter ratings, check payouts and documents.
- **Deserves the most space:** the control strip (Review / Visibility / Account) and Score and ratings. That is the decision.
- **Wasted now:**
  - 4 tiles (Score, Proposals, Interviews "None yet", Paid) repeat what the tabs show.
  - The Skills editor uses a pill on every skill with a nested select, a "pills on everything" tell.
  - The Profile tab is a long stack of single-fact cards (Experience: "No experience added", Extracurricular: "None added").
  - Aadhaar and PAN are shown in full on the first tab.
  - At 390: name, contact, two full-width buttons and the control strip push the score below the first screen.
- **Form:**
  - Desktop: header with controls inline beside the name, then a 2/3 tab content + 1/3 sticky "Decision" column (score, ratings form, skills).
  - Phone: header, control strip, then score; the tabs scroll horizontally.
- **Change:**
  1. Move Review/Visibility/Account into the header row and drop the separate strip panel.
  2. Replace the tiles with header meta ("8.8/10 · 1 proposal, 1 hired · ₹25,000 paid, ₹37,500 owed").
  3. Skills become a plain table (skill, level select, remove).
  4. Merge empty sections into one "Not provided: experience, extracurricular, emergency contact" line, and mask Aadhaar to its last 4 digits with a reveal.
- **States:** a not-found candidate goes to EmptyScene with a back link. Tabs show count 0 with an EmptyScene each. A failed ratings save shows the server message inline.

### /admin/users: Users
- **Job:** weekly. Find an account, then activate or deactivate it.
- **Deserves the most space:** name, email, type and account status with its action.
- **Wasted now:**
  - The inner scroll clips at row 11.
  - "Candidate" is a blue info pill on 120 of 133 rows, which is noise.
  - "Active" plus a green "Deactivate" link: the destructive action is styled like the positive state.
- **Form:**
  - Desktop: **the reference `DataTable`.**
  - Phone: name / email two-line rows with an account Pill.
- **Change:**
  1. Show Type as neutral text, or as a Pill only for Company/Staff.
  2. Deactivate becomes a ghost button with a confirm.
  3. Rows go to 48px.
  4. Name links to /interns/[id] or /companies/[id].
- **States:** filtered-empty shows "Clear filters". Paginated (6 pages). A long email truncates.

### /admin/companies: Companies
- **Job:** weekly. Who owes what, who to call.
- **Deserves the most space:** company, contact, still due (with the next due date) and account.
- **Wasted now:**
  - 4 tiles: "Companies 12 / Onboarded 12 / 24 / Hired 0".
  - 13 columns, so Onboarding, International FTE, Account and Joined are off-screen.
  - Projects and Proposals show 0 when the detail page says 3 and 9 (data bug).
  - "Paid" is all dashes.
- **Form:**
  - Desktop: `DataTable` with 8 columns (Company/contact, City, Projects, Proposals, Billed, Still due, Account, actions).
  - Phone: name plus Still due right-aligned.
- **Change:**
  1. Remove the tiles and put the one useful figure, total still due, in the `PageHead` meta.
  2. Move Phone and Location into the company cell's second line, and drop Joined to a filter/sort.
  3. Onboarding and International FTE become filters only.
  4. Fix the count queries before restyling.
- **States:** EmptyScene for no companies. Paginated. "Nothing" due renders as an en-dash, not a word.

### /admin/companies/[id]: Company 360
- **Job:** a few times a week. Before a call, check proposals, payments and dues.
- **Deserves the most space:** the Proposals and Dues per hire tabs. The Profile tab is reference.
- **Wasted now:**
  - 4 tiles.
  - The Profile tab has a 10-row Company information card beside an Escalation contact block of four dashes.
  - The "COMPANY 360" eyebrow is a label explaining the obvious.
  - The Delete action is styled red in the same card as routine toggles.
- **Form:**
  - Desktop: header (name, Pills, contact line, actions), then tabs, with Dues per hire as the default when anything is due.
  - Phone: header plus the Dues list.
- **Change:**
  1. Drop the eyebrow and tiles; put "₹2,70,000 due · next 30 Oct" as header meta in amber (the one thing to do).
  2. Collapse an empty escalation contact to an "Add escalation contact" link.
  3. Move Delete to a "Danger" row at the foot of Account, outline-destructive with a confirm.
  4. Tabs use the same table pattern.
- **States:** each tab gets an EmptyScene. Delete disabled shows the reason inline (already done).

### /admin/colleges: College partners
- **Job:** rarely. Add a partner college, issue an officer login.
- **Deserves the most space:** the list of colleges with partner/on-website/active status and their officer.
- **Wasted now:** the "Add a partner college" form is permanently open above the list (about 450px) on a screen used mostly to look things up. Each college card has an empty Officer name/email form even though an officer exists.
- **Form:**
  - Desktop: a table (College, City, AISHE, Students / Roster / Drives `nums`, Officer, Partner/Website/Active Pills, actions).
  - Phone: name plus counts.
- **Change:**
  1. Move the add form into a Sheet behind a `PageHead` "Add college" primary button.
  2. Officer cell shows the current officer plus "Re-issue login" as a row action; the form opens only on demand.
  3. Make the checkboxes inline toggles in the row.
- **States:** EmptyScene "No partner colleges, add the first". Many: paginate once past ~25. Long college names truncate.

### /admin/projects: Projects
- **Job:** weekly. See what's open and how much interest each project draws.
- **Deserves the most space:** project, company, proposals and status.
- **Wasted now:** 4 tiles ("Active 24 · Open to candidates now, blank status included"), "Full-time potential" as a text column, inner scroll.
- **Form:**
  - Desktop: `DataTable`, already close.
  - Phone: title / company two-line rows with the proposals count right-aligned.
- **Change:**
  1. Remove the tiles and put "25 projects, 24 open" in the meta.
  2. Type becomes a small Pill only for Full-time.
  3. Show skills under the title truncated to one line with `title`, which is already done; keep it.
- **States:** filtered-empty with Clear. Paginated.

### /admin/orders, /admin/intern-invoices, /admin/transactions: finance lists
- **Job:**
  - Orders: weekly reconciliation of employer checkouts.
  - Intern invoices: activation-fee receipts, rare.
  - Transactions: a combined ledger in 3 tabs (employer payments / intern fees / intern payouts).
- **Deserves the most space:** invoice/order id, party, amount, status, date and the download action.
- **Wasted now:**
  - Each has 3–4 icon tiles ("₹0 / ₹0 / ₹0" on intern-invoices).
  - The date range is a second toolbar row with native mm/dd inputs and an "Apply dates" button.
  - Export sits in the toolbar.
  - Orders loses Created and actions off the right edge, and Interns shows "-" on every row.
  - Transactions adds two chart panels that both say "Not enough history to chart yet", about 270px of nothing.
  - Its tabs are filled-green pills, unlike the underline tabs on the pipeline and company 360.
- **Form:** one `AdminInvoicesView` table pattern for all three on desktop. Phone: id/party plus amount and Pill.
- **Change:**
  1. Replace the tiles with a one-line `PageHead` meta ("₹2,80,000 collected · 8 orders · ₹0 outstanding").
  2. Shared `DateRange` in the toolbar row, and Export to `PageHead`.
  3. Orders: drop GST and Discount into an expandable row or `title`, hide Interns when it's empty, and make actions sticky.
  4. Transactions: hide chart panels below a data threshold, and use the same underline tabs as the other screens.
  - Monospace ids are fine, but they must be `text-sm`, not smaller.
- **States:** intern-invoices already uses a good empty ("Activation payments appear here when an intern pays the fee"); copy that pattern. Paginated. A gateway error appears as a status Pill, not hidden.

### /admin/payouts: Payouts
- **Job:** weekly, or whenever stipends fall due. Pay the intern, then record the bank reference. This is a top-3 task.
- **Deserves the most space:** pending rows, each with intern, amount, scheduled date and a Record reference action.
- **Wasted now:**
  - The action column (`PayoutEditor`) and "Paid on" are off-screen at 1440.
  - "Company and project" is "Not linked" on every row.
  - Amount and INR value repeat each other for INR rows.
  - Three tiles, with "Failed transfers 0 · None".
  - The toolbar wraps, leaving "CSV" alone on row 2.
  - At 390 only Intern and "Not linked" are visible, so the job is impossible on a phone.
- **Form:**
  - Desktop: `DataTable`, default filter Pending and sorted by scheduled date.
  - Phone: the pending list (name, amount right-aligned, due date, "Record" button opening a Sheet). This is the one finance screen that must work at 390.
- **Change:**
  1. Columns: Intern, Placement, Scheduled, Amount (`nums`, INR in `title` when not INR), Status Pill, Reference, and a sticky Action. Hide Placement when unlinked.
  2. Replace the tiles with "₹1,25,000 waiting across 5 payouts" in amber as the focal line; failed transfers appear only if > 0.
  3. `PayoutEditor` opens inline in the row (inline-table-control).
  4. Shared DateRange; CSV to `PageHead`.
- **States:**
  - Empty pending: "No stipends waiting".
  - Many: paginated (no longer hard-capped).
  - Reference too long: truncate with `title`, which is already done.
  - Save failure: rollback with the server message.

### /admin/promo-codes: Promo codes
- **Job:** monthly. Create, pause or edit a code.
- **Deserves the most space:** code, value, audience, used/limit, expiry and the active toggle.
- **Wasted now:**
  - 4 tiles (one with a **sparkle icon**, "Uses per code 0.0").
  - Each code is a 300px card with a giant "25% off" in brand green, an Active pill AND a toggle (state shown twice), and a full-width Edit button.
  - The search field has a grey fill unlike every other toolbar.
- **Form:**
  - Desktop: a `DataTable` (Code mono, Value, Applies to, Used x/y with a thin meter, Expires, Active toggle, row actions Edit/Copy/Delete).
  - Phone: code plus value plus toggle.
- **Change:**
  1. Cards become rows, and delete the tiles.
  2. Keep one state indicator (the toggle) and drop the Pill.
  3. "New code" stays the one primary button, in `PageHead`.
  4. Use the standard toolbar.
- **States:** an EmptyScene that creates the first code. Many: paginate. A long description truncates.

### /admin/reports: Reports
- **Job:** weekly or monthly, for founders. Funnel, revenue and CSV exports.
- **Deserves the most space:** the conversion funnel and the raw exports. Those are what the ops team actually uses.
- **Wasted now:**
  - 4 icon tiles: "Hires per interview 43%" disagrees with analytics' "Hires 0".
  - The "Revenue collected" chart is an empty panel.
  - Every chart carries a 2-line explainer (good per §6, but long).
  - The 6 export cards are 3 equal cards ×2, each with a "Download CSV" button, a template tell.
- **Form:**
  - Desktop: funnel full width, then 2-up charts, then the exports as a single list.
  - Phone: the funnel and the export list only.
- **Change:**
  1. Exports become a `Panel` list: name, one-line description, download link on the right.
  2. Hide empty charts below a threshold and show one line in their place.
  3. Keep explainers to one line.
  4. Drop the tiles; the funnel already carries those numbers.
- **States:** "Not enough history" as an inline line, not a 250px panel. An export failure shows a toast with the reason.

### /admin/reports/money: Money in and out
- **Job:** monthly reconciliation, or whenever chasing a company.
- **Deserves the most space:** the Receivables table (who owes, when, how much).
- **Wasted now:**
  - Range pills plus native date inputs plus a separate Company/Candidate/Status filter panel with its own "Filter" button: three filter bands.
  - 4 icon tiles.
  - Receivables shows "1–130 of 130" on one page with no pager.
  - The Reference column is empty for every receivable.
  - "Date" means the due date in the future, which is unlabelled.
  - Description repeats "Offer accepted, awaiting payment".
- **Form:**
  - Desktop: two `DataTable`s, with Receivables first.
  - Phone: the receivables list (company, amount, due).
- **Change:**
  1. Put all filters in one toolbar (DateRange, Company, Candidate, Status), applied on change.
  2. Rename "Date" to "Due" and drop Reference from receivables.
  3. Paginate both tables with the shared pager.
  4. Tiles become a 2-figure meta line (in / out).
- **States:** empty receivables shows "Nothing owed". An error shows `AdminLoadError` per table.

### /admin/reports/analytics: Hiring analytics
- **Job:** monthly founder review.
- **Deserves the most space:** the funnel and monthly performance.
- **Wasted now:**
  - The Rates panel holds 9 figures in a loose grid.
  - Monthly performance is an inner-scroll table of zero rows.
  - Top companies wraps names into 3 lines inside a half-width panel.
  - Highest-paying skills shows paise ("₹48,333.33").
  - At 1440 the type is visibly smaller than on other screens (`text-xs` cells).
- **Form:** a long-form report is acceptable on desktop. Phone: funnel plus rates.
- **Change:**
  1. Bring all table cells up to the `text-sm` floor; round money to whole rupees.
  2. Make Top companies full width and drop the Internship/FT split column.
  3. Collapse months that are all zero ("Apr–Jan: no activity").
  4. Use the same DateRange control as /reports.
- **States:** "No hires in this range" already present. Avg time to hire shows "–", which is correct.

### /admin/cms: Website content
- **Job:** occasional. Testimonials, partners, FAQs, blog and featured skills.
- **Deserves the most space:** the item list for the selected type.
- **Wasted now:** the segmented tabs carry count badges of 0 (fine). The Add button sits inside the toolbar beside search, where other screens put actions in `PageHead`. The shot only shows the empty state.
- **Form:** desktop `DataTable` per tab with drag order where relevant; phone: list.
- **Change:**
  1. "Add testimonial" moves into the tab's panel header, right-aligned, as primary.
  2. Use the same underline tabs as company 360 / pipeline.
  3. Paginate (§5 notes cms has none).
- **States:** the empty state is good ("It shows on the public site as soon as it is saved"). A long blog title truncates. A save error shows inline.

### /admin/notifications: Send notification
- **Job:** a few times a month. Broadcast to candidates and/or companies.
- **Deserves the most space:** the message form plus recipient count.
- **Wasted now:**
  - The recipient picker is a fixed-height scroll list of 50 names.
  - "Type: custom" is a free-text field.
  - "Extra data (JSON, advanced)" is exposed to ops staff.
  - "Recently sent" duplicates notification-history with Pill-on-Pill rows (role pill + type pill).
- **Form:** desktop has 2 columns, which is right. Phone: recipients collapse to a summary ("119 candidates") with "Pick people".
- **Change:**
  1. Make the "Every active candidate (119)" checkbox the default, with the individual picker behind "Choose people".
  2. Type becomes a select of known types, and hide JSON behind a "Developer" disclosure.
  3. Trim Recently sent to 5 rows with no Pills and a "Full history" link.
  4. The Send button states the real count and stays disabled with a reason at 0.
- **States:** zero recipients means Send is disabled with "Pick at least one person". A send error is shown verbatim.

### /admin/settings: Pricing and fees
- **Job:** rare, but high-stakes (live prices).
- **Deserves the most space:** the three plan editors.
- **Wasted now:**
  - Each plan card is about 1300px of stacked inputs with three separate Save buttons plus a fourth for the fee.
  - Checklist inputs truncate their own text ("AI-interviewed, verified candic").
  - The Most popular card has a green border, an ad-hoc highlight.
  - The legacy-site helper paragraphs repeat 3 times.
  - Google Calendar sits at the bottom at 2/3 width while the dashboard calls it the top attention item.
- **Form:** desktop shows a compact comparison grid (rows = fields, columns = plans) with one sticky Save bar, like roles. Phone: one plan per tab.
- **Change:**
  1. Move to a field-by-plan grid with a single "N unsaved changes · Save" footer (reuse the roles pattern).
  2. Checklist rows full-width so text isn't clipped.
  3. Integrations (Google Calendar) at the top as its own Panel with a status Pill.
  4. One legacy note, not three.
- **States:** a validation error shows inline per field. A save conflict shows the server message.

### /admin/roles: Roles and access
- **Job:** rare. Add staff, change permissions.
- **Deserves the most space:** the permission matrix.
- **Wasted now:**
  - The Super Admin column is all disabled checks that read as unchecked grey.
  - Column headers are centred with edit and delete icons for each role.
  - Section header rows are the same weight as permission rows.
- **Form:** a matrix table on desktop. Phone: read-only, one role at a time via a select.
- **Change:**
  1. Replace the Super Admin column with a one-line note ("Super Admin has every permission") and drop the column.
  2. Move role edit/delete into a header menu.
  3. Make section rows `bg-ink-50` sticky subheads.
  4. Put the sticky "No unsaved changes / Save" footer at the viewport bottom.
- **States:** a single staff member is shown honestly. Removing the last Super Admin is refused with a reason.

### /admin/account: Your account
- **Job:** rare.
- **Deserves the most space:** nothing in particular; this is a small form.
- **Wasted now:**
  - The two cards are equal height with empty space under Profile.
  - The password rules contradict each other: "upper and lower case letters and a number" in the header, but "+ a special character" under the field.
  - The disabled Save buttons are a washed-out green.
- **Form:** a single column (max-w-xl) with Profile then Password. Phone: the same.
- **Change:**
  1. Single column, no card header descriptions.
  2. One password rule, matching the validator.
  3. Disabled buttons use the `buttonClass` disabled style.
- **States:** a wrong current password is shown inline. Success shows "Password changed".

---

## College (drafted by agent, edited)

Source read: DESIGN.md §0 (incl. "No AI slop"), docs/college-partners/design-brief.md, src/app/college/**, src/components/college/**, employer drive files, intern college, /drive/[token]. Shots: docs/qa/baseline/college/*, employer/drives-*, intern/college-*. There is **no baseline shot** for /employer/drives/[id] or /drive/[token]; those two briefs come from the source only.

### College area: cross-screen findings

- **The college console never moved onto the §0 system.** It still uses `AdminPageHeader`, admin `StatCard` (an icon on every tile), `AdminEmpty`, raw `apple-panel` sections and hand-written button strings: Open report / Watch recording on students/[id], Issue a new link / Close link in link-actions, Paste rows in roster-import. Meeting status is an ad-hoc `rounded-full bg-ink-100` chip, not `Pill`. Move it to `PageHead`, `StatTile`, `Surface`/`Panel`, `EmptyScene`, `Pill` and `buttonClass` before any layout work.
- **"Ask me" FAB collisions.** On every 390 shot it covers the third bottom tab (**Roster is unreachable on phone**). At 1440 it sits on the student search (home), on the "Employers inside" copy (drives/[id]), on the "61 of 61" figure (drives/new) and on the roster email column. This is a shell fix (FAB offset above the tab bar, or dock it into the top bar on /college), not per page.
- **The live drive is told twice.** On drives/[id] the H1 is the drive title and the PresenceLive card repeats the same title plus a "Drive live" eyebrow. Home has the same card with no hierarchy above the student table. Presence should be *the* focal point on drive day, as one band; that is the one place `HeroBand` belongs in this console.
- **Pages are unbounded.** Home is 5447px at 1440 and 7184px at 768. 60 rows render, then a "Show all 61" button that reveals one row. The offline-chip wall caps at 12 (+23 more). The drive builder list scrolls inside the page (max-h 28rem) above a Save button that sits at the very bottom.
- **The date rule is broken.** drives/new and drives/[id] use native `datetime-local`, which renders MM/DD/YYYY (10/28/2026) against the §0 DD/MM/YYYY rule. Elsewhere dates use "28 Oct, 12:22 am" with a lowercase am/pm, which is inconsistent with the employer side's "Wed, 28 Oct, 2:27 am IST".
- **Ordering is wrong where it matters.** /college/drives sorts by `startsAt desc`, so the closed "E2E campus drive" sits above the live one. Live drives should always pin first. Breadcrumbs read "Students / Students / Details" on students/[id].
- **Thin states.** There is no `loading.tsx` or `error.tsx` under /college, so a DB failure lands on the global error page. The student-table empty state is a centred grey `<p>`. The roster "not joined" empty state is a `<p>`. The employer drive pages use the banned `EmptyState`. Nothing shows an "upcoming drive" state on home: the "No drive is live" line is a loose sentence between the tiles and the table.
- **Pills and chips everywhere.** Cohort tabs, filter chips (rounded-full), year/branch toggles, offline-name chips and status pills all look alike, which is the "pills on everything" tell. Keep `Pill` for status only. Filters should be one segmented control plus one select.

---

### /college — Students (home)
- **Job:** Between drives, find who's slipping (no interview, offer unanswered, not on roster, inactive) and nudge in one tap. During a live drive, the same page leads with presence.
- **Deserves the most space:** the student table with its filters and the bulk "Nudge these N". During a drive, presence (N/total online and the offline names with Nudge all).
- **Wasted now:**
  - The page head lede ("Live from Findtern; nothing here can be edited by your team") is a tagline.
  - Four equal icon StatCards: three are context, only "Offers waiting" is actionable.
  - The 35-chip offline wall at 0/35.
  - The "Show all 61" button for one hidden row.
  - Cohort tabs take two lines each because of the goal subtitle.
  - The footer read-only note repeats the lede.
  - The page is 5447px at 1440. "Ask me" covers the search box.
- **Form:**
  - Desktop: a dense table (keep it). Add sticky column heads and right-align the CGPA and score columns.
  - Phone: a list (the current MobileRow is right). Keep presence above it, collapsed to the figure plus Nudge all.
- **Change:**
  1. `PageHead` with the college name only. Put "Read-only" once, as a `Pill tone="neutral"` beside the title, and drop both read-only sentences.
  2. Live drive: a single `HeroBand` with `StatTile tone="onDark"` "online/total" and `buttonClass({variant:"accent"})` "Nudge all N offline", plus a link to the drive. The offline names move to drives/[id]. With no live drive, show one `Surface` row with the next upcoming drive and its date, or "No drive scheduled · Set one up".
  3. Replace the four StatCards with three `StatTile`s with denominators ("61/73 joined", "51/61 interviewed", "4 offers waiting"). Each tile sets the matching table filter on click, so a figure becomes its chase list. The median score becomes a quiet meta line.
  4. Table: paginate at 50 rows with a "1–50 of 312" footer, or virtualise. Put cohort and filter in one toolbar: a cohort select plus a segmented filter, and drop the goal subtitles. Use `EmptyScene` for "no students yet" (CTA to Roster) and "no matches" (Clear filters).
- **States:**
  - New college: empty table → `EmptyScene` "Share the invite" → /college/roster. Hide the tiles until there is a roster or students.
  - Many (500+): pagination plus server-side counts.
  - Live vs no drive: as above.
  - Presence SSE reconnecting: keep the `Pill` but put it inside the band.
  - Query failure: add `error.tsx` so it never shows as an empty table.

### /college/drives — Drives list
- **Job:** Between drives, pick a drive to manage or start a new one. During a drive, jump straight into the live one.
- **Deserves the most space:** the live or upcoming drive and its three outcome figures (employers, shortlisted, calls answered).
- **Wasted now:**
  - The lede explains what a drive is on every visit.
  - The closed drive is listed above the live one (sorted by start date).
  - The figures sit in a loose `dl` with no shared column alignment across rows.
  - On phone the date wraps onto two lines ("12:27 / am").
- **Form:**
  - Desktop: a table-like list. Columns: Drive · Window · Employers · Shortlisted · Calls answered, with right-aligned `nums`.
  - Phone: a stacked list, one row per drive, with the figures in one line.
- **Change:**
  1. Sort live first, then upcoming, then ended or closed (newest first). Add a quiet "Past" `SectionHead` before closed drives.
  2. Use `Panel` with real columns, and right-align the figures.
  3. Move the "what is a drive" copy into the `EmptyScene` only.
  4. Keep `Pill` for the window state. Show the date compactly ("27 Oct – 4 Nov, IST") and the time only on detail.
- **States:**
  - None: an `EmptyScene` that explains a drive, with "Set up your first drive".
  - Many: group by Live/Upcoming and Past, and collapse Past after 10.
  - Error: an error state, not an empty list.

### /college/drives/new — New drive
- **Job:** Between drives, set the name, type, window and eligibility, see the live "N eligible" count, then create and get the link.
- **Deserves the most space:** the eligibility rules plus the live count. The count is the feedback loop, borrowed from Superset in the brief.
- **Wasted now:**
  - The lede is a tagline ("Takes two minutes…").
  - The "61 of 61 students" figure is hidden under "Ask me".
  - Native MM/DD/YYYY date pickers.
  - The full 61-row student list with a Remove button on every row, shown before any rule is set.
  - The primary "Create drive and get link" button sits at the bottom of a 1858px page.
  - Field hint text wraps under the inputs.
- **Form:**
  - Desktop: a two-step form in one page. The left column holds the fields. A right rail (sticky) holds the eligible count, a breakdown by year and branch, and the Create button.
  - Phone: a single column with a sticky bottom bar showing "35 eligible · Create".
- **Change:**
  1. Use `PageHead` with no lede. Split into two `Surface`s ("The drive", "Who employers see"), each with a `SectionHead`.
  2. Show the eligible count as a `StatTile` in a sticky rail or bottom bar, next to the single primary button.
  3. Hide the hand-pick list behind "Adjust individual students (61)". Default it to "Left out" when rules are set, since that list is the one people check.
  4. Use a DD/MM/YYYY date plus a time field (IST labelled), not the native datetime-local.
- **States:**
  - No students yet: the count reads 0, with a note that the drive will fill as students join. Allow creation.
  - No branches recorded: keep the existing copy.
  - Validation errors: inline under each field, not only in the status line by the button.

### /college/drives/[id] — Drive detail (manage and watch)
- **Job:**
  - During a live drive: watch presence and nudge the offline students; see which companies are inside and their calls.
  - Between drives: share or reissue the link, or edit the dates and rules.
- **Deserves the most space:** live, it is presence plus employers inside. Upcoming, it is the link to share. Closed, it is the outcome (shortlists, calls answered).
- **Wasted now:**
  - The title is repeated (H1 and the presence card).
  - The full edit form is always open under the live view (2579px at 1440).
  - "Link" and "Employers inside" are two half-width cards with one sentence each.
  - "Close link now" is a bare red text button next to "Issue a new link".
  - The amber live warning is a strip between cards.
  - The 35 offline chips have no visual difference between "can get a phone alert" and "can't" (only a `title` tooltip).
  - Save sits at the very bottom.
- **Form:** a detail page.
  - Desktop: the top band is presence (live) or link (upcoming). Below it, a two-column layout with an employers table on the left and the link plus actions on the right. The edit form sits behind a disclosure or on its own "Edit" view.
  - Phone: stacked, presence first.
- **Change:**
  1. Use `PageHead` (title, window `Pill`, "35 visible to employers") as the only title. Presence becomes the screen's single `HeroBand` with no repeated title.
  2. Turn the offline list into a list rather than chips: name, roll number (always shown), and a phone-alert marker ("alert" / "next visit"). Add one `buttonClass({variant:"accent"})` "Nudge all N".
  3. Merge Link and Employers into one `Panel`: link row with Copy / Reissue / Close (the destructive action asks for confirmation). Employers become a table: company, shortlisted, calls, joined at.
  4. Collapse `DriveBuilder` behind "Edit dates and eligibility". When it is open on a live drive, the warning sits on the Save action, not on top of the section.
- **States:**
  - Upcoming: no presence. Lead with the link and "Opens 4 Nov, 10:00 IST".
  - Live with 0 employers: `EmptyScene` "Share the link…" with a Copy button.
  - Closed or revoked: show an outcome summary and hide the editing, or label it "Reopen with a new link".
  - SSE dropped: the "Reconnecting…" `Pill`.
  - Not found: the existing `notFound()`.

### /college/roster — Roster
- **Job:** Between drives, mostly at setup: upload the student list, copy the invite message, and chase who hasn't joined.
- **Deserves the most space:** "Not joined yet (12)", the chase list with Copy emails. Upload is the first-run action.
- **Wasted now:**
  - The upload card is half empty: about 200px of white below "Or paste rows" at 1440.
  - The invite `<pre>` is clipped at a max height and scrolls internally.
  - The not-joined rows are 72px tall each, with the email pushed to the far right, where "Ask me" covers it.
  - On phone, Roster cannot be reached from the bottom bar (FAB).
- **Form:**
  - Desktop: a table for not-joined (Name · Roll · Year · Branch · Email), with upload and invite as a compact strip above it.
  - Phone: a list, with the email under the name.
- **Change:**
  1. Use `PageHead` with the denominator as the figure ("61/73 joined") via `StatTile`, and drop the sentence lede.
  2. Once a roster exists, put upload and invite on one `Surface` row: "Update list" plus "Copy invite" buttons (`buttonClass` outline), with the invite text in a disclosure. Show them expanded only on the empty state.
  3. Not joined: a `Panel` table with "Copy emails" in the header. Also show the "picked your college but not on the list" count as its own row group, so it is visible and not buried in invite copy.
  4. Show the roster import result (imported or errors) as a persistent `Surface` note with `Pill` tones.
- **States:**
  - No roster: an `EmptyScene` that leads with Upload CSV (the format hint goes here).
  - Everyone joined: `EmptyScene` "All 73 have joined".
  - Import errors: list them per row.
  - Many (2,000 roster): paginate the not-joined list.

### /college/students/[id] — Student detail (read-only)
- **Job:** Between drives, check one student's score, offers and meetings, and nudge them (interview or offer reply). Often opened from a presence name during a drive.
- **Deserves the most space:** the score breakdown and the offers waiting (the thing to chase).
- **Wasted now:**
  - The breadcrumb repeats "Students / Students" and also has a back link.
  - "Recently opened by" is a full-height side card for "Nobody has opened them yet".
  - Offers and Meetings are each a full card for one row.
  - The meeting status is an ad-hoc chip, and the Report/Recording buttons are hand-styled.
  - No drive context: which drives this student is eligible for, and online now or not.
- **Form:**
  - Desktop: a detail page. Main column: score, then offers, then meetings. The side rail holds facts (`DetailRow`: roll, year, branch, goal, email, roster status, last active) and the audit views.
  - Phone: stacked, with the Nudge action pinned.
- **Change:**
  1. Use `PageHead` (name, meta line) with the Nudge action via `buttonClass`. Show the roster status as a `Pill`, and drop the separate back link (the breadcrumb is enough once fixed).
  2. Score: the big figure plus the four axes (keep). Make Open report / Watch recording `ButtonAnchor variant="outline"`.
  3. Merge Offers and Meetings into one "Activity" `Panel` list with a `Pill` status per row. Put "Nudge to reply" on the waiting offer row itself.
  4. "Recently opened by" becomes a `DetailRow` list in the rail, and collapses to one line when empty.
- **States:**
  - No interview: the score area shows "Not taken" plus Nudge (exists).
  - No offers or meetings: one quiet line, not two cards.
  - Not on roster: a `Pill tone="waiting"`.
  - Student withdrew consent: `notFound()` today. Consider an explicit "No longer sharing with your college" message instead (needs a product decision, not invented here).

---

### College-adjacent surfaces

### /employer/drives — Campus drives (employer)
- **Job:** An employer who entered from a college link finds the live drive and goes back into its workspace.
- **Deserves the most space:** the live drive row with its time left.
- **Wasted now:**
  - A two-line lede on every visit.
  - Ended or closed drives are dead cards at 80% opacity with no link, so the employer can't revisit who they met.
  - Uses the banned `EmptyState`. The 1440 shot is one card on an empty canvas.
- **Form:** a list (`Surface` rows) on desktop and phone. A table is not needed at this volume.
- **Change:**
  1. Use `PageHead` with a short lede or none. Use `EmptyScene` for none ("Open the link a college sent you while signed in").
  2. Put live first, then upcoming, then a "Past" `SectionHead`.
  3. Past rows link to a read-only summary if one exists. Otherwise they render as plain rows without the opacity trick. Don't invent a summary page; flag it.
- **States:** none (EmptyScene) / one live / many past / error (exists, but move it to an error scene).

### /employer/drives/[id] — Drive workspace (employer; no baseline shot)
- **Job:** During a live drive: filter by score and skills, shortlist, request a call now, in 5 or in 10 minutes, and track the calls in the side panel.
- **Deserves the most space:** the candidate grid (who is online, the score) and the calls rail.
- **Wasted / risk (from source):**
  - The candidate cards are 2-up `Surface`s with skills chips, avatar and score bar. That is low density for "find the 5 worth calling in the next hour".
  - Filters sit in a separate `Surface` box.
  - The notice uses ad-hoc colours.
  - Uses `buttonVariants`, `rounded-lg` and `EmptyState` (denied states), and the empty states are centred text.
- **Form:**
  - Desktop: a dense list or table (initials, year/branch, score, skills, online dot, Shortlist, Call ▾) with the calls rail sticky on the right (exists).
  - Phone: a list, with the calls rail as a top "Calls (2)" disclosure.
- **Change:**
  1. Make the filters a toolbar row above the list, not a card.
  2. Make candidates rows. Online and score lead the row, since the sort is already online first.
  3. Use `EmptyScene` for the denied, no-students and no-match states. Use `Pill` for call status (exists), and `buttonClass` for actions.
  4. Keep co-branding (`CoBrand`, `CollegeMark`) in the `PageHead` slot rather than a custom header.
- **States:** not started / ended / revoked / not joined (copy exists) / zero eligible / filters empty / call request error (notice).

### /intern/college — Your college (student)
- **Job:** One-time: join the college with two unticked consents. On drive day: don't miss the call.
- **Deserves the most space:** on drive day, the live banner and the call card. Otherwise, the membership and consent summary.
- **Wasted now:**
  - The live banner splits into two columns at 1440, with the "can't show call alerts" sentence squeezed to the right.
  - That same sentence is repeated in the "Call alerts" side card.
  - An icon tile sits in front of the college name.
  - "Leave college" is red text beside an outline button.
  - On phone, "Ask me" covers the consent heading.
- **Form:** a detail page. Desktop uses one column at reading width with the alerts card as a rail. Phone is stacked with the banner first.
- **Change:**
  1. The live banner goes full width, one line ("Drive live · open until 4 Nov") plus one action ("Turn on call alerts" or "Keep this tab open"). Show the alerts copy once.
  2. Drop the icon tile, and put "Verified student" as a `Pill` next to the name.
  3. Show the consents as `DetailRow`s with a single "Change" link. Make "Leave college" `buttonClass({variant:"ghost"})` with a confirm step.
- **States:** not joined (the college picker form) / joined but unverified / live drive / incoming call (the accept card) / push unsupported on iOS (copy exists).

### /drive/[token] — Public drive landing (no baseline shot)
- **Job:** An employer arriving from the college's email understands who, what and when, then signs in or enters.
- **Deserves the most space:** the drive title plus the college, and the single entry action.
- **Wasted / risk (from source):**
  - Four equal `Fact` cards, each with an icon. That is the "three equal cards with an icon" tell.
  - "Create an employer account" links to `/employer/signup` with no `next`, so a new employer loses the drive link after signing up. This is a functional gap; verify before the redesign.
  - There is no try/catch around the DB query, so a DB error shows a 500 page.
- **Form:** a landing detail. Desktop is the existing two columns. Phone puts the entry panel first, under the title.
- **Change:**
  1. Replace the Fact cards with a single `DetailRow` list (Opens, Closes, Eligible students, AI-interviewed).
  2. Keep the entry panel `Surface` with exactly one primary `ButtonLink`, and carry `next` through signup.
  3. Ended, revoked and upcoming use `EmptyScene`-style copy inside the panel (it exists, so align the tone).
- **States:** upcoming / live / ended / revoked / signed in as a non-employer / logged out / bad token (404) / DB error.
