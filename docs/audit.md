# Findtern Admin Panel Comprehensive Screen Audit

This document records the exhaustive baseline audit of every admin screen in Findtern (`~/desktop/nextjs-findtern`), evaluated against the reference functionality in `~/FindTern` and verified through headless Playwright browser runs at 1440px, 1024px, 768px, and 390px viewports.

---

## 1. Authentication Screen: Admin Sign In (`/admin/login`)

### Purpose
Allows authenticated administrative staff to access the management portal with email and password credentials. The primary task is fast and secure login.

### Discrepancies
- **Hierarchy**: The sign in card is centered in an empty container without brand storytelling, security assurance badges, or environment indicators.
- **Spacing and Alignment**: The form field vertical gap is inconsistent; the submit button sits too close to the password input field.
- **Typography**: The heading "Admin sign in" lacks confidence and authoritative weight. Form labels lack crisp tracking.
- **Color and Contrast**: Generic input borders lack active focus ring elevation.
- **Density**: The form container is overly narrow on 1440px desktop, looking abandoned in vast whitespace.
- **Component Consistency**: Uses basic input elements without password visibility toggles or loading spinners on submit.
- **Navigation and Wayfinding**: No breadcrumbs or links back to the main public marketplace.
- **Feedback and States**: Error state shows a raw red alert box that jars the layout; no inline validation.
- **Motion**: Submit action lacks transition feedback or progress indication.
- **Responsiveness**: On 390px mobile, padding drops abruptly and keyboard focus causes viewport zoom issues.
- **Accessibility**: Missing explicit `aria-describedby` links between inputs and error messages.
- **Copy**: Contains hyphens in placeholder text and system messages.

### Missing States
- Loading state during Argon2id verification
- Rate limited locked state
- Network failure offline indicator

### Severity and Fix Direction
- **Severity**: Major
- **Fix Direction**: Rebuild with a dual pane administrative portal shell featuring deep brand green backdrop, clear security badges, password reveal toggle, and smooth spring feedback.

---

## 2. Overview Screen: Admin Dashboard (`/admin/dashboard`)

### Purpose
Central command center for marketplace operators to monitor key performance indicators, active candidate onboarding, interview velocity, pipeline distribution, and financial health. Primary task is spotting bottlenecks and jumping to pending operational queues.

### Discrepancies
- **Hierarchy**: Metric cards compete equally for attention; total signups has the same visual weight as urgent pending interview queues.
- **Spacing and Alignment**: Trend chart and pipeline bars suffer from uneven internal padding (16px versus 24px mismatch).
- **Typography**: Numeric figures are set in proportional numerals instead of tabular numbers, causing numerical drift across cards.
- **Color and Contrast**: Pipeline status bars use saturated raw colors that do not harmonize with the brand green palette.
- **Density**: Information density is weak on large screens (1440px) while awkwardly packed on tablet (768px).
- **Component Consistency**: Custom panel wrappers mix inline styles with utility classes instead of using Watermelon and shadcn card primitives.
- **Navigation and Wayfinding**: Stat cards do not function as interactive deep links to filtered list views.
- **Feedback and States**: When metrics fail to load, the entire page drops to zeroes with an abrasive top banner rather than graceful card level skeletons.
- **Motion**: No smooth counter animation when stats load.
- **Responsiveness**: On 390px mobile, the 6 stat cards stack into a massive vertical scroll without summary grouping.
- **Accessibility**: Charts lack accessible tabular fallbacks and screen reader data tables.
- **Copy**: Banner text and headers contain em dashes and hyphens.

### Missing States
- Partial data state when analytics background job is compiling
- Filtered date range empty state
- Zero activity state for new marketplace regions

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Rebuild using Watermelon animated count up metrics, discrete time range tabs, interactive KPI cards with directional badges, and accessible SVG sparkline trends.

---

## 3. People Screen: Intern Directory (`/admin/interns`)

### Purpose
Primary operational workspace for talent leads to triage, verify, inspect, and approve student intern candidates. Primary task is searching, filtering by domain and verification status, and toggling marketplace visibility.

### Discrepancies
- **Hierarchy**: Candidate name, email, and phone number compete horizontally without secondary hierarchy.
- **Spacing and Alignment**: Table cell padding is loose, allowing only 8 to 10 rows per viewport fold.
- **Typography**: Phone numbers and dates use non tabular fonts.
- **Color and Contrast**: Status badges for "live" and "hidden" use ambiguous grey tones that do not clearly communicate directory presence.
- **Density**: Columns take up arbitrary widths with text truncation on smaller desktop widths.
- **Component Consistency**: Lacks a slide over detail drawer (Sheet); admins must lose table context to view detailed portfolios.
- **Navigation and Wayfinding**: Table search does not offer instant debounced results or keyboard shortcuts.
- **Feedback and States**: Bulk action bar pops in abruptly without spring animation.
- **Motion**: No micro interactions on row hover or visibility toggle.
- **Responsiveness**: On 390px and 768px viewports, the table blows out horizontal scroll without an optimized card view.
- **Accessibility**: Missing `aria-sort` headers and keyboard arrow navigation across table rows.
- **Copy**: Contains hyphens in column headers ("Non disclosure") and status badges.

