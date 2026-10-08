# Contact Inquiries & Support Inbox Redesign Specification

## 1. User Goal
Triage inbound communications from prospective interns, universities, and employers. Primary action is reviewing inquiries and marking tickets resolved.

## 2. Information Hierarchy
First: Inbox filter tabs (All, Unread, In Progress, Resolved). Second: Inquiries list with sender name, subject category, and timestamp. Third: Slide over reading pane with full message body and reply form.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Inbound Inquiries & Support Messages                   |
|             |                                                                     |
|             | INBOX TABS: [All Messages] [Pending Review] [Resolved Archive]      |
|             |                                                                     |
|             | INBOX LIST & DETAIL VIEW:                                           |
|             | Left Column: Message Previews       | Right Column: Selected Message|
|             | Sender | Subject | Date             | Sender: Ananya Roy            |
|             | [Unread] Partnership Opportunity    | Email: ananya@univ.edu        |
|             | [Read]   Internship Inquiry         | Subject: Partnership Request  |
|             |                                     | Body: Full text content       |
|             |                                     | Action: [Mark Resolved] [Send]|
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon discrete-tabs for status filters; shadcn sheet or split pane for reading view; shadcn badge for inquiry categories; shadcn textarea for reply drafting; Watermelon inline-toast for resolution confirmation.

## 5. States
Empty: Inbox zero with cheerful confirmation. Loading: Message list skeleton. Error: Message fetch retry alert.

## 6. Interaction
J and K keys jump to next or previous message. Enter opens message. E key marks message resolved.

## 7. Motion
Message selection transition takes 120ms with subtle background highlight.

## 8. Responsive Behavior
1440px: Two column split pane. 1024px and 768px: Full list with slide over reader. 390px: Single column list with tap to open reader sheet.

## 9. Copy Guidelines
Strict copy guidelines without hyphens or em dashes. Uses Inbound Inquiries, Pending Review, Resolved Archive, Mark Resolved, Send Reply, General Question.
