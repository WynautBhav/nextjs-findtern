# Marketing Website CMS Redesign Specification

## 1. User Goal
Control public website content including testimonial stories, partner logos, FAQs, and hero banners. Primary action is updating marketing copy and publishing adjustments.

## 2. Information Hierarchy
First: CMS section tabs (Testimonials, Partners, Frequently Asked Questions, Pricing Plans). Second: Content cards grid showing live marketing items with reorder handles. Third: Edit item modal.

## 3. Plain Text Wireframe
```text
+-----------------------------------------------------------------------------------+
| SIDEBAR     | TOP BAR: Breadcrumbs | Global Search                                |
|             |---------------------------------------------------------------------|
|             | PAGE HEADER: Marketing Website Content Management                   |
|             | Primary Action: [Add Content Item]                                  |
|             |                                                                     |
|             | SECTION TABS: [Testimonials] [Partners] [Questions] [Plans]         |
|             |                                                                     |
|             | CONTENT CARDS GRID:                                                 |
|             | [Card 1: Student Story]             | [Card 2: Student Story]         |
|             | Name: Rohan Verma, IIT Delhi        | Name: Sneha Patel, BITS Pilani  |
|             | Quote: Placed at Fintech Startup    | Quote: Excellent mentors      |
|             | Status: [Published Toggle] [...]    | Status: [Published Toggle] [...]|
+-----------------------------------------------------------------------------------+
```

## 4. Component Map
Watermelon discrete-tabs for section navigation; shadcn card via Watermelon MCP for item previews; shadcn dialog for editing content; shadcn switch for live publication toggle; Watermelon shimmer-button for adding items.

## 5. States
Empty: No content in selected section with creation CTA. Loading: Card skeletons. Error: Save failure alert.

## 6. Interaction
Switching tabs displays relevant items instantly. Switch toggle publishes or unpublishes content immediately with auto save.

## 7. Motion
Cards rearrange smoothly with 180ms ease. Modals open with spring scale.

## 8. Responsive Behavior
1440px: 3 column cards grid. 1024px: 2 column grid. 768px and 390px: Single column cards with full width action buttons.

## 9. Copy Guidelines
No hyphens and no em dashes. Includes Website Content, Student Stories, Partner Organizations, Frequently Asked Questions, Published Status, Edit Item.
