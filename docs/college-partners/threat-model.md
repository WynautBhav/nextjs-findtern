# College Partners: threat model

Written before the UI, 27 Oct 2026. Every row maps to a test or a code guard.
Assets: student identity and contact data, AI interview scores/reports/recordings,
the drive link, offers. Actors: student, placement officer (college admin),
drive employer, any Findtern employer, anonymous visitor, Findtern staff.

| # | Threat | Guard | Proof |
|---|---|---|---|
| T1 | Drive link forwarded to someone who shouldn't have it | Link only admits a **signed-in employer** account; every later call needs their `college_drive_employers` row; officer can close the link (all employers out at once) or reissue it | `college-access.test.ts` "signed-out visitor…", "only employers may enter…"; e2e "locked out the moment the link is closed" |
| T2 | Link guessing / enumeration | 256-bit random token; only SHA-256 stored; constant-time compare; join endpoint rate-limited | "tokens: 256-bit, only the hash is stored" |
| T3 | Link from college X used to see college Y (cross-college) | Eligibility starts with `student.collegeId === drive.collegeId`; nothing (not even manual include) overrides it; shortlist/call re-check eligibility server-side | "cross-college: … never eligible, even if included"; employer fork e2e: JKLU student via Poornima drive → 404 |
| T4 | Expired / not-yet-open / revoked link still works | `driveWindow` checked on the link **and** on every drive API call | "expired, not-yet-open and revoked links are refused", "drive API needs a joined employer, a live window and no revocation" |
| T5 | Student falsely claims a college to get into its drives | Picking a college = `claimed`. Only `verified` (roster email match, or a **verified** inbox on the college domain incl. subdomains) or hand-included students appear in drives. Lookalike domains rejected | "unverified (claimed) student is hidden…", "lookalike domains do not verify" |
| T6 | Officer sees students who never agreed, or who withdrew | Officer reads require the `college_dashboard` purpose on a non-withdrawn consent and no `left_at`; drives require `drive_visibility` | "college admin sees only their own college's consenting students", "consent withdrawn … hidden even if included"; manual check: withdrawn student's page 404s |
| T7 | Officer edits student data (offers, scores, profile) | Separate `college` session role; `requireCollegeMutation` allowlist = drives, roster, nudges only; every other mutating route uses `requireMutation` roles without `college` | "college admin may only run drives, roster and nudges"; curl: college session → intern join API 403 |
| T8 | College session falls into an intern/employer code path (role confusion) | Audited every `role === "employer" ? … : intern` branch; patched `/api/files/legacy` (college → Forbidden); college session can't carry permissions or "View as" | "a college session cannot carry an impersonator or permissions"; grep audit in commit |
| T9 | Recording/report URL leaks or is viewed without trace | URLs never rendered; officer clicks through `/api/college/students/:id/:artifact` which checks scope, writes `college_audit_log`, 303s with `Referrer-Policy: no-referrer` | curl: 303 + audit row; other-college student 404; signed-out 401 |
| T10 | Student sees their own recording | Founder decision: students can't. No student route exposes it | n/a (absence) |
| T11 | Employer learns student contact before hire | Drive workspace sends only card fields; names masked unless already hired; never email/phone | employer e2e: no emails in workspace HTML |
| T12 | Nudge spam / harassment | One nudge per student per kind per 10 min; only students in the officer's scope | `nudge.ts` cooldown; route filters by `studentsForCollegeAdmin` |
| T13 | Presence tracking of minors (DPDP s.9 bans tracking of children) | Joining requires an 18+ declaration; under-18s can't join, so are never heartbeated | `joinCollege` rejects `declaredAdult=false`; student e2e |
| T14 | Token in URL leaks via Referer/history | Landing sets `referrer: no-referrer`; after "Enter drive" the employer works at `/employer/drives/:id` (no token) | employer e2e asserts both |
| T16 | Crafted `/employer/login?next=` sends a signed-in employer off-site (e.g. `/\t/evil.com` → `//evil.com`) | `safeNext` refuses `//`, `\`, and control characters (pre-existing helper, hardened here because drive links made `next=` common) | `safe-next.test.ts` |
| T15 | Legacy app breaks on shared DB | Additive tables only; one legacy table written (`notifications`, same shape, new `type`s) | migration applied to a copy of live; legacy app booted against it (see README) |

**Not mitigated yet (tracked in decisions.md):** verifiable parental consent for under-18s;
data erasure job on withdrawal (rows are hidden at once but retained); breach-notice runbook;
consent-manager integration.
