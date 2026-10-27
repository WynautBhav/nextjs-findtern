---
target: College Partners feature
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/wynautbhav/Desktop/findtern-college/src/app/college"
timestamp: 2026-10-27T09-53-14Z
slug: src-app-college
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent)

## Design Health Score (per surface)
| # | Heuristic | TPO | Employer | Student | Key issue |
|---|---|---|---|---|---|
| 1 | System status | 2 | 2 | 3 | "Online" = open tab; nudge "Sent to 35" overstates reach; drives list counted 0 (SQL bug, fixed) |
| 2 | Real world | 3 | 3 | 3 | "Calls 0/0" cryptic; "keep this tab open" unrealistic on phones |
| 3 | Control & freedom | 3 | 2 | 3 | Employer can't cancel a call request |
| 4 | Consistency | 2 | 3 | 3 | uppercase table headers/eyebrows vs DESIGN.md; mixed button recipes |
| 5 | Error prevention | 2 | 2 | 3 | free-text cutoffs silently ignored; link rotation kills unopened invites |
| 6 | Recognition | 2 | 2 | 3 | duplicate names without roll no; calls panel shows initials only |
| 7 | Flexibility | 2 | 2 | 2 | no sort/export; no online filter for employers |
| 8 | Minimalist | 3 | 3 | 3 | live drive page stacks monitoring + full config |
| 9 | Error recovery | 2 | 3 | 2 | no forgot-password on /college/login; blocked-notifications dead end |
| 10 | Help | 2 | 2 | 3 | generic FAQ only |
| Total | | 23/40 | 24/40 | 28/40 | Acceptable / Acceptable / Good |

## Design specificity
Behaviour is product-specific (presence card, per-purpose consent, call card); visuals are category-generic (4 icon stat tiles, hairline cards, 01/02/03 marketing). Coffee bands missing from drive cards. Detector CLI: 0 findings. Browser overlay + axe: color-contrast only — /college 20 (desktop)/13 (mobile) nodes (ink-400 "/35" + tab counts 2.66:1; ink-500 table header 4.28:1 and "Not started" 4.41:1), employer CoBrand 4.2:1; placeholders 2.7–3.4:1; kicker-above-heading on marketing section. False positives: pulsing-dot (global chat widget), nested-cards (scroll list).

## Priority issues
1. [P1] Drive-day metric is "tabs open", nudge reach overstated, "Employers are viewing profiles now" can be untrue (invented urgency). Fix: reachable = online OR push-enabled; honest nudge result; copy from real employer count.
2. [P1] Employer decides blind: no report link, no online indicator, can't cancel a request, calls panel initials only. Fix: online dot + filter, cancel, identify calls by year/branch/score, coffee band.
3. [P1] Drive link unrecoverable mid-drive; rotation warning misleading. Fix: link status card (issued at, employers joined); explicit warning.
4. [P1] Drives list counts always 0 — correlated subquery bound to inner table. FIXED during critique (src/lib/college/sql.ts `q()`), same bug in admin college counts and per-employer counts.
5. [P2] Live drive page mixes monitoring and settings; duplicate names lack roll numbers.

## Persona red flags
TPO: misleading hero, no link, zeros, no export, no forgot-password, FAB covers last column at 375. Employer: no report, initials-only calls, no cancel, filters push list below fold on mobile. Student: no reply deadline / role on call card, "keep tab open", alerts card buried under Leave.

## Minor
"1 students" plural; "Calls 0/0" label; uppercase eyebrows; arbitrary px values in officer files; offer-nudge copy guilt-trips; marketing claims "490 of 500".
