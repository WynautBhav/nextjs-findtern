# Graph Report - src  (2026-10-08)

## Corpus Check
- 287 files · ~222,851 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .ico 1, .css 1)

## Summary
- 1601 nodes · 4888 edges · 65 communities (58 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Admin Pages
- Database Schema
- Admin API Routes
- UI Primitives
- Marketing Blog Pages
- Marketing Pages
- Login Pages
- Login API Routes
- Intern Onboarding
- App Root & Layout
- Intern Opportunities
- UI Tabs Component
- Employer Onboarding
- Password & OTP API
- Intern Dashboard
- Home Sections & FAQ
- Marketing Homepage
- Payouts & Auth APIs
- Employer Timesheets
- Intern Record
- UI Popover Component
- Skills & Payment APIs
- Employer Proposals
- App Shell & Layout
- Employer Checkout
- Marketing Layout
- Intern Documents & Session
- Employer Cart & Compare
- About Page
- Notifications & Admin Shell
- Uploads API & CSRF
- Candidate Data Layer
- Watermelon UI Components
- Employer Dashboard Pages
- Employer Onboarding Form
- Session & Logout
- UI Radio Group
- Security Guards
- Razorpay Payments API
- Intern Proposals
- UI Button Component
- Admin Layout & Nav
- Intern Earnings & Interviews
- Admin Export API
- Employer Candidates
- Intern Timesheets
- Timesheet Grid Component
- Security Signing
- Upload Keys & Cookies
- UI Progress Component
- UI Select Component
- Scoring System
- Watermelon Copy Components
- Employer Signup Form
- Contact Form
- Security Tests
- Tabs Highlight
- Rate Limiter
- Tabs List Primitive
- Tabs Slot Utils
- Tabs Root
- Tabs Content
- Tabs Contents Primitive

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 225 edges
2. `requireMutation()` - 111 edges
3. `getSession()` - 72 edges
4. `PageHeader()` - 35 edges
5. `formatMoney()` - 34 edges
6. `loadInternData()` - 31 edges
7. `PageHead()` - 29 edges
8. `ButtonLink()` - 29 edges
9. `Surface()` - 28 edges
10. `EmptyState()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `getDb()`  [EXTRACTED]
  app/api/support/feedback/route.ts → lib/db/index.ts
- `GET()` --calls--> `getDb()`  [EXTRACTED]
  app/api/users/exists/phone/[phone]/route.ts → lib/db/index.ts
- `download()` --indirect_call--> `text()`  [INFERRED]
  components/app/proof.tsx → lib/employer-candidates.ts
- `submit()` --calls--> `csrfFetch()`  [EXTRACTED]
  components/app/timesheet-grid.tsx → lib/client-fetch.ts
- `EmployerSignupPage()` --calls--> `EmployerSignupForm()`  [EXTRACTED]
  app/(auth)/employer/signup/page.tsx → components/employer/employer-signup-form.tsx

## Import Cycles
- None detected.

## Communities (65 total, 7 thin omitted)

### Community 0 - "Admin Pages"
Cohesion: 0.08
Nodes (71): AdminCmsPage(), AdminCompaniesPage(), AdminDashboard(), InternManagement(), PIPELINE_LABELS, ProjectManagement(), ACTIONS, AdminInterns() (+63 more)

### Community 1 - "Database Schema"
Cohesion: 0.02
Nodes (106): Admin, AdminRole, adminRoles, admins, ContactMessage, contactMessages, EmailOtp, emailOtps (+98 more)

### Community 2 - "Admin API Routes"
Cohesion: 0.06
Nodes (62): GET(), bodySchema, GET(), PUT(), bodySchema, GET(), PUT(), bodySchema (+54 more)

### Community 3 - "UI Primitives"
Cohesion: 0.05
Nodes (11): Alert(), alertVariants, Badge(), badgeVariants, ScrollArea(), ScrollBar(), DiscreteTabsProps, TabItem (+3 more)

### Community 4 - "Marketing Blog Pages"
Cohesion: 0.08
Nodes (34): BlogPage(), gradientFor(), metadata, BlogDetailPage(), generateMetadata(), generateStaticParams(), EmployerTermsPage(), metadata (+26 more)

### Community 5 - "Marketing Pages"
Cohesion: 0.10
Nodes (37): ContactPage(), Detail(), metadata, EmployersPage(), Figure(), metadata, PLANS, PROBLEMS (+29 more)

### Community 6 - "Login Pages"
Cohesion: 0.09
Nodes (30): AdminLoginPage(), metadata, EmployerLoginPage(), metadata, EmployerSignupPage(), metadata, ForgotPasswordPage(), metadata (+22 more)

### Community 7 - "Login API Routes"
Cohesion: 0.14
Nodes (29): bodySchema, POST(), bodySchema, POST(), bodySchema, POST(), GET(), bodySchema (+21 more)

### Community 8 - "Intern Onboarding"
Cohesion: 0.08
Nodes (35): InternOnboarding(), metadata, AcademicsStep(), BankStep(), ChipInput(), DocumentsStep(), onPick(), Field() (+27 more)

### Community 9 - "App Root & Layout"
Cohesion: 0.11
Nodes (18): metadata, poppins, RootLayout(), viewport, PopularTimeline(), STEP_ICONS, SmoothScroll(), TextReveal() (+10 more)

### Community 10 - "Intern Opportunities"
Cohesion: 0.11
Nodes (34): metadata, RoleDetail(), InternData, loadInternData(), projectById(), activeEngagement(), buildThread(), CompanyNames (+26 more)

### Community 11 - "UI Tabs Component"
Cohesion: 0.05
Nodes (35): AnyProps, BaseHighlightProps, BaseTabsProps, Bounds, ControlledChildrenModeHighlightProps, ControlledParentModeHighlightProps, ControlledTabsProps, DEFAULT_BOUNDS_OFFSET (+27 more)

### Community 12 - "Employer Onboarding"
Cohesion: 0.10
Nodes (30): EmployerOnboarding(), metadata, COMPANY_KEYS, DraftPatch, parseDraft(), pick(), PROJECT_KEYS, Props (+22 more)

### Community 13 - "Password & OTP API"
Cohesion: 0.15
Nodes (22): bodySchema, POST(), bodySchema, POST(), bodySchema, POST(), POST(), ALLOWED (+14 more)

### Community 14 - "Intern Dashboard"
Cohesion: 0.14
Nodes (24): academicField(), InternHome(), metadata, Row(), toInitials(), toStringList(), InternProfile(), metadata (+16 more)

### Community 15 - "Home Sections & FAQ"
Cohesion: 0.12
Nodes (23): metadata, PartnerCard(), PartnersMarquee(), SKILL_ICONS, BLOG_POSTS, FAQ_EMPLOYER, FAQ_INTERN, FAQ_ITEMS (+15 more)

### Community 16 - "Marketing Homepage"
Cohesion: 0.16
Nodes (24): HomePage(), metadata, ClosingCta(), AudienceCard(), HeroSplit(), PauseGlyph(), Stat(), ContactCta() (+16 more)

### Community 17 - "Payouts & Auth APIs"
Cohesion: 0.07
Nodes (10): bodySchema, entrySchema, PATCH(), bodySchema, POST(), bodySchema, POST(), POST() (+2 more)

### Community 18 - "Employer Timesheets"
Cohesion: 0.16
Nodes (21): Decision(), EmployerTimesheetDetail(), metadata, Stamp(), STATUS_TONE, CLOSED, EmployerTimesheets(), metadata (+13 more)

### Community 19 - "Intern Record"
Cohesion: 0.14
Nodes (23): Figure(), InternRecord(), metadata, CountUp(), CopyFact(), formatDate(), FreshProofGrid(), FreshProofList() (+15 more)

### Community 20 - "UI Popover Component"
Cohesion: 0.09
Nodes (24): CommonControlledStateProps, Popover(), PopoverAnchorPrimitiveProps, PopoverArrowProps, PopoverClose(), PopoverClosePrimitive(), PopoverClosePrimitiveProps, PopoverCloseProps (+16 more)

### Community 21 - "Skills & Payment APIs"
Cohesion: 0.08
Nodes (15): bodySchema, PUT(), bodySchema, POST(), bodySchema, PATCH(), bodySchema, PUT() (+7 more)

### Community 22 - "Employer Proposals"
Cohesion: 0.12
Nodes (22): metadata, ProjectOption, Draft, DURATIONS, Field(), LAPTOP_OPTIONS, MODES, ProjectOption (+14 more)

### Community 23 - "App Shell & Layout"
Cohesion: 0.17
Nodes (17): EmployerLayout(), NAV, AppShell(), Avatar(), isActive(), NavItem, SECONDARY_NAV, STAGE_NAV (+9 more)

### Community 24 - "Employer Checkout"
Cohesion: 0.14
Nodes (21): DURATION_LABEL, EmployerCheckout(), Line(), metadata, OfferDetails, PayableLine, ACTIONABLE, capitalise() (+13 more)

### Community 25 - "Marketing Layout"
Cohesion: 0.18
Nodes (15): MarketingLayout(), GetStartedMenu(), SiteFooter(), Social(), SiteHeader(), DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel (+7 more)

### Community 26 - "Intern Documents & Session"
Cohesion: 0.16
Nodes (17): GET(), DocIcon(), DocumentRow, flattenRecord(), formatBytes(), formatDay(), InternDocuments(), metadata (+9 more)

### Community 27 - "Employer Cart & Compare"
Cohesion: 0.20
Nodes (19): CandidateCard(), CartLine, EmployerCart(), metadata, Cell(), CompareCandidates(), metadata, NumericRow() (+11 more)

### Community 28 - "About Page"
Cohesion: 0.15
Nodes (18): AboutPage(), Figure(), metadata, METHOD, AboutSection(), Figure(), CirclePhoto(), Avatar() (+10 more)

### Community 29 - "Notifications & Admin Shell"
Cohesion: 0.15
Nodes (18): signOut(), BulkSelectProvider(), run(), NotificationList(), markOne(), NotificationRow, OfferDecision(), decide() (+10 more)

### Community 30 - "Uploads API & CSRF"
Cohesion: 0.15
Nodes (18): ALLOWED, dynamic, POST(), runtime, checkCsrf(), generateKey(), OpaqueKey, ALLOWED (+10 more)

### Community 31 - "Candidate Data Layer"
Cohesion: 0.16
Nodes (19): download(), users, Academics, CandidateSummary, coerceArray(), Course, initialsOf(), MODE_LABEL (+11 more)

### Community 32 - "Watermelon UI Components"
Cohesion: 0.10
Nodes (9): InlineCopyToastProps, LabeledProgressIndicatorProps, ITEMS, ListItem, ListStackProps, ChecklistProps, Step, StatusPickerItem (+1 more)

### Community 33 - "Employer Dashboard Pages"
Cohesion: 0.25
Nodes (12): EmployerAccount(), EmployerAlerts(), EmployerDashboard(), ProjectRow, StatCard(), EmployerOrders(), EmployerProjects(), EmployerProposals() (+4 more)

### Community 34 - "Employer Onboarding Form"
Cohesion: 0.14
Nodes (19): ChipInput(), CompanyStage(), EmployerOnboardingForm(), goTo(), onContinue(), onSaveCompany(), onSaveProject(), setCompany() (+11 more)

### Community 35 - "Session & Logout"
Cohesion: 0.15
Nodes (11): POST(), withLogout(), clearCookie(), createSession(), isSecure(), Role, secret(), serializeCookie() (+3 more)

### Community 36 - "UI Radio Group"
Cohesion: 0.14
Nodes (16): CommonControlledStateProps, RadioGroup(), RadioGroupContextType, RadioGroupIndicatorPrimitive(), RadioGroupIndicatorProps, RadioGroupItem(), RadioGroupItemContextType, RadioGroupItemPrimitive() (+8 more)

### Community 37 - "Security Guards"
Cohesion: 0.18
Nodes (14): ADMIN_PERMISSIONS, AdminPermission, fail(), ForbiddenError, GuardResult, hasAnyPermission(), hasPermission(), requireOwned() (+6 more)

### Community 38 - "Razorpay Payments API"
Cohesion: 0.20
Nodes (9): bodySchema, POST(), bodySchema, POST(), POST(), bodySchema, POST(), getRazorpay() (+1 more)

### Community 39 - "Intern Proposals"
Cohesion: 0.23
Nodes (13): metadata, ProposalDetail(), Row(), stringOr(), InternProposals(), metadata, OfferCard(), Tone (+5 more)

### Community 40 - "UI Button Component"
Cohesion: 0.17
Nodes (9): Button(), ButtonAnchor(), buttonClass(), ButtonStyleProps, buttonVariants, DialogContent(), DialogFooter(), DialogOverlay() (+1 more)

### Community 41 - "Admin Layout & Nav"
Cohesion: 0.23
Nodes (12): AdminLayout(), NAV, AdminNav(), AdminNavFooter(), ICON_MAP, NavCloseButton(), NavGroup, NavLink (+4 more)

### Community 42 - "Intern Earnings & Interviews"
Cohesion: 0.28
Nodes (13): InternEarnings(), metadata, InternInterviews(), metadata, capitalise(), InternOpportunities(), metadata, EmptyScene() (+5 more)

### Community 43 - "Admin Export API"
Cohesion: 0.43
Nodes (12): exportCompanies(), exportInterns(), exportPayments(), exportProjects(), exportProposals(), GET(), readSession(), csvCell() (+4 more)

### Community 44 - "Employer Candidates"
Cohesion: 0.28
Nodes (12): ActiveFilters(), CandidatesPage(), COMMON_SKILLS, compareHref(), Filters, metadata, one(), readFilters() (+4 more)

### Community 45 - "Intern Timesheets"
Cohesion: 0.35
Nodes (11): InternTimesheets(), metadata, normaliseEntries(), sheetLabel(), sheetTone(), Stat(), weeklyHours(), formatMonth() (+3 more)

### Community 46 - "Timesheet Grid Component"
Cohesion: 0.24
Nodes (10): buildDays(), Day, Entry, SaveIndicator(), SaveState, TimesheetGrid(), setHours(), submit() (+2 more)

### Community 47 - "Security Signing"
Cohesion: 0.27
Nodes (10): b64url(), fromB64url(), mac(), secret(), sign(), SignedPayload, signedUrl(), TokenError (+2 more)

### Community 48 - "Upload Keys & Cookies"
Cohesion: 0.25
Nodes (8): dynamic, GET(), runtime, canAccess(), readCookie(), readSession(), replayGuard, contentTypeFor()

### Community 49 - "UI Progress Component"
Cohesion: 0.24
Nodes (9): MotionProgressIndicator, Progress(), ProgressContextType, ProgressIndicatorPrimitive(), ProgressIndicatorProps, ProgressPrimitive(), ProgressPrimitiveProps, ProgressProps (+1 more)

### Community 50 - "UI Select Component"
Cohesion: 0.22
Nodes (3): SelectContent(), SelectScrollDownButton(), SelectScrollUpButton()

### Community 51 - "Scoring System"
Cohesion: 0.27
Nodes (8): Cell(), ScoreCard(), Band, BandId, bandPosition(), BANDS, DISTRIBUTION, PER_HIRE_CUTOFF

### Community 52 - "Watermelon Copy Components"
Cohesion: 0.22
Nodes (4): AnimatedText(), CopyConfirm(), SkillCardProps, SPRING_CONFIG

### Community 53 - "Employer Signup Form"
Cohesion: 0.33
Nodes (8): EmployerSignupForm(), onSubmit(), PASSWORD_RULES, TextInput(), validate(), countryCodes, COUNTRY_CODE_OPTIONS, isPersonalEmail()

### Community 54 - "Contact Form"
Cohesion: 0.28
Nodes (7): ContactForm(), Field(), FREE_EMAIL, INITIAL, mailto(), PLACEHOLDER, Values

### Community 57 - "Tabs Highlight"
Cohesion: 0.33
Nodes (6): getNonOverridingDataAttributes(), HighlightItem(), TabsHighlightItemPrimitive(), TabsTrigger(), TabsTriggerPrimitive(), useHighlight()

### Community 59 - "Tabs List Primitive"
Cohesion: 0.50
Nodes (4): Highlight(), TabsHighlightPrimitive(), TabsList(), TabsListPrimitive()

### Community 60 - "Tabs Slot Utils"
Cohesion: 0.67
Nodes (3): mergeProps(), mergeRefs(), Slot()

## Knowledge Gaps
- **433 isolated node(s):** `metadata`, `metadata`, `metadata`, `metadata`, `metadata` (+428 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 566 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Admin API Routes` to `Admin Pages`, `Marketing Blog Pages`, `Login API Routes`, `Intern Onboarding`, `Intern Opportunities`, `Employer Onboarding`, `Password & OTP API`, `Intern Dashboard`, `Home Sections & FAQ`, `Marketing Homepage`, `Payouts & Auth APIs`, `Employer Timesheets`, `Skills & Payment APIs`, `Employer Proposals`, `Employer Checkout`, `Intern Documents & Session`, `Employer Cart & Compare`, `Employer Dashboard Pages`, `Razorpay Payments API`, `Intern Proposals`, `Admin Export API`, `Employer Candidates`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **What connects `metadata`, `metadata`, `metadata` to the rest of the system?**
  _433 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.08290065766701281 - nodes in this community are weakly interconnected._
- **Why does `getSession()` connect `Intern Documents & Session` to `Admin API Routes`, `Intern Onboarding`, `Intern Opportunities`, `Employer Onboarding`, `Intern Dashboard`, `Payouts & Auth APIs`, `Employer Timesheets`, `Intern Record`, `Employer Proposals`, `App Shell & Layout`, `Employer Checkout`, `Employer Cart & Compare`, `Employer Dashboard Pages`, `Intern Proposals`, `Admin Layout & Nav`, `Intern Earnings & Interviews`, `Employer Candidates`, `Intern Timesheets`, `Upload Keys & Cookies`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.018518518518518517 - nodes in this community are weakly interconnected._
- **Should `Admin API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.05806858826004629 - nodes in this community are weakly interconnected._
- **Should `UI Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.04824561403508772 - nodes in this community are weakly interconnected._