### Missing States
- Search query with zero matches (filtered empty)
- Profile loading skeleton
- Permission denied state for restricted reviewers

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Rebuild with a high density data table featuring sticky headers, Watermelon status picker for instant visibility toggles, slide over candidate inspection Sheet, bulk selection action drawer, and responsive stacked list cards on mobile.

---

## 4. People Screen: Company Directory (`/admin/companies`)

### Purpose
Directory of registered employers and hiring partners. Primary task is verifying company profiles, checking active projects, and verifying employer legitimacy.

### Discrepancies
- **Hierarchy**: Currently a crude 29 line unstyled bullet list (`<ul><li>`) with zero data table structure.
- **Spacing and Alignment**: Basic list items with minimal padding and no grid alignment.
- **Typography**: Plain body text without font weight hierarchy between company name, industry, and email.
- **Color and Contrast**: No status indicators or verification badges.
- **Density**: Extremely low density; wastes 85% of screen real estate.
- **Component Consistency**: Completely missing table, search bar, pagination, and filter toolbars.
- **Navigation and Wayfinding**: No way to click into a company to view active projects or past hires.
- **Feedback and States**: No loading states or action feedback.
- **Motion**: None.
- **Responsiveness**: List collapses without structured columns.
- **Accessibility**: Not navigable via keyboard table patterns.
- **Copy**: Generic subtitle "All registered employers."

### Missing States
- Empty state with invitation CTA
- Loading skeleton table
- Search filtered empty state

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Rebuild completely from scratch using shadcn Table with columns for Company, Industry, Hiring Scale, Active Projects, GST Verification Status, and slide over company detail Sheet.

---

## 5. Finance Screen: Transactions (`/admin/transactions`)

### Purpose
Financial ledger tracking employer payments and intern payouts. Primary task is auditing transaction statuses, matching gateway reference IDs, and verifying successful disbursements.

### Discrepancies
- **Hierarchy**: Only 35 lines of stub code querying `employerPayments` while completely ignoring live `internPayouts` in the database.
- **Spacing and Alignment**: Raw list items without aligned tabular columns.
- **Typography**: Currency amounts do not use tabular numbers and lack currency formatting consistency.
- **Color and Contrast**: Status badges use single flat brand green regardless of status (success, pending, failed).
- **Density**: Sparse bullet list with zero financial ledger density.
- **Component Consistency**: Lacks date picker, payment gateway filter, export to CSV action, and transaction detail drawer.
- **Navigation and Wayfinding**: No tabbed navigation between Inbound Payments and Outbound Payouts.
- **Feedback and States**: Shows "Payments will appear here" because the wrong table was queried.
- **Motion**: None.
- **Responsiveness**: Unresponsive text wrap on mobile.
- **Accessibility**: No table semantics; screen readers perceive an unordered list.
- **Copy**: Incomplete description text.

### Missing States
- Split ledger tabs (Employer Inbound vs Intern Outbound)
- Date range filter empty state
- Razorpay gateway sync error state

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Rebuild as a unified financial ledger with Watermelon discrete tabs for Employer Deposits and Intern Disbursements, tabular amounts, gateway status pills, date range filtering, and CSV export.

---

## 6. Finance Screen: Reports & Analytics (`/admin/reports`)

### Purpose
Operational and executive reporting on hiring velocity, conversion funnels, revenue cohorts, and university demographics. Primary task is analyzing trends and exporting audit ready reports.

### Discrepancies
- **Hierarchy**: Entire screen is a 15 line placeholder stating "Reports, charts, and CSV/PDF exports will be wired in the next pass."
- **Spacing and Alignment**: Single card box sitting awkwardly on screen.
- **Typography**: Generic placeholder text.
- **Color and Contrast**: Neutral box without data visualizations.
- **Density**: Completely empty.
- **Component Consistency**: Zero charts, metrics, or export actions.
- **Navigation and Wayfinding**: No sub reports or cohort tabs.
- **Feedback and States**: Static placeholder only.
- **Motion**: None.
- **Responsiveness**: Empty card wraps.
- **Accessibility**: Zero data structure to expose.
- **Copy**: Contains hyphens and promises future wiring.

### Missing States
- Full analytics reporting engine
- CSV and PDF export handlers
- Date range comparison states

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Build complete analytics dashboard featuring Hiring Funnel conversion waterfall, monthly revenue breakdown, university demographic distribution, and working CSV data export.

---

## 7. People Screen: Roles & Permissions (`/admin/roles`)

### Purpose
Administrative access control and team governance. Primary task is managing administrative accounts, assigning security roles (Super Admin, Talent Lead, Finance Admin), and auditing permissions.

### Discrepancies
- **Hierarchy**: 28 line stub rendering only role names in an unstyled list.
- **Spacing and Alignment**: No permission matrix grid.
- **Typography**: Plain unweighted text.
- **Color and Contrast**: No badges for permission scopes or account counts.
- **Density**: Vacant screen with single column list.
- **Component Consistency**: Missing admin user table, role editor modal, and permission toggle switches.
- **Navigation and Wayfinding**: No tab between Role Definitions and Active Staff Members.
- **Feedback and States**: Cannot edit or add roles.
- **Motion**: None.
- **Responsiveness**: Stacks as raw list items.
- **Accessibility**: Lacks accessible checkbox groups for permission assignments.
- **Copy**: Minimal unconsidered copy.

