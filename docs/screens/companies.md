# Company & Employer Management Redesign Specification

## 1. User Goal
Verify employer organizations, review hiring compliance, and monitor posted internship projects. Primary action is verifying company credentials and reviewing open positions.

## 2. Information Hierarchy
First: Verification queue and search bar. Second: Structured employer table with industry, team size, and active project counts. Third: Slide over company dossier showing legal registration and contact details.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search Trigger                        |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Hiring Partners & Companies (16 Active)                |
|             | Primary Actions: [Invite Employer] [Export Directory]               |
|             |                                                                     |
|             | FILTER TABS: [All Employers] [Pending Verification] [Active Hiring] |
|             |                                                                     |
|             | DATA TABLE:                                                         |
|             | Company Name | Industry | Contact Email | Projects | Status | Action |
|             | TechCorp     | Software | hr@corp.com   | 4 Active | Verified | [...] |
|             |                                                                     |
|             | SLIDE OVER COMPANY INSPECTOR:                                       |
|             | Business details, GST registration, active projects, interview log |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
shadcn table via Watermelon MCP; Watermelon discrete-tabs for status filters; shadcn sheet for company inspection; shadcn badge for verification status; Watermelon copy-confirm for billing details.

## 5. States
Empty: Invitation CTA for onboarding new partners. Loading: Table skeleton with 5 placeholder rows. Filtered empty: Clear filters prompt. Error: Inline recovery prompt.

## 6. Interaction
Search input updates table with 200ms debounce. Click row to open slide over sheet. Quick toggle for account verification.

## 7. Motion
Filter tabs slide active pill indicator smoothly. Row hover provides subtle 100ms background tint.

## 8. Responsive Behavior
1440px: 6 columns. 1024px: 5 columns. 768px: 4 columns. 390px: Responsive company cards with logo avatar, name, active projects tag, and action drawer.

## 9. Copy Guidelines
No hyphens and no em dashes. Phrases include Hiring Partners, Verified Organization, Pending Verification, Active Projects, View Company Details.
