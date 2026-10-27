# Finish tracker: flawless look + full functionality

Started 27 Oct 2026. Launch is delayed until this is done. The owner reviews
at the end, with no checkpoints in between.

Branch: `launch-blockers` (continues from the launch triage). Separate
branch, not to be touched: `feat/college-partners` (worktree
`~/Desktop/findtern-college`). The restyle will need merging into it later.

## Scope (owner, 27 Oct)
1. **Look:** the signed-in app matches the marketing site (same type scale,
   brand green + amber, same logo/header feel), following `DESIGN.md`
   (plan of 8 Oct, with the owner's decisions recorded there).
2. **Functionality:** everything legacy (`/home/wynautbhav/FindTern`) has,
   i.e. every OPEN item in `LEGACY_PARITY_REPORT.txt`, plus every row of
   bug sheet 7 (`~/Downloads/Findtern New - Bugs(7).xlsx`: Sheet1, Sheet2,
   NEW CHANGES).
3. **Product decisions:** what the bug sheet says. Where it is silent,
   legacy behaviour (parity first).

## Decisions taken from bug sheet 7
| Topic | Rule | Source |
|---|---|---|
| Profile hiding | 30-day limit stays; explain it on the Guaranteed Internship page | S1 r13 |
| Declines | 3+ declined offers → not eligible for refund; keep the rule and add it to the guarantee's "does not cover" | NC r7 |
| Timezone | Employer timezone from location (profile, booking, proposal); intern always sees IST, with DST handled | S2 r3, r7 |
| Booking slots | Next quarter hour, then +1 h and +2 h (12:34 → 12:45, 1:45, 2:45) | S2 r2 |
| Aadhaar image | **Mandatory** (overrides the older S1 r45) | NC r18 |
| Work mode | Only the picked chip is shown as selected; the implied set is still stored | NC r20 |
| Skill suggestions | Mix of tech and non-tech, not non-tech only | NC r19 |
| Dates | DD/MM/YYYY everywhere; one date picker | NC r24 |
| Bank details | Asked on the About step; bank name is a dropdown | NC r25, r27 |
| Marksheet upload | Optional | NC r26 |
| City / state / country | Dropdowns everywhere (intern + employer onboarding, project) | NC r22, r37, r38 |
| Candidate photos | Hidden from employers (initials) | NC r41 |
| Emails | Intern-facing communicate@, employer-facing admin@ (the coffee hero goes to admin@) | NC r8, r10, r11 |
| In-app FAQ / contact | Links from the app (intern + employer) | NC r29, r39 |
| "Ask me" chat launcher | Bigger, with a prompt bubble | NC r30, r40 |
| Logo | Real logo everywhere, larger | NC r2, r31, r32 |
| Sidebar | Collapsible with an arrow | S2 r4 |
| Not covered by the sheet | Legacy rule: no "Leave" day status (INW-05); a timesheet can be sent once every day is filled (INW-24); interns can withdraw a submitted sheet (INW-18); ops roles get interns:write (ADP-17); analytics on signed-in pages (SYS-04); a saved meeting link marks the meeting scheduled (ADP-07); city filter on preferred cities (EMB-15); sessions extend while active (INT-38) | parity |
| Config, not code | Google `redirect_uri_mismatch` and "account creation nhi hora" on Vercel: register the Vercel OAuth URI; staging `MAIL_MODE=log` means no OTP mail | NC r16, r17 |

## Phases
- [ ] **F0 Foundations**: one card, one status map, `ui/button`, delete the
      local primitives, tokens, empty states (DESIGN.md §2)
- [ ] **F1 One shell**: intern / employer / admin on one shell; real logo;
      collapsible sidebar; one breakpoint (lg); marketing-matched header
- [ ] **F2 Loading / empty / error**: `loading.tsx` per segment, no bare
      `catch {}`
- [ ] **F3 Tables**: one DataTable
- [ ] **B7 Bug sheet 7**: every row (checklist below)
- [ ] **P-INT / P-INW / P-EMB / P-EMH / P-ADP / P-ADM / P-SYS / P-DB**: parity
      items per area
- [ ] **F4–F6** Admin / employer / intern screens, redesigned on the system
- [ ] **F7** Motion + dark mode
- [ ] **F8** Polish: screenshots on desktop + mobile, a11y, reduced motion
- [ ] **V** Full browser run of every role, all checks, new go/no-go

## Log
- 27 Oct: tracker created. Bug sheet 7 parsed (S1 135 rows, S2 6, NC 40,
  13 screenshots mapped).
