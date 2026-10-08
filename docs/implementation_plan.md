# Findtern Master UI/UX & Interactive System Implementation Plan
**Platform Redesign, Interactive Capabilities, Gamification & Parity Architecture**

---

## 1. Executive Summary & Design Vision

### The Problem Today
The current Findtern rewrite succeeded at backend security, clean routing, and baseline parity, but visually and experientially it looks like **"plain default AI slop"**:
- **85% of pages are passive read-only data viewers**: unlike live `findtern.in` (which features full project CRUD, order management with invoice downloads, schedule slot controls, and interactive 8-step profile editors), our pages show static strings with zero editing affordances.
- **Three fragmented design systems**: Admin, Intern, and Employer each use different padding scales, competing white-card borders (8 distinct recipes), 3 different responsive breakpoints, and leaked database enums (`interview_first`, `pending_review`).
- **Missing the product's core differentiator**: the AI Interview Feedback Report (live renders a comprehensive scored report with transcript evidence and PDF export) is reduced to four static numbers.
- **Zero retention engine for students**: interns face a flat, uninspiring dashboard with no clear progress feedback, milestone markers, or ethical gamification to guide them toward market readiness.

### The Transformation Goal
Transform Findtern into a **Tier-1 talent and hiring operating system** rivaling **Linear, Stripe, Ashby, and Mercury**:
1. **Material Realism & Deep Brand Craft**: Forest green (`#0e6049`, `brand-700`), warm neutral canvas (`#f9fafb`), tinted soft shadows (`rgb(14 96 73 / 0.05)`), hairline borders, and strict weight-capped typography (Poppins capped at 500/600).
2. **Every Screen Actionable & Editable**: Transition from passive tables to interactive operational consoles using slide-out editing sheets (`ui/sheet`), inline toggles, bulk action drawers, and optimistic UI.
3. **Ethical Gamification Engine for Interns**: High-retention student journey featuring the **Findtern Readiness Meter**, progressive milestone levels, interactive onboarding checklists, and demystified interview score breakdowns without predatory dark patterns.
4. **Watermelon UI & shadcn Primitive Foundation**: Full migration to `@watermelon` primitives (`data-table`, `discrete-tabs`, `onboarding-checklist`, `sheet`, `copy-confirm`, `editable-chip`, `sonner`).

---

## 2. Foundational Design System & Layout Architecture

### 2.1 Unified Design Tokens (`src/app/globals.css`)
Consolidate the 3 fragmented styling layers into a single source of truth:

