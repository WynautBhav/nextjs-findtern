# Intern Management Directory Redesign Specification

## 1. User Goal
Evaluate student candidates, verify educational records, and control public marketplace visibility. Primary action is approving candidates and toggling directory status.

## 2. Information Hierarchy
First: Search bar and quick facet filters. Second: High density candidate data table with status pills. Third: Slide over candidate inspection drawer with complete credentials and resume links.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search Trigger [Cmd+K]                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Candidate Directory (440 Total Enrolled)               |
|             | Primary Actions: [Export Directory] [Add Candidate]                 |
|             |                                                                     |
|             | TOOLBAR: Search by name, email, phone | Facet Filters | Page Size    |
|             |                                                                     |
|             | DATA TABLE:                                                         |
|             | [Select All] Candidate Name | Contact Info | Status | Talks | Actions|
|             | [Checkbox]   Aarav Sharma   | Email/Phone  | Live   | 2     | [...]  |
|             |                                                                     |
|             | FLOATING BULK BAR (When Rows Selected):                             |
|             | [Selected Count] [Set Visible] [Set Hidden] [Export Selected]       |
|             |                                                                     |
|             | SLIDE OVER DRAWER (Right Edge on Click):                            |
|             | Full candidate dossier, verification documents, and proposal log   |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon status-picker for instant visibility toggles; shadcn table via Watermelon MCP with sticky header; shadcn sheet for slide over candidate inspector; shadcn dropdown-menu for row actions; Watermelon copy-confirm for phone and email copying.

## 5. States
Empty state: Explains zero candidates found with button to clear filters. Loading: Table skeleton rows with pulsating shimmer. Error: Retry banner with error details. Filtered empty: Specific prompt showing active filters with one click reset. Long content: Server pagination with 10, 25, 50, or 100 items per page.

## 6. Interaction
Spacebar toggles row selection. Arrow keys navigate table rows. Enter opens slide over inspection drawer. Escape dismisses drawer. Bulk actions offer instant undo via inline toast.

## 7. Motion
Floating bulk bar springs up from bottom with 180ms ease out curve. Slide over drawer glides in from right at 220ms. Status picker animates checkmark transitions.

## 8. Responsive Behavior
At 1440px and 1024px: Full data table with all 7 columns. At 768px: Compact table hiding secondary phone numbers. At 390px: Transformed into responsive stacked cards showing candidate avatar, name, status pill, and action menu.

## 9. Copy Guidelines
Strict copy compliance without hyphens or em dashes. Labels include Candidate Directory, Public Status, Set Visible, Set Hidden, Copy Email, View Dossier.
