# Phase 0 findings

Discovery for the admin rebuild. Read before touching any screen.

## 0.1 Two codebases

The path in the brief, `~/home/findtern`, does not exist. The old application is at:

```
/home/wynautbhav/FindTern
```

A second candidate, `/home/wynautbhav/FIndtern By WynautBhav`, is a Next.js prototype
named `findtern-web` running on Supabase. It is not the deployed app and is not the
reference. `/home/wynautbhav/FindTern` is the reference: it is `rest-express` plus Vite
plus Drizzle, its `schema.sql` is 19 KB, and its route table matches the deployed bundle
at findtern.in.

| | Old (`FindTern`) | New (`Desktop/nextjs-findtern`) |
| --- | --- | --- |
| Stack | Express, Vite SPA, Drizzle | Next.js 16.3.8 App Router, React 19, Drizzle |
| Admin screens | 32 | 9 |
| Admin server lines | ~18457 in `server/routes.ts` | 21 route files |
| Auth | `express-session`, `req.session.admin` | Signed cookie `ft_sid` via `lib/security/session.ts` |
| Permissions | 16 granular keys resolved at login | none |

The old app is read only for this project. Nothing under `/home/wynautbhav/FindTern` was
modified.

## 0.2 What exists in the old app and does not exist in the new

This is the functional gap, and it is the most important output of Phase 0. The new admin
is not a rebuild with a few rough edges; it is roughly a quarter of the old one, and the
nav currently hides that.

**Old admin routes, 32 screens.** The old nav covers 28 of them. Grouped by area:

Overview: dashboard, proposal tracker, notifications, notification history, contact
messages, roles.
People: interns, intern terms, non disclosure clauses, companies, company terms, intern
detail, company detail.
Work: projects, admin skills.
Finance: reports, transactions, orders, payouts, intern invoices, promo codes.
Content: blogs, featured skills, happy faces, partners, pricing, FAQ, terms.

**New admin routes, 9 pages.** dashboard, interns, companies, messages, roles,
promo codes, transactions, reports, cms. Of those, six are stubs between 13 and 34 lines:
`reports` and `cms` are literally the sentence "will be wired in the next pass".

**Eleven of nineteen sidebar links 404.** Verified against the filesystem:

```
404  /admin/interns/terms          404  /admin/projects
404  /admin/interns/non-disclosure 404  /admin/proposal-tracker
404  /admin/companies/terms        404  /admin/orders
404  /admin/payouts                404  /admin/intern-invoices
404  /admin/notifications          404  /admin/notification-history
```

The nav in `src/app/admin/layout.tsx` was written against the old app's route list and
copied over without checking that the pages existed.

**The sidebar also hides its own primary routes.** `AdminNav` renders the first item of
each group as a disclosure button rather than a link, so Dashboard, Interns, Projects,
Reports and Website CMS are buttons. Confirmed in the accessibility tree:
`button "Dashboard" expandable expanded`, not a link. The only reachable routes in those
groups are the child items, which are mostly the 404s.

**Missing admin APIs.** The old server has 69 admin endpoint registrations. The new repo
has 21. Absent entirely:

```
/api/admin/users                 /api/admin/employers
/api/admin/projects              /api/admin/proposals-tracker
/api/admin/reports/analytics     /api/admin/reports/transactions
/api/admin/admins                /api/admin/contact/messages
/api/admin/interns/payments      /api/admin/me, /profile, /change-password
/api/admin/website/{blogs,faces,faq,partners,plans,pricing,skills,slider,terms}
```

The nine CMS endpoints matter most: the old `admin-website.tsx` is 2768 lines driving
nine tables, and the new repo has no route for any of them.

## 0.3 A permission model was dropped

The old login resolves permissions and stores them on the session
(`server/routes.ts:4310`):

```ts
const roleKey = String(admin.role ?? "").trim();
const role = roleKey ? await storage.getAdminRoleByKey(roleKey) : undefined;
const permissions =
  roleKey.toLowerCase() === "super_admin" ? ["*"] : (role?.permissions ?? []);
req.session.admin = { id, email, role, name, permissions };
```

The new login (`src/app/api/auth/admin/login/route.ts`) does `role: "admin"`
unconditionally, and `SessionData` has no permissions field. The `admin_roles` table and
its API exist, and `adminRoles.permissions` is populated for all five roles in the local
database, but nothing reads it at request time. **Creating a restricted role currently
grants full access.**

Local admin accounts and their roles:

| Email | Name | Role key | Resolved permissions |
| --- | --- | --- | --- |
| admin@findtern.in | Super Admin | super_admin | `["*"]` |
| vaibhav@findtern.in | Vaibhav | super_admin | `["*"]` |
| admin@findtern.dev | Demo Admin | super_admin | `["*"]` |
| romil.gupta@findtern.in | Romil Gupta | exec_accounts | reports, transactions |
| somil.jangid@findtern.in | Somil Jangid | exec_operations | interns, notifications, contact intern |
| mishita.narang@findtern.in | Mishita Narang | exec_sales | companies, contact employer |

