# Analytics & Executive Reports Redesign Specification

## 1. User Goal
Analyze university hiring funnels, intern placement rates, and revenue cohorts. Primary action is generating and exporting analytical summaries.

## 2. Information Hierarchy
First: Time range selector and cohort filter. Second: Placement funnel breakdown and university conversion waterfall. Third: Exportable monthly revenue and placement metrics table.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Operational Reports & Metrics                          |
|             | Primary Action: [Export Full Report CSV]                            |
|             |                                                                     |
|             | CONTROLS BAR: Date Range Picker | University Domain Filter          |
|             |                                                                     |
|             | ANALYTICS PANELS:                                                   |
|             | [Hiring Funnel Waterfall]          | [Placement Velocity Trend]     |
|             | Applied > Screened > Interviewed   | Days from Signup to Offer      |
|             |                                                                     |
|             | COHORT BREAKDOWN TABLE:                                             |
|             | Month | Registered | Placed | Placement Rate | Total Volume | Export|
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon shimmer-button for CSV export; shadcn card primitives via Watermelon MCP; custom SVG funnel charts; shadcn table for cohort statistics; Watermelon discrete-tabs for time periods.

## 5. States
Empty: Zero data for selected period. Loading: Skeletons for charts and table. Error: Calculation retry prompt.

## 6. Interaction
Switching period updates analytics reactively. Click on table row highlights corresponding funnel step.

## 7. Motion
Funnel bars expand horizontally with smooth 250ms ease. Export button displays subtle shimmer feedback.

## 8. Responsive Behavior
1440px: Side by side charts. 1024px and 768px: Stacked charts. 390px: Simplified summary metrics followed by scrollable cohort table.

## 9. Copy Guidelines
Strict copy rules with no hyphens or em dashes. Uses Operational Reports, Placement Funnel, Hiring Speed, Monthly Cohort, Export Data.