```css
/* Core Palette */
--color-brand-950: #04231b;  /* Deep sidebar canvas */
--color-brand-900: #07382c;
--color-brand-700: #0e6049;  /* Primary brand interactive */
--color-brand-600: #12775b;  /* Hover state */
--color-brand-50:  #f0f7f4;  /* Tinted active pills / badges */

--color-canvas-subtle: #f9fafb; /* App page background */
--color-surface:       #ffffff; /* Elevated cards and panels */
--color-surface-hover: #fcfdfd;

/* Border & Elevation Rungs */
--border-hairline: 1px solid rgba(14, 96, 73, 0.08);
--border-subtle:   1px solid rgba(15, 23, 42, 0.08); /* ink-100 */
--border-strong:   1px solid rgba(15, 23, 42, 0.16); /* ink-200 */

--shadow-panel:    0 1px 3px rgba(14, 96, 73, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02);
--shadow-hover:    0 10px 25px -8px rgba(14, 96, 73, 0.12), 0 4px 8px -4px rgba(15, 23, 42, 0.04);
--shadow-drawer:   -8px 0 32px rgba(15, 23, 42, 0.12);

/* Typography & Weights */
--font-sans: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
--weight-regular: 400;
--weight-medium:  500;
--weight-semibold: 600; /* Strict ceiling: no 700/800 bold clutter */

/* Motion Scale */
--dur-instant: 120ms; /* hover, click, micro */
--dur-standard: 240ms; /* drawer slide, accordion, tab switch */
--dur-smooth:   400ms; /* score counter, modal reveal */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

### 2.2 Rhythm & Density Standards
- **Grid Increment**: Strict 4px base. Component gaps: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px).
- **Surface Padding**: Cards and Panels use `p-6` (24px) or `p-5` (20px), never an arbitrary 16px. Inner elements use `gap-4` (16px) — preserving the rule that *inner gap is always smaller than outer padding*.
- **Shell Layout**:
  - Sticky `100dvh` left sidebar for Admin (`w-64`) and Employer (`w-64`).
  - Max content width: `max-w-7xl` centered with responsive page gutters `px-4 sm:px-6 lg:px-8`.
  - Tablet/Desktop consistency: breakpoint unification at `lg` (1024px) for all three roles.

---

## 3. Interactive Data & Editing Pattern ("Editable, Not Just Viewable")

### 3.1 The Slide-Out Entity Drawer (`ui/sheet`)
Whenever an entity requires inspection or mutation, avoid full-page navigation or cramped inline forms:
1. **Table Row Click or "Edit" Action** triggers a Sheet drawer sliding from the right (`w-full sm:max-w-xl md:max-w-2xl`).
2. **Context Preservation**: The background table remains visible with an overlay backdrop, preserving scroll position and active filters.
3. **Optimistic Mutation**: Changes save via server actions or mutation handlers with instant UI update, accompanied by a rich `sonner` toast confirmation (`"Project updated successfully"`).
4. **Applied To**:
   - Employer: Project Create / Edit Drawer, Candidate Detailed Dossier & Feedback Viewer, Send Proposal Drawer.
   - Admin: Staff Role Assignment Drawer, CMS Item Editor, Contact Message Triage & Reply Drawer, Intern Skill Proficiency Adjuster.
   - Intern: Experience Item Editor, Project Link Modal, Language & Fluency Drawer.

### 3.2 Floating Multi-Select & Bulk Actions (`BulkSelect`)
In list views (Candidates, Projects, Proposals, Messages, Invoices):
- Checkboxes appear on rows with an indeterminate "Select All Filtered" in the header.
- Selecting 1+ items springs up a bottom floating bar (`fixed bottom-6 left-1/2 -translate-x-1/2 z-50`):
  - Counter badge: `"3 candidates selected"`
  - Quick action buttons: `Add to Project`, `Compare Side-by-Side`, `Export CSV`, `Archive`.
  - Smooth exit on Esc or clear.

---

## 4. Intern Gamification & Retention Engine (High-Agency, Ethical)

### 4.1 The Findtern Readiness Meter (0–100%)
Instead of a generic "Profile Complete" bar, students get a dynamic, multi-factor **Hiring Readiness Index**:
- **Profile Architecture (30%)**: Verified Passport Photo (5%), Complete Academics (10%), Minimum 3 Rated Skills (10%), KYC/Aadhaar on file (5%).
- **AI Assessment Qualification (40%)**: Completed AI Mock Interview (25%), Score $\ge$ 7.0 (15%).
- **Market Alignment (30%)**: Project Portfolio links (15%), Preferred Locations & Relocation set (15%).
- **Dynamic Action Items**: Clicking the meter opens an interactive checklist (`onboarding-checklist`) showing the top 3 concrete tasks to increase shortlisting odds (e.g., *"Add project GitHub link (+10% Readiness)"*).

### 4.2 Milestone Progression (Tier 1 to 5)
Clear, dignified developmental tiers replacing childish gamification badges:
1. **Tier 1: Scout**: Profile registered and verified.
2. **Tier 2: Screened**: Academics and skills cataloged.
3. **Tier 3: AI Interview Qualified**: Findtern Score achieved (e.g., 8.3/10).
4. **Tier 4: Market Ready**: Complete portfolio, live on employer marketplace.
5. **Tier 5: Placed Intern**: Signed proposal, active timesheets.

### 4.3 Practice Warmup Streaks
- **Daily 3-Minute Skill Warmups**: 3 quick technical or situational MCQs relevant to their declared skills.
- **Ethical Safeguard**: No punitive streak-loss shaming, no fake countdown timers, no micro-transactions. Streak pause available ("Freeze streak during exam weeks").

### 4.4 The AI Interview Feedback Dossier (Candidate Perspective)
- Total transparency: Candidates see the **exact same 4-axis performance breakdown** recruiters see (Communication, Coding/Technical, Aptitude, Domain).
- Concrete actionable insights: AI-generated strengths, areas for improvement, and practice recommendations.

---

## 5. Screen-by-Screen Redesign & Parity Matrix

### 5.1 Employer Surfaces (17 Pages)
| Screen | Live findtern.in Baseline | Redesign & Interactive Upgrade | Watermelon / Primitive |
| :--- | :--- | :--- | :--- |
| **Dashboard** (`01`) | Filter bar with removable skills, Candidate cards with scores, View/Compare/Cart | Hero stat banner, combobox skill filters with instant tags, candidate cards with micro-elevation, quick drawer preview | `CandidateCard`, `discrete-tabs`, `sheet`, `StatusBadge` |
| **Projects Manager** (`19`, `20`) | Projects list, status filters, multi-select, Include/Exclude in search | **Full Project CRUD**: Create/Edit project slide-out Sheet, active/closed tabs, toggle candidate search inclusion | `data-table`, `sheet-3`, `switch`, `button` |
| **Candidate Compare** (`17`, `17b`) | 3-column side-by-side comparison with match % and drag reorder | Multi-column comparison matrix, sticky headers, highlight skill gaps in amber, direct "Send Proposal" per column | `compare-matrix`, `shimmer-button` |
| **Cart & Checkout** (`05`, `18`, `83`) | Candidates in cart, project selector, hourly price, book meeting / proposal | Dynamic pricing breakdown, multi-item checkout, Razorpay order trigger, candidate removal with undo toast | `cart-drawer`, `sonner`, `Surface` |
| **Orders & Invoices** (`10`, `11`, `12`) | 3 tabs: Hired, Order history, Upcoming payments schedule with "Pay" button | Unified 3-tab ledger, instant invoice PDF download, monthly installment payment modal, automated receipting | `discrete-tabs`, `data-table`, `dialog` |
| **Schedule** (`04`) | Interview appointments, slot expiration badges, meeting links | Visual timeline, slot expiration handling, Google Meet / Zoom quick launch, reschedule action modal | `calendar-widget`, `event-reminders`, `sheet` |
| **Intern Dossier & AI Report** (`15`, `16`, `16b`) | 17-page AI report, score radar, academic breakdown | Full interactive candidate dossier, 4-axis score breakdown, interview recording/transcript viewer, PDF download | `expandable-profile-card`, `ScoreRadar`, `sheet` |
| **Company Profile & Account** (`08`, `09`) | Edit company info, primary contact, security, Help & Support | Editable company profile form, logo uploader, contact manager, Help & Support ticket drawer | `file-upload`, `sheet`, `input-otp` |

### 5.2 Intern Surfaces (14 Pages)
| Screen | Live findtern.in Baseline | Redesign & Interactive Upgrade | Watermelon / Primitive |
| :--- | :--- | :--- | :--- |
| **Dashboard** (`65`) | Profile Live banner, completion ring, interviews, offers | **Gamified Mission Control**: Findtern Readiness Ring, next action cards, active interviews, offer status cards | `onboarding-checklist`, `ReadinessMeter`, `Surface` |
| **Onboarding / Edit Profile** (`67`–`74`) | 8 steps: Passport photo, Academics, Experience, Skills, Languages, Extracurricular, Locations, Preview | **8-Step Guided Wizard**: Passport photo crop, skill proficiency sliders, language fluency chips, live Profile Preview | `progressive-input-stack`, `editable-chip`, `avatar` |
| **Interviews Hub** (`75`) | AI Interview links, practice attempts, scheduled employer meetings | Dual tabs: AI Assessment & Employer Interviews, countdown timers, preparation checklist, score report card | `discrete-tabs`, `EventCard`, `StatusBadge` |
| **Proposals & Offers** (`76`) | Received proposals, stipend, location, Accept / Decline | Offer comparison card, detailed proposal viewer, counter/accept actions with legal e-sign acknowledgement | `offer-card`, `dialog`, `copy-confirm` |
| **Timesheets** (`77`) | Monthly timesheet submission, daily hour logs | Interactive monthly calendar grid, quick status log (Present/Absent/Off), submit for approval with manager notice | `calendar-widget`, `data-table` |
| **Earnings & Payouts** (`78`, `79`) | Bank account details (IFSC, Account), payment history, TDS | Bank details card with IFSC validation, monthly payout slips with download, payment tracker timeline | `bank-card`, `DataTable`, `Pill` |

### 5.3 Admin Operations Console (14 Pages)
| Screen | Live findtern.in Baseline | Redesign & Interactive Upgrade | Watermelon / Primitive |
| :--- | :--- | :--- | :--- |
| **Dashboard** (`21`) | Macro KPIs, funnel bars, placement tracker | Linear-style operational overview, trend sparklines, pending action queues (approvals, dues, alerts) | `StatGrid`, `TrendChart`, `CommandPalette` |
| **Intern 360** (`48`–`54`) | 6 tabs: Profile, Interviews, Proposals, Timesheet, Payments, Bank | Complete 6-tab intern dossier with editable skills, payment release button, KYC verification switch | `discrete-tabs`, `data-table`, `sheet` |
| **Company 360** (`55`–`61`) | 7 tabs: Profile, Projects, Proposals, Interviews, Payments, Upcoming, Hired | 7-tab company operations hub, account status toggle, credit manager, project portfolio inspector | `discrete-tabs`, `data-table`, `sheet` |
| **Contact Messages** (`26`) | Inbox with Query Type filter, status badges, actions | Linear Triage style inbox: Status badges (New/Review/Resolved), slide-out thread reply drawer, quick resolve | `data-table`, `sheet`, `StatusBadge` |
| **Roles & Access** (`27`) | Admin users, role privileges, access control | Team management table, "Invite Admin" modal, role capability checklist (Super Admin / Coordinator / Support) | `data-table`, `dialog`, `checkbox` |
| **Website CMS** (`40`–`46`) | Blogs, Skills, Faces, Partners, Pricing, FAQ, Terms | Full CMS Studio: tabbed editor, inline image uploader, live preview toggle, reorderable FAQs & testimonials | `discrete-tabs`, `file-upload`, `data-table` |
| **Payouts & Dues** (`37`) | Dual tabs: Employer Dues ledger vs Intern Payouts | Financial reconciliation console: Employer recurring payment status with "Pay Now" trigger, Intern bulk payout batch | `discrete-tabs`, `data-table`, `BulkSelect` |

---

## 6. Implementation Phases & Verification Milestones

### Phase 1: Foundations, Layout Shells & Universal Primitives
1. Update `src/app/globals.css` with unified design tokens, typography scale, and tinted elevation rungs.
2. Refactor `AdminShell` and `AppShell` (Employer): sticky 100dvh sidebar, unified `container-page` responsive gutters, breadcrumb topbar.
3. Install core Watermelon primitives via MCP: `sheet`, `dialog`, `discrete-tabs`, `data-table`, `sonner`.
4. Add per-segment `loading.tsx` skeletons under `(admin)`, `(intern)`, and `(employer)` so page transitions never blank the shell.

### Phase 2: Employer Area Redesign & Interactive Capabilities
1. Build **Projects Management Drawer & CRUD** (`/employer/projects`): create, edit, close, and toggle candidate search inclusion.
2. Overhaul **Candidate Search & Filter** (`/employer/candidates`): interactive multi-skill filter, modern candidate cards, quick dossier drawer.
3. Overhaul **Candidate Compare** (`/employer/compare`): sticky column matrix with drag-to-reorder.
4. Upgrade **Orders & Payments** (`/employer/orders`): 3-tab layout (Hired, History with invoice download, Upcoming payments schedule).
5. Add **Help & Support Modal** accessible from the employer header menu.

### Phase 3: Intern Area Redesign & Retention Gamification Engine
1. Implement the **Findtern Readiness Meter & Retention Engine** on `/intern/dashboard`.
2. Expand Onboarding & Profile Editing (`/intern/onboarding` & `/intern/profile`) into the complete **8-step interactive wizard** with photo cropping, skill proficiency sliders, and preview.
3. Build the **AI Interview Feedback Dossier View** (`/intern/interviews/[id]`): reciprocal 4-axis performance report.
4. Polish **Timesheets & Earnings** with the interactive calendar view and bank IFSC verification.

### Phase 4: Admin Operations Console & Triage Rebuild
1. Rebuild **Diverging Admin Pages** (`payouts`, `notifications`, `interns/[id]`) to use `DataTable`, `discrete-tabs`, and `AdminPageHeader`.
2. Implement **Contact Messages Triage** (`/admin/messages`): slide-out reply drawer and status resolver.
3. Implement **Roles & Access CRUD** (`/admin/roles`): invite admin, role permissions editor.
4. Implement **CMS Management Suite** (`/admin/cms`): blog, skills, partners, and pricing editors with image upload.
5. Add **Employer Dues Ledger** to `/admin/payouts`.

### Phase 5: Verification, Accessibility & Performance Gates
1. Run `npx tsc --noEmit` -> zero type errors.
2. Run `npm run lint` -> zero lint errors.
3. Run `npm test` -> 75/75 tests passing.
4. Run `npm run db:verify` -> green database connectivity.
5. Run full production build `next build` -> clean compilation, zero hydration errors.
