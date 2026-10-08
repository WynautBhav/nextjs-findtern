# Financial Transactions & Ledger Redesign Specification

## 1. User Goal
Audit platform financial transactions including employer deposits and intern payout disbursements. Primary action is verifying gateway settlements and processing pending disbursements.

## 2. Information Hierarchy
First: Ledger summary cards showing total deposit volume and disbursed funds. Second: Segmented ledger tabs between Employer Deposits and Intern Disbursements. Third: Filterable transaction table with gateway IDs.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search Trigger                        |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Financial Transactions & Ledger                        |
|             | Primary Action: [Download Audit CSV]                                |
|             |                                                                     |
|             | SUMMARY CARDS:                                                      |
|             | [Total Deposits Received] [Total Intern Payouts] [Pending Approvals]|
|             |                                                                     |
|             | SEGMENTED TABS: [Employer Payments] [Intern Disbursements]          |
|             |                                                                     |
|             | LEDGER TABLE:                                                       |
|             | Reference ID | Party Name | Amount | Method | Date | Status | Actions|
|             | TXN 94820    | Priya K    | ₹15000 | UPI    | 24 Oct | Success | [...]|
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon discrete-tabs for ledger switching; shadcn table via Watermelon MCP with right aligned tabular amounts; shadcn badge for payment status; Watermelon copy-confirm for reference numbers.

## 5. States
Empty: No transactions recorded with prompt to check date filters. Loading: Shimmer skeletons on summary cards and ledger. Error: Gateway synchronization error alert with retry button.

## 6. Interaction
Tab switching instantly updates ledger view without full page reload. Date range filter refines rows. Clicking reference ID copies it to clipboard.

## 7. Motion
Tab active pill slides with spring motion. Numeric amounts render crisply with zero layout shift.

## 8. Responsive Behavior
1440px to 1024px: Full ledger table. 768px: Compact table hiding payment method. 390px: Transaction list items displaying party name, amount in bold tabular figures, status pill, and timestamp.

## 9. Copy Guidelines
Zero hyphens and zero em dashes. Text includes Financial Ledger, Employer Deposits, Intern Disbursements, Settlement Reference, Payment Completed, Payout Pending.
