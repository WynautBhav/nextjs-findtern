# Executive Dashboard Redesign Specification

## 1. User Goal
Monitor platform performance and identify operational bottlenecks in candidate placement and employer onboarding. Primary action is navigating directly to pending items requiring administrative review.

## 2. Information Hierarchy
First: Urgent operational queues and alerts. Second: Core key performance indicators with animated metrics. Third: Placement pipeline distribution and interview trend charts.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search Trigger [Cmd+K] | Profile Tile |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Operational Command Center                             |
|             | Primary Action: Export Summary Report                               |
|             |                                                                     |
|             | ATTENTION BAR: Pending Verifications and Stalled Applications       |
|             |                                                                     |
|             | METRICS GRID:                                                       |
|             | [Active Candidates] [Verified Employers] [Scheduled Talks] [Volume] |
|             |                                                                     |
|             | MAIN SECTION (Two Columns):                                         |
|             | [Placement Pipeline Distribution]  | [Seven Day Interview Velocity] |
|             |                                                                     |
|             | RECENT ACTIVITY QUEUE:                                              |
|             | [Latest Student Registrations and Urgent Employer Inquiries]        |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon count-up for animated KPI metrics; shadcn card primitives via Watermelon MCP for panels; custom SVG sparkline charts with tabular numbers; shadcn badge for status indicators; Watermelon shimmer-button for primary export action.

## 5. States
Empty state: Fresh deployment guidance with seed verification button. Loading state: Skeletons for metric cards and chart panels to prevent layout shift. Error state: Graceful fallback per card with retry trigger. Long content: Scrollable activity list with capped height. Filtered empty: Not applicable. Partial data: Visual indicator when metrics are recalculating.

## 6. Interaction
Keyboard navigation via Tab and Shift Tab. Pressing Cmd+K opens global command palette. Pressing 1 to 4 focuses respective metric cards. Clicking any metric card filters the respective detailed directory.

## 7. Motion
Metric numbers count up smoothly from zero on entry using 200ms ease out curve. Attention badge pulses gently. Chart sparkline paths draw in smoothly.

## 8. Responsive Behavior
At 1440px: 4 metric columns, 2 chart columns. At 1024px: 2 metric columns, stacked charts. At 768px: 2 metric columns, vertical stack. At 390px: Single column cards with compact stat pills and simplified bar graph.

## 9. Copy Guidelines
Clean and direct phrasing without hyphens or em dashes. Verbs include Export Summary, Review Queue, Verify Candidate, View Details.
