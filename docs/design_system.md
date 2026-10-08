# Findtern Admin Design System Specification

## 1. Visual Thesis and Philosophy
The Findtern admin panel is an operational mission control platform for talent placement coordinators and university partnership leads. It is designed to feel:
- Calm and authoritative rather than flashy or consumer oriented
- Fast and keyboard responsive with zero layout shift
- Dense without feeling cluttered
- Strictly adhering to WCAG AA color contrast and touch targets
- Distinctive through brand forest green, warm amber accents, crisp tabular typography, and subtle layered elevation

---

## 2. Typography System
### Typefaces
- **Primary Display and Body**: Poppins (geometric sans with friendly humanist clarity)
- **Data, Metrics and Codes**: Monospace with Tabular Numerals (`font-mono tabular-nums` or `font-sans tabular-nums`)

### Type Scale
| Step | Size | Line Height | Tracking | Weight | Semantic Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-sm` | 24px (1.5rem) | 32px | -0.02em | SemiBold 600 | Page headers and primary focal totals |
| `title-md` | 18px (1.125rem) | 26px | -0.01em | SemiBold 600 | Section headers and panel titles |
| `title-sm` | 14px (0.875rem) | 20px | 0em | SemiBold 600 | Table column titles, card titles |
| `body-md` | 14px (0.875rem) | 22px | 0em | Regular 400 | Primary table cell values, modal body text |
| `body-sm` | 13px (0.8125rem) | 18px | 0em | Regular 400 | Secondary descriptions, timestamps |
| `caption` | 11px (0.6875rem) | 16px | +0.02em | Medium 500 | Micro labels, status tags, keyboard badges |

### Tabular Numerals Rule
All financial amounts, conversion percentages, student registration counts, and phone numbers must declare tabular numerals (`tabular-nums`) to prevent horizontal jitter during updates and ensure perfect vertical column alignment.

---

## 3. Spacing and Layout Grid
### Base Spatial Grid
- **Atomic Unit**: 4px base increment
- **Layout Rhythm**: 8px intervals
- Common scale: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px`, `64px`

### Layout Rhythm Tokens
- Container Page: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Section Vertical Gap: `space-y-6`
- Card Internal Padding: `p-5` or `p-6`
- Table Cell Horizontal Padding: `px-4 py-3.5`
- Toolbar Gaps: `gap-3`

---

## 4. Color Palette and Semantic Tokens
### Brand Forest Green Ramp (Primary)
- `brand-50`: `#f0f7f4` (soft tinted backgrounds)
- `brand-100`: `#dcebe5`
- `brand-200`: `#b9d7cc`
- `brand-500`: `#2e7d66`
- `brand-600`: `#166b54` (hover state)
- `brand-700`: `#0e6049` (canonical brand green, primary action buttons)
- `brand-800`: `#0a4a39`
- `brand-900`: `#072f24`
- `brand-950`: `#041d17` (sidebar surface, deep contrast header)

### Amber Accent Ramp (Highlights)
- `accent-100`: `#fdf3e0` (soft chip fill)
- `accent-400`: `#f5bb63` (accent highlights on dark backgrounds)
- `accent-500`: `#f0b24a` (canonical warm gold)
- `accent-700`: `#8f5a1f` (accessible high contrast amber text)

### Neutral Ink Ramp
- `ink-50`: `#f7faf9` (page background canvas)
- `ink-100`: `#edf2ef` (subtle divider borders)
- `ink-200`: `#dee6e2` (standard card borders)
- `ink-300`: `#c2cec8`
- `ink-500`: `#6b7c74`
- `ink-600`: `#4e5f58` (secondary metadata text)
- `ink-700`: `#33433d`
- `ink-900`: `#0f1a17` (primary headings and bold titles)

### Semantic Feedback Tokens
- **Success**: Text `#0e7a4a`, Soft Fill `#e6f5ed`, Border `#bbf7d0`
- **Warning**: Text `#94600f`, Soft Fill `#fef9c3`, Border `#fef08a`
- **Danger**: Text `#b91c1c`, Soft Fill `#fee2e2`, Border `#fecaca`
- **Info**: Text `#1d4ed8`, Soft Fill `#eff6ff`, Border `#bfdbfe`

All foreground text tokens exceed the 4.5 to 1 WCAG AA minimum contrast ratio against white and light soft fills.

---

## 5. Shape, Elevation and Depth
### Radius Scale
- `radius-sm`: `6px` (badges, micro tags, small buttons)
- `radius-md`: `8px` (standard buttons, text inputs, selects)
- `radius-lg`: `12px` (cards, panels, dropdown menus, sheets)
- `radius-xl`: `16px` (modal dialogs, major feature cards)
- `radius-full`: `9999px` (avatar circles, status pills)

### Layered Shadows
- `shadow-xs`: `0 1px 2px 0 rgba(15, 26, 23, 0.05)` (cards and table containers)
- `shadow-sm`: `0 2px 4px 0 rgba(15, 26, 23, 0.06), 0 1px 2px 0 rgba(15, 26, 23, 0.04)` (hovered cards)
- `shadow-md`: `0 4px 12px 0 rgba(15, 26, 23, 0.08), 0 2px 4px 0 rgba(15, 26, 23, 0.04)` (flyout menus and dropdowns)
- `shadow-lg`: `0 12px 28px 0 rgba(15, 26, 23, 0.12), 0 4px 8px 0 rgba(15, 26, 23, 0.06)` (sheets and modals)

---

## 6. Motion and Micro Interactions
- Duration: 150ms to 240ms for UI state changes
- Timing: `cubic-bezier(0.16, 1, 0.3, 1)` (snappy spring out curve)
- Respect `prefers-reduced-motion` with zero animation fallback
- Animated counters and status pickers reserved for state transitions and high impact KPIs

---

## 7. Application Shell Architecture
- **Sidebar**: Sticky desktop navigation (260px wide) in brand dark green (`#041d17`), clean semantic grouping, active pill highlight in translucent green, bottom admin account identity tile
- **Top Bar**: Clean breadcrumb path, live search shortcut trigger (Cmd+K / Ctrl+K), quick notification indicator
- **Main Canvas**: Tinted clean canvas (`#f7faf9`), high contrast white panels, consistent page header with title, subtitle, and primary action button
- **Mobile Drawer**: Responsive Sheet overlay on viewports under 768px, hamburger trigger with 44px touch target
