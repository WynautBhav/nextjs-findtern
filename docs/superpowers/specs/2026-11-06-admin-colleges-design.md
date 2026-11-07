# Admin panel: full college management — design

Status: draft for Vaibhav's approval (2026-11-06). Nothing built yet.

## Why
Findtern is competing at marketplace level (benchmark: Upwork). The college
side (`/college/*`: drives, roster, students, seats, earnings, nudges,
presence, meetings) is largely built, but the admin panel only sees a
college's billing, seats, wallet/payouts, officer logins and seat code
(`src/app/admin/colleges/[id]/page.tsx`, 68 lines, three panels). Ops cannot
see or fix anything a college does, cannot support an officer, and has no
reports on colleges. Goal: the admin can see, fix, support, report on and
bulk-manage every college, including features we will need later.

## Goals (all approved by Vaibhav)
**See everything (per college)**
1. Drives: details, eligibility, share-link state, employers who joined, shortlist, meetings.
2. Roster and memberships (claimed/verified, how verified, joined, left). No consent view: the consent step was removed on 3 Nov (`decisions.md`), so `college_consents` holds only old rows.
3. Students: list of the college's students; each links to the existing **Admin → Interns** detail page (no second copy of the student profile).
4. Activity: `college_audit_log`, nudges sent, officer last login, student last-seen (presence).

