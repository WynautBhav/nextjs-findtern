# Work Projects & Proposal Tracker Redesign Specification

## 1. User Goal
Track employer project briefs and monitor matching internship proposals. Primary action is reviewing candidate proposal status and unblocking interview scheduling.

## 2. Information Hierarchy
First: Project search and status filter. Second: Projects table with employer name, project scope, and proposal counts. Third: Slide over proposal pipeline tracker.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Active Projects & Proposal Pipeline                    |
|             | Primary Action: [Export Projects]                                   |
|             |                                                                     |
|             | SUMMARY STATS: [15 Total Projects] [2 Active Proposals] [Hired: 12]  |
|             |                                                                     |
|             | DATA TABLE:                                                         |
|             | Project Title | Employer | Duration | Compensation | Status | Proposals|
|             | Frontend Dev  | Acme Corp| 3 Months | ₹25000/mo    | Active | 2 Review |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
shadcn table via Watermelon MCP; shadcn badge for proposal status; shadcn sheet for project pipeline inspector; Watermelon count-up for statistics.

## 5. States
Empty: No active projects found. Loading: Table row skeletons. Error: Data retrieval error with reload button.

## 6. Interaction
Clicking row opens proposal inspection drawer. Filter by status (Draft, Active, Completed).

## 7. Motion
Row highlight on hover. Slide over glides smoothly from right edge.

## 8. Responsive Behavior
1440px: Full table. 1024px: Compact table. 768px: 4 columns. 390px: Stacked project cards with compensation tag and status badge.

## 9. Copy Guidelines
No hyphens and no em dashes. Terms include Active Projects, Proposal Pipeline, Candidate Review, Monthly Compensation, Project Status, View Proposals.