Three real executives hold deliberately narrow roles. Under the current code all three
have unrestricted admin. That is a blocker, and it is a one line fix at login plus a
guard in the layout.

The sixteen permission keys are: `dashboard:read`, `users:read`, `reports:read`,
`transactions:read`, `interns:read`, `interns:write`, `companies:read`,
`companies:write`, `cms:read`, `cms:write`, `contact:intern:read`, `contact:intern:write`,
`contact:employer:read`, `contact:employer:write`, `notifications:write`, `roles:write`.
Note `notifications:read` is used by the seeded rows but is absent from the old roles
screen's checkbox list, a small inconsistency in the old code worth resolving once.

## 0.4 Data model

35 tables in `src/lib/db/schema.ts`. The admin surface touches nearly all of them. Row
counts in the local database: 439 users, 314 with onboarding, 16 employers, 12 projects,
255 interviews, 0 proposals, 32914 notifications, 0 payments.

The 0 proposals and 0 payments matter for design: the pipeline, revenue, hiring speed and
proposal tracker are all empty. Those screens will be designed and verified against empty
and populated states deliberately rather than by accident.

Tables carrying fields the new admin never reads but the old one did: `employers.bankName`,
`accountNumber`, `accountHolderName`, `ifscCode`, `swiftCode`, `gstNumber` (49 columns on
`employers` in total), `intern_onboarding.aadhaarNumber` and `panNumber`, `intern_document`
file names, `proposals.offerDetails` and `aiRatings`, `timesheets.entries`.

## 0.5 What the baseline screenshots show

Fourteen images in `docs/screenshots/before/`. Headline findings, all verified in a real
browser:

**Major, not blocker: tables clip their columns.** Measured, correcting my first read of
the screenshots: there is **no page level horizontal overflow** at 1440, 1152 or 390.
`document.scrollWidth` equals `innerWidth` in every case. The tables sit in wrappers with
`overflow-x: auto`, so they scroll rather than break the layout, which is the approach the
UX guidance endorses.

The real problem is column loss. At 1152 the intern table needs 919 px inside an 818 px
wrapper and the project table 1164 px inside the same, so Profile, Account and Directory
are simply not visible without scrolling, and there is no affordance saying so. At 390 the
tables need 919 and 1164 px inside 356 px. Scrolling is legitimate; silently hiding two
of the most important columns on a screen whose job is triage is not. Column priority,
dropping, and a visible scroll cue are required.

**Major: the KPI row reflows to three columns at 1152**, so the six KPIs occupy two rows
and push the charts below the fold. Six equal cards is also the banned icon, title,
sentence grid.

**Blocker: the sidebar does not fill the page.** The dark `aside` is
`sticky top-0 h-[100dvh]`, so it is exactly one viewport tall. On a page taller than the
viewport the dark panel stops partway down and white shows below it. Visible in every full
page baseline screenshot. Its own height measures `viewportH`, confirming the cause.

**Blocker: eleven dead nav links, plus the primary links are buttons.**

**Major: the dashboard is two full tables stacked.** The intern table shows 25 rows and
the project table another 12, under a chart that is entirely empty because there are no
proposals. The most valuable screen in the product is spending its entire vertical budget
on a list that also exists on its own page.

**Major: Messages is an unmoderated spam inbox.** The baseline screenshot shows the full
list dominated by Google Ads submission spam, crypto support scams and lottery
fraud, all with Indian phone numbers. `contact_messages.isRead` exists in the schema and
the new page never reads it. An admin triage screen needs spam handling, not just a list.

**Major: mobile search collapses to a bare icon.** At 390 the search input measures
**70 px wide and 36 px tall**. It renders as a magnifier glyph with no usable field, so
search is effectively unavailable on a phone. 70 px is also far below the 44 px touch
target minimum the brief sets.

**Major: every table row shows `+91 0000000000`.** Nine of the first fourteen intern rows
have a placeholder phone. Real data, but it means contact columns read as broken.

**Minor: phone numbers render as `+91 9876050010` with no separator**, and the country
code is a separate text node from the number, so copy yields `+919876050010`.

**Minor: dark mode is absent**, confirmed by measurement rather than inference. At 390 the
`aside` computes `display: none`, so the mobile path is a different shell, not a narrower
one.

## 0.6 Admin users and their top five jobs

Six accounts, four real people plus two shared. Three executives hold narrow roles by
design, which tells us the product is used by people with narrow remits, not by one
omniscient operator. That is the single most important design fact in this document.

