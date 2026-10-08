# Roles & Access Control Redesign Specification

## 1. User Goal
Manage internal staff permissions and protect sensitive student and financial data. Primary action is inviting staff members and configuring role access privileges.

## 2. Information Hierarchy
First: Admin team member list with active status and roles. Second: Role definitions and permission matrix. Third: Invite team member and role configuration dialogs.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Roles & Team Access Governance                         |
|             | Primary Action: [Invite Staff Member] [Create Custom Role]          |
|             |                                                                     |
|             | SECTION ONE: Staff Members (6 Active Accounts)                      |
|             | Name | Email | Assigned Role | Last Active | Status | Actions        |
|             |                                                                     |
|             | SECTION TWO: Permission Matrix                                      |
|             | Resource         | Super Admin | Operations | Talent Lead | Finance   |
|             | Candidate Data   | [x] Full    | [x] Edit   | [x] View    | [ ] None  |
|             | Financial Payouts| [x] Full    | [ ] None   | [ ] None    | [x] Full  |
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
shadcn dialog via Watermelon MCP for staff invitations; shadcn checkbox for permission matrix; shadcn table for team members; shadcn badge for role pills; Watermelon inline-toast for update confirmation.

## 5. States
Empty: Single super admin account. Loading: Matrix skeleton. Error: Permission denied notification.

## 6. Interaction
Toggling permission checkbox triggers auto save with optimistic state update and undo toast.

## 7. Motion
Checkboxes morph state smoothly. Dialog opens with snappy spring scale animation.

## 8. Responsive Behavior
1440px and 1024px: Full matrix grid. 768px: Scrollable horizontal matrix. 390px: Staff member cards with expandable role details.

## 9. Copy Guidelines
Clean language without hyphens or em dashes. Phrasing includes Access Governance, Staff Members, Invite Colleague, Permissions Matrix, Super Administrator.
