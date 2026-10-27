# College Partners: design brief

Status: confirmed by the founder's 27 Oct 2026 brief (recorded transcript) in place of
impeccable-shape's interview. The founder asked for the decisions to be made, not for
more questions. Evidence: `reference-board.md` (Superset, Handshake, Unstop, HirePro).

## The bet

Students won't pay ₹2,500; a college pays ₹2.5 lakh because it gets a managed placement
desk, and its leverage over its own students ("danda") turns into follow-through
Findtern can't get alone. Every screen should make that leverage cheap to apply.

## Personas and their one job

### 1. Placement officer (TPO): "Who's slipping, and can I fix it in one tap?"
- Context: desktop in the placement cell, sometimes a phone on drive day. Not technical. Answerable to the principal for placement numbers.
- Primary jobs, in order:
  1. drive day: see 490/500 online and the 10 names, nudge them;
  2. find students sitting on offers, nudge;
  3. see who hasn't joined or hasn't taken the AI interview;
  4. set up a drive and send the link.
- Must feel: in control, never surprised. Read-only must be obvious (copy says it), so they don't hunt for edit buttons.
- Stolen patterns: Superset's live "N eligible" count while editing rules; Handshake's drive-day banner and per-state nudge groups.
- Avoided: Superset's officer-edited "verified" profiles (we show, never edit); silent eligibility changes (we warn on a live drive).

### 2. Drive employer: "Find the 5 worth calling in the next hour."
- Context: laptop, came from a college's email, may be new to Findtern.
- Path: link → sign in → enter → filter by score/skills → shortlist → call now/5/10.
- Must feel: the college is vouching (co-branding), the pool is pre-vetted (score on every card), calls are instant.
- Masked identity is kept (PRODUCT.md). CGPA appears only on full-time drives.
- Avoided: Handshake's fixed slot schedules; HirePro's heavy setup.

### 3. Student: "Don't miss the call."
- Context: mid-range Android on 4G, the Findtern tab often in the background.
- Path: pick college (pre-filled from their profile) → two unticked consents + 18+ → done. On drive day: banner plus a call card with Accept as the focused, thumb-reachable action.
- Must feel: safe (plain-language consent, leave any time) and wanted.
- Push: only after Add to Home Screen on iPhone, said plainly.

## Principles
1. **Status first, tables second.** The live presence strip and the "offers waiting" tile come before the student table.
2. **Every number has its denominator.** "61/73 joined", "54/58 online", "35 of 61 students".
3. **Every chase is one tap.** Nudge appears exactly where the problem is shown, and is idempotent (10-min cooldown, honest "already nudged").
4. **No invented urgency.** Drive windows are real dates in IST; no countdown theatre.
5. **Raw enums never reach the screen.** All statuses go through `labels.ts` / `humanizeStatus`.
6. **One system.** `AppShell`, `Panel`, `StatCard`, `Surface`, brand-700 as the single accent, `nums` for figures.

## Out of scope for this pass
In-app video (we hand off to Meet), WhatsApp/SMS nudges, a college billing UI, onboarding-step integration of the college picker.