### Missing States
- Add admin modal
- Role permissions edit dialog
- Self role edit protection warning

### Severity and Fix Direction
- **Severity**: Blocker
- **Fix Direction**: Rebuild with a two tier interface: Admin Staff Members table with invite workflow, and Role Permission Matrix with granular resource checkboxes.

---

## 8. Finance Screen: Promo Codes (`/admin/promo-codes`)

### Purpose
Marketing and discount code management for employer subscriptions. Primary task is creating promotional codes, setting percentage discounts, monitoring redemption limits, and deactivating expired campaigns.

### Discrepancies
- **Hierarchy**: 31 line stub displaying only code name and discount type as text strings.
- **Spacing and Alignment**: Simple list without column alignment.
- **Typography**: Code text is not styled in monospace or distinct uppercase pill.
- **Color and Contrast**: No active versus expired color coding.
- **Density**: Lacks usage counts, expiry dates, and creation timestamps.
- **Component Consistency**: Missing Create Promo Code dialog, toggle switch for active status, and copy button.
- **Navigation and Wayfinding**: No filters for Active, Expired, or Depleted codes.
- **Feedback and States**: Cannot create or toggle codes.
- **Motion**: None.
- **Responsiveness**: Unstyled list.
- **Accessibility**: No interactive switch controls.
- **Copy**: Minimal copy.

### Missing States
- Create Promo Code modal
- Expired code visual state
- Zero redemptions state

### Severity and Fix Direction
- **Severity**: Major
- **Fix Direction**: Rebuild as an interactive promo code console with code creation dialog, copy to clipboard button via Watermelon copy confirm, active toggle switch, and redemption progress meters.

---

## 9. Overview Screen: Contact Messages (`/admin/messages`)

### Purpose
Inbound communication queue for student inquiries, employer partnerships, and support issues. Primary task is reviewing submissions, changing status to resolved, and responding.

### Discrepancies
- **Hierarchy**: 31 line stub listing submissions as text paragraphs without read/unread flags or subject categorization.
- **Spacing and Alignment**: Long message text overflows without clamp or expansion controls.
- **Typography**: Message text lacks sender name hierarchy.
- **Color and Contrast**: No visual distinction between fresh unread inquiries and resolved archives.
- **Density**: Inefficient vertical card stack.
- **Component Consistency**: Lacks quick reply drawer, status update buttons, and subject search.
- **Navigation and Wayfinding**: No category filter by subject or sender role.
- **Feedback and States**: Missing resolve message action.
- **Motion**: None.
- **Responsiveness**: Text overflows viewport on 390px mobile.
- **Accessibility**: Missing status announcements for assistive technology.
- **Copy**: Line 22 contains literal em dash forbidden by project rules.

### Missing States
- Filtered by subject empty state
- Slide over message reader drawer
- Quick reply confirmation toast

### Severity and Fix Direction
- **Severity**: Major
- **Fix Direction**: Rebuild as an operational inbox with status filtering (Unread, In Progress, Resolved), subject badges, slide over reader Sheet, and resolve action buttons.

---

## 10. Content Screen: Website CMS (`/admin/cms`)

### Purpose
Content management system for the public marketing site, including hero sliders, blog posts, student testimonials (happy faces), partner logos, and FAQ entries. Primary task is managing marketing site content without code deployments.

### Discrepancies
- **Hierarchy**: 15 line placeholder with zero functional interface.
- **Spacing and Alignment**: Empty card placeholder.
- **Typography**: Static explanatory text.
- **Color and Contrast**: Single white card.
- **Density**: Empty.
- **Component Consistency**: Missing CMS tabs, item forms, image preview cards, and active switches.
- **Navigation and Wayfinding**: Missing sub navigation for CMS sections.
- **Feedback and States**: Completely non functional.
- **Motion**: None.
- **Responsiveness**: Empty container.
- **Accessibility**: None.
- **Copy**: Promises future wiring.

### Missing States
- Tabbed management across Testimonials, Partners, FAQs, Blog Posts
- Image upload preview
- Item reorder controls

### Severity and Fix Direction
- **Severity**: Major
- **Fix Direction**: Rebuild with Watermelon discrete tabs for Testimonials, Partner Logos, FAQs, and Pricing Plans, complete with item cards, active toggles, and edit drawers.

---

## 11. Work Screens: Projects & Proposal Tracker (`/admin/projects`, `/admin/proposal-tracker`)

### Purpose
Tracking active employer projects, internship proposals sent to candidates, interview stages, and hiring outcomes.

### Discrepancies
- **Current State**: Both routes return 404 in the current application despite being present in navigation links and fully functional in the old repository.
- **Severity**: Blocker
- **Fix Direction**: Implement both screens with live database queries against `projects`, `proposals`, and `interviews`.