Jobs ranked by frequency and consequence. Frequencies are estimated from the old
codebase's screen sizes and the shape of the data, since there is no analytics.

### 1. Triage intern applications

Frequency: daily, several times a day. This is the core loop of the business.
Importance: highest. An intern who is not reviewed does not get placed.
Complexity: high, and the current UI makes it worse.
Current friction: 314 interns with onboarding, 125 of them with incomplete profiles. The
Interns screen sorts by newest and offers no way to find the ones that need work. There is
no saved view, no column control, no row action to open a profile, and the detail page
that the old app had at `/admin/interns/:id` (4662 lines, the largest admin file in the old
codebase) does not exist at all.

### 2. Move a proposal along the pipeline

Frequency: several times a day.
Importance: highest. This is where revenue is made.
Complexity: high.
Current friction: `/admin/proposal-tracker` does not exist. The dashboard shows a pipeline
of six statuses that are all zero, and links to a 404. The old tracker was 1644 lines.

### 3. Reconcile money

Frequency: daily for accounts, weekly for operations.
Importance: high.
Complexity: medium to high.
Current friction: three of the six finance screens do not exist. Transactions renders an
empty state. `employer_payments` and `intern_payouts` are both empty locally, so the
design has to be verified against real payment data that we do not have yet.

### 4. Publish site content

Frequency: weekly to monthly, bursty around launches.
Importance: medium, but high visibility when wrong.
Complexity: medium.
Current friction: the CMS is one sentence of placeholder text. Nine endpoints are missing.
Every CMS table has a `sortOrder`, so drag reorder is a real need rather than a flourish.

### 5. Unblock a person

Frequency: daily, but short.
Importance: high. Interns email support because an account is stuck.
Complexity: low per action, high in aggregate.
Current friction: Messages is an unreadable wall of spam with no read state, no reply, no
assignee. Intern detail does not exist, so the most common support task has no screen.

**Ordering consequence.** Job 1 is the most frequent and highest value, so Interns and
intern detail get built first, then the proposal tracker. Money and content follow. The
Roles screen comes late but the permission *enforcement* it represents is a Phase 2
blocker, because three executives currently hold unrestricted access.

## 0.7 Skills read, and the rules that bind this work

**impeccable**, in Operate mode. Admin is Operate, not Persuade: scanability,
consistency and the real usage scene outrank expression, and brand lives in precise
details. Fixed rem scale rather than fluid clamp, because a fluid h1 in a sidebar looks
worse. 150 to 250 ms on most transitions. Skeletons not spinners. Overlays must escape
their container, which is a live bug for the command palette since it renders no dialog.
Every interactive component needs default, hover, focus, active, disabled, loading and
error. Modal is not the first thought.

From the craft floor, the bans that bite hardest here: no grid of identical icon, title
and gray sentence cards; no eyebrow kicker above a heading; no decorative glass or blur;
no gradient text; declare elevation once, border *or* shadow, never a 1px border under a
wide soft shadow; no emoji or unicode glyph standing in for an icon; tracking floors at
-0.04em. Tabular numerals in data are called out as browser surface that ships with
defaults belonging to no design system, which is exactly the brief's rule.

The bounded pass rule matters: build fully, inspect once as a batch, fix everything in one
batch, confirm with at most one more round, then stop. Open ended self QA spends the
user's money and does worse than the finish handoffs.

**ui-ux-pro-max**, `data-dense-dashboard` style: 12 column grid, 8 px gap, 12 px card
padding, 12 to 14 px type, 36 px table rows, 240 px sidebar, 56 px header, sticky table
headers, and a plain "don't" for wide tables breaking the layout. Its table guidance
confirms horizontal scroll or a card layout is acceptable at small widths, which is the
route to take rather than shrinking a seven column table into 390 px.

**Tailwind v4 and the existing token file.** `globals.css` is a real, carefully argued
token layer with measured WCAG contrast, a radius scale, tinted shadows, named easings
and a single reduced motion switch. It is worth extending, not replacing. It does
contradict the brief in two places worth deciding deliberately: the motion there is 340
to 800 ms for brand surfaces, against the brief's 120 to 300 ms, and `--text-2xs` is
0.75rem, having been moved off 11 px deliberately.

## 0.8 Dark mode

Not supported. There is no `@custom-variant dark` in `globals.css`, no `.dark` class and
no `prefers-color-scheme` handling, while `viewport.themeColor` advertises a dark colour
and ten shadcn primitives plus five installed Watermelon components already carry
`dark:` classes that Tailwind never generates. So dark mode is currently dead code in
two directions. Baseline screenshots are light only, and the brief says to capture dark
"if supported". Recommend adding it in Phase 2 with `next-themes`, since 30 catalogue
components expect it.