**Fix and override**
5. Edit/cancel (revoke) a drive, remove an employer from a drive, cancel or reschedule a meeting.
6. Add/remove roster rows (single + CSV, same rules as the officer's roster upload), verify/unverify a membership by hand.
7. Suspend / reactivate a college with a required reason.
8. ~~"View as" the placement officer~~ — **dropped by Vaibhav (2026-11-06)**: the admin tabs already show everything the officer sees, and threat-model T8 (college session carries no impersonator) stays as is.

**Trust and safety**
9. Verified-college badge (admin sets it; shown to employers on drive pages and to students in the college picker).
10. Private admin notes (timestamped thread) and free-form tags per college.
11. One **Reports & disputes queue for all roles**, which is also the support-ticket inbox. Vaibhav decided: any signed-in intern, employer or officer can report any party they dealt with, or raise a general support issue. The admin assigns, replies and resolves. Replies show **inside the raiser's portal and by email**. Admin actions on the subject (e.g. suspending a college) happen on that subject's own admin page, with a link back to the report.
12. Duplicate detection (same AISHE code / near-identical name+city / shared email domain) and manual merge — **only when the college being merged away has no money** (no seat batches, wallet entries or payouts).

**Reports and exports**
13. Per-college dashboard: students joined/verified, drives run, employers joined, meetings, interviews, hires, wallet earned/paid.
14. All-colleges leaderboard/comparison table (sortable by the same figures).
15. Excel/CSV export: colleges list, a college's roster, drives, payouts.
16. Health alerts list on the admin dashboard: inactive colleges, drives with no employers, unpaid seat batches, payouts stuck in `requested`, officers never logged in.
17. Onboarding checklist per college, derived from existing data: billing details → first seat batch paid → officer created → officer logged in → roster uploaded → first drive.

**Bulk and comms**
18. Bulk actions on the colleges list: suspend/reactivate, add tag, export, email.
19. Announce/email placement officers (one college, a selection, or all partners).

## Non-goals
- No auto-emails from health alerts (list only; tune first).
- No merge of colleges that carry any money records.
- No second student-profile view; Admin → Interns stays the one place.
- No change to pricing, seat price, wallet/incentive money logic, or invoice/GST rules.
- No live-database work. QA DB and Neon staging only, per standing rules.

## Anti-goals (would be a failure even if it works)
- Admin overrides that expose students who never joined: an admin-added roster row or a
  manual verify must NOT make a student visible to an officer or employer
  unless that student joined the college themselves and has not left (T5 stays true;
  consent step removed 3 Nov, so "joined and not left" is the rule).
- Any admin change without a logged actor + reason.
- Money records altered by merge, suspend or drive cancellation.

## Constraints (from the codebase)
- Permissions: `/admin/colleges` currently rides on `companies:read/write`;
  money routes need `transactions:write` (`src/lib/admin/permissions.ts:67,95,145`).
- View-as exists for intern/employer only, super admins only, audited,
  full access (`src/app/api/admin/impersonate/route.ts`, `src/lib/admin/impersonation.ts`).
- College officer mutations are allow-listed in `requireCollegeMutation` (threat-model T7).
- Audit: admin actions go to `recordAdminAudit` (admin audit log); college-scoped
  reads/actions go to `college_audit_log` (`actor_type` already allows `admin`).
- Latest migration is `drizzle/0017_revoked_sessions.sql`; new schema goes in `0018+`.
- Settled decisions in `docs/college-partners/decisions.md` and `threat-model.md` are the source of truth; flag conflicts, don't resolve them.

## Approaches considered
| | Approach | Trade-off |
|---|---|---|
| **A — picked** | One tabbed admin page per college (Overview, Drives, Students, Money, Activity, Notes) that reuses the college portal's own loaders (`src/lib/college/*`), plus admin-only actions | Least new code; admin sees exactly what the college sees |
| B | Separate admin pages per area | More pages; logic duplicated and drifts |
| C | Only view-as, no admin views | Fastest; no reports, bulk, override logs |

Vaibhav picked **A** on 2026-11-06, and accepted these calls: disputes and
support as one shared queue for all roles; merge only without money; health
alerts on the dashboard without auto-emails; student docs via Admin → Interns.

## Decided "how"
- `/admin/colleges/[id]` becomes a tabbed page; tabs: **Overview** (dashboard
  figures, onboarding checklist, verified/suspended state, tags), **Drives**,
  **Students** (roster + memberships + consents), **Money** (existing billing,
  seats, wallet panels moved here unchanged), **Activity** (college audit log,
  nudges, officer logins), **Notes**.
- `/admin/colleges` list gains filters (partner, active, verified, tag), the
  leaderboard figures as sortable columns, row checkboxes for bulk actions, export.
- Reports & disputes queue is a new admin page with its own raise-a-report entry
  point on the intern, employer and college portals.

## Builder's calls (marked as mine, not Vaibhav's)
- New `colleges:read` / `colleges:write` permissions, so college ops can be
  granted without company access; super admins get them by default; existing
  roles holding `companies:*` get them in the migration so nobody loses access.
- Suspend (Vaibhav decided the effects; the columns are my call): add new `suspended_at`, `suspended_by` and `suspend_reason` columns. Keep these separate from `is_active`, which already means "listed/live". Suspending:
  - hides the college from the student picker and from seat-code joins;
  - keeps current students joined;
  - logs officers out at once (revoke their sessions via 0017 `revoked_sessions`) and blocks their login;
  - pauses drive links (does not revoke them);
  - leaves money untouched.

  Reactivating reverses all of this, except that officers have to log in again.
- Admin roster rows behave exactly like officer roster rows (a pre-approved email that verifies the student on join). Manual verify/unverify applies only to an existing membership.
- Reuse the loaders by refactoring `src/lib/college/scope.ts` and `drives.ts` so they take a `collegeId`. The officer path passes it in from `getCollegeContext`, and the existing tests must stay green. Admin opens of recordings and reports write `college_audit_log` rows (`actor_type='admin'`), the same as officer opens do (T9).
- Officer announcements:
  - sent through the existing college `mail.ts` transport and queued, not sent synchronously;
  - a preview and recipient count are shown before sending;
  - each send is logged as an admin action;
  - on QA, mail goes to the dev sink.

  No unsubscribe link, because these are operational emails to business partners.
- Merge:
  - the admin picks which college survives;
  - roster rows, memberships, drives, officers, notes and tags move to the survivor;
  - the merged-away college is soft-deleted (`merged_into_id`, inactive), and its slug, code and AISHE code redirect or resolve to the survivor;
  - a merge cannot be undone;
  - it is blocked if the merged-away college has any seat batch, wallet entry, payout, a promo code with uses, or an invoice.
- Notes, tags, verification, suspension reason and disputes need new tables/columns (one migration).

## Left to the builder / planner
File layout, component split, exact query shapes, tab routing (search param vs
sub-routes), CSV library choice (reuse `src/lib/admin/csv.ts`), test list.

## Open questions for Vaibhav
None left. The builder check ran on 2026-11-06 and its four owner questions were answered above. The rest were settled as builder's calls.
