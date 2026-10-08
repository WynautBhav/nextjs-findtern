# Promotional Codes & Discounts Redesign Specification

## 1. User Goal
Manage discount codes for employer hiring packages and monitor redemption limits. Primary action is creating promo campaigns and toggling code availability.

## 2. Information Hierarchy
First: Active campaigns and redemption rate meters. Second: Promo codes table with usage counts and expiry dates. Third: Create promo code dialog.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Promotional Campaigns & Discount Codes                 |
|             | Primary Action: [Create Promo Code]                                 |
|             |                                                                     |
|             | ACTIVE CAMPAIGNS SUMMARY CARDS:                                     |
|             | [Active Codes: 9] [Total Redemptions: 142] [Saved Volume: ₹24000]   |
|             |                                                                     |
|             | PROMO CODES TABLE:                                                  |
|             | Code | Type | Value | Redemptions | Expiry | Active Switch | Actions |
|             | WELCOME50 | Percent | 50% | 42 of 100 | 31 Dec | [Toggle ON] | [...] |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
shadcn dialog via Watermelon MCP for code creation; shadcn switch for quick active toggle; Watermelon copy-confirm for code copying; Watermelon labeled-progress-indicator for redemption caps.

## 5. States
Empty: No active codes with prompt to launch campaign. Loading: Skeletons for table rows. Error: Validation error on duplicate code.

## 6. Interaction
Clicking code badge copies string to clipboard. Switch toggle updates status immediately without page refresh.

## 7. Motion
Switch flips with 150ms spring curve. Copy confirm displays tactile checkmark animation.

## 8. Responsive Behavior
1440px to 1024px: Full table. 768px: Compact table. 390px: Code cards with prominent copy button and progress bar.

## 9. Copy Guidelines
No hyphens and no em dashes. Terms include Promotional Campaigns, Create Promo Code, Discount Value, Redemption Cap, Active Campaign, Copy Code.
