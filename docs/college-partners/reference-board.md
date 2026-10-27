# College Partners + Virtual Drive: reference board

Research date: **2026-10-27**. I used primary sources only: vendor websites, help centres, official PDFs, App Store listings and Government of India gazettes. Third-party pages appear only where marked as cross-checks. "Unverified" means I couldn't reach a primary source to confirm the point.

**Coverage caveats**
- No official YouTube walkthroughs turned up for Superset, Unstop or HirePro. HirePro's channel (youtube.com/@Hireproconsulting) only links unrelated talks.
- Handshake's official employer quick-start PDF has screenshots, and those are described below. Its help-centre video pages (e.g. "Video: Locating and Registering for Virtual Fairs", article 360051488854) say they were filmed for the first release, so they are dated.
- Unstop and HirePro product pages are marketing only. Their help centres are gated or don't exist publicly.

---

## 1. Superset (joinsuperset.com, formerly TnpSuite; Weblength Infonet Pvt Ltd)

### Sources
- https://joinsuperset.com/ (home: "1,400+ educational institutions", "600+ employers", "30M+ students", "Outreach to 24,000 campuses")
- https://joinsuperset.com/university.html (TnpSuite® for placement cells)
- https://joinsuperset.com/university-career-fair (career fair product)
- https://joinsuperset.com/privacy (last updated 15 May 2025)
- https://apps.apple.com/in/app/superset-career-jobs/id1466482443 (student app: 4.0★, 492 ratings, v1.57, 30 Sep)
- Help desk: https://app.joinsuperset.com/helpdesk (JS-rendered, so I couldn't read article content)
- Cross-check (college notices, not the vendor): IIEST Shibpur notices say "students not registered and enrolled in this portal will not be eligible", and enrolment has to be redone every placement cycle.

### Screens and flows found
- **TPO "system of record"**: a season overview showing placed students, drives completed and new offers. The page lists "student data and eligibility, job postings, applications, shortlists, interview rounds and offers" in one place.
- **Eligibility rule builder**: the example rule is "CGPA ≥ 7.0, no active backlogs", applied to a drive, with a **live count of eligible students**. Postings only reach eligible students.
- **Department verification**: departments verify marks and backlogs on student profiles, and résumés are "built from verified records". Records are "verified by the college".
- **Approval chains** for offers and bulk rollouts. Internship allotment, work logs and evaluations.
- **D-day control centre**: "sequences rounds, panels and slots". There is a live panel view (rooms, slots, in-progress or moved interviews) and student slot booking ("Priya Menon booked her interview slot").
- **Campus CRM**: employer pipeline (Prospect → In conversation → Drive scheduled), conversations, drive history, follow-ups.
- **Career fair builder** (in-person first):
  - Create from an existing event, toggle "career fair mode" and link a placement cycle that can stay hidden from students.
  - Each fair day has its own hours and a day code (e.g. `MAPLE 42`). Booths can be imported from a pasted exhibitor sheet (≤1,000).
  - Print-ready QR cards. You choose whether employers see the floor plan in advance.
  - Per-booth email invites with **resend-unopened / revoke**.
  - **Branding (logo, brand colour, accent) with live preview, applied to the student and employer apps.**
- **Employer at the fair**:
  - "No account needed". The invite greets the company and **sends a sign-in code**.
  - A rotating full-screen QR that changes every 20 s, so shared photos don't count.
  - A live list of visitors and applications, visitor profiles (ID, programme, year, batch, résumé) and a bulk résumé download.
- **Student fair app**:
  - University SSO, a home-screen banner opens the fair, and tabs are Today / Map / Scan / Booths / Me.
  - Scan a booth, then one-tap apply with the default résumé. Visits are marked "Verified at booth".
- **Live reporting**:
  - Per-booth scans, unique visitors and applications.
  - Fair totals: active booths, door check-ins, visits, applications.
  - Visits log filterable by day / booth / visitor type, with CSV export.
- **Planned, not shipped** (per the page): booth interview slots, queues with "your turn" notifications, shortlists, ratings and notes, live footfall, hybrid virtual booths.
- **Security**: SOC 2, ISO 27001, SSO, MFA, RBAC "scoped per team, role and drive".
- **Privacy policy**:
  - Placement officers can access student info, and "protection of such information will be the liability of the placement cell officer".
  - Recruiters can contact students directly.
  - "Handling consent renewals every 12 months or upon policy changes."
  - No fixed retention period. Deletion requests go to the DPO and are answered within 30 days.
  - **No mention of the DPDP Act.** Under-18s need a parent or guardian.
- **Pricing**: not public (demo or sales only).

### Steal
1. **Live eligible-count while building the rule** ("CGPA ≥ 7.0, no active backlogs → N eligible").
2. **College-verified fields** (CGPA, backlogs, branch, year) badged "verified by college", separate from self-reported data.
3. **Co-branding with live preview** (logo + brand + accent), applied to both the employer and student surfaces of a drive.
4. **Employer invite tracking**: sent / opened / signed-in, resend unopened, revoke when the contact changes. Sign-in by emailed code, not a password.
5. **Drive totals strip + filterable activity log + CSV export** for the TPO.
6. **RBAC scoped per college and per drive.**

### Avoid
1. **Verified profile locked with no self-serve correction.** From App Store reviews: "I cannot update my own details… it needs to be done through college TPO" (16 Nov 2024), and "could not edit basic details… missed a campus recruitment opportunity" (7 Sep 2024). Findtern needs a "request correction" flow with a TPO SLA.
2. **Notifications that don't arrive**: "The Notification system does not work at all" (9 Dec 2025), "No push notifications" (6 Oct 2023). Instant meetings depend on delivery, so we need fallback channels and delivery receipts.
3. **Re-enrolment every cycle** as a hard gate (per college notices). This is friction we shouldn't copy.
4. **Privacy stance that pushes liability onto the TPO and has no retention period.** That won't hold up under DPDP Section 8(7).

---

## 2. Handshake (joinhandshake.com): virtual career fairs

### Sources (all primary)
- Employer quick-start PDF with screenshots: https://go.joinhandshake.com/rs/390-ZTF-353/images/2021-01_Employer_VF_QuickStartGuide.pdf (Jan 2021)
- Career services: "The Complete Guide to Handshake's Virtual Fair", https://support.joinhandshake.com/hc/en-us/articles/360048820393 (updated 2021-09-13)
- Career services: "Virtual Fairs: Session Details", https://support.joinhandshake.com/hc/en-us/articles/360053520554 (2023-05-01)
- Employers: "Virtual Fairs in Handshake: A Guide for Employers", https://support.joinhandshake.com/hc/en-us/articles/360049971954 (2025-08-26)
- Students:
  - Attending guide: https://support.joinhandshake.com/hc/en-us/articles/360049934274
  - Signing up: …/360051394454 (2024-09-20)
  - Participating: …/360051402854 (2025-08-27)
  - Reporting an issue: …/360052165133 (2025-07-08)
- Privacy: "Profile Privacy Options in Handshake", https://support.joinhandshake.com/hc/en-us/articles/115007281988 (2026-04-08)

### Screens and flows found
- **Career-services fair builder** (Complete Guide):
  - Create the fair, set registration types (Early-bird / Regular / Late, Sponsor / Non-profit pricing) and payments (Stripe, TouchNet, CASHNet or manual).
  - "Approve employers before invoicing".
  - **Student qualifications: school year, GPA, major, college, labels.** "All students can still see the fair, but only those who are qualified can sign up."
  - **"If qualifications are changed after student registrations begin, those already registered will not be able to sign up for any additional sessions."** Handshake recommends finalising them before registration opens.
  - **Invite Only** mode with a student-invite tab. "Allow students from other schools" toggle.
  - **"Hide this career fair from employers"** while testing. An **employer preview link**, test employer and student accounts, and a step-by-step dry run.
  - **Email Student Attendees** segments: "Invited but not Registered or Checked In", "Registered and not Checked In", "Registered and no sessions".
  - Career services can register their own "support booth" session on the day.
- **Session Details** (the live monitoring screen for career services):
  - Reached via a "fair today" banner → *View Sessions*.
  - Columns: Time, Session Type, Registration Count, Student, Employer, Employer Host, and Requires Work Auth? / Majors? / GPA? / Grad Date or School Year?
  - **Red caution icon for a student or host no-show.**
  - Filters: Session type, Student, Employer, **In Progress**, **No Show Host**, Include Open/Busy.
  - Bulk CSV of sessions.
  - "Checked in" means the user clicked *Launch Session*. Virtual fairs have no separate check-in.
- **Employer** (quick-start PDF screenshots):
  - Fairs list filtered by Location Type = Virtual, then register.
  - Once approved, the Schedule Owner runs a 4-step "Create Schedule" wizard: *Add team members → Add group sessions → Add 1:1 sessions → Review*.
  - Group sessions are 30 min with up to 50 people on Handshake Video, or an external platform. Only one can run at a time, and **group sessions can't have qualifications**.
  - 1:1 sessions are 10-minute video conversations with **per-recruiter qualifications**. "Only students who meet these preferences will be able to view & sign up."
  - Up to 100 teammates per registration. Teammates get a "**Review and claim schedule**" email, and students can't book until the schedule is claimed.
  - The Schedule tab shows "0 sessions booked | 22 sessions open". The slot menu offers "Mark as busy" and "Switch to externally hosted video".
  - Day-of: launch up to **60 min early**, with a pre-join screen (mic/cam toggle, session details) and a Participants tab (allow screen share).
  - Afterwards: RSVPs tab, CSV of name, email, grad date, majors, RSVP, check-in, labels and notes, plus résumé download.
  - Employers **cannot invite students into slots**. Students self-book. Premium employers can run Campaigns.
- **Qualification logic**: "**OR within each field, AND across fields**." A university page (UCSB) warns that new or transfer students with missing GPA, major or grad date get **silently locked out** of sessions that have qualifications.
- **Student**:
  - Events → Medium = Virtual.
  - Tabs: *Available sessions / Your schedule / Career fair details*.
  - Signing up for a session auto-registers you for the fair. You can book **even during the fair**, up to the session end.
  - Session lengths are 10–60 min. You can join **5 min early**, and sessions auto-end **20 min after** the scheduled end.
  - Follow-up pop-up after the session ends.
  - Video, report and safety tools work "on the web or through the Handshake app".
- **Safety**:
  - Hosts and attendees must have accounts and be on the attendee list.
  - Report User (the host is notified and can remove; a removed user can't rejoin). Names can't be edited.
  - Technical-issue report from inside the call. DTLS/SRTP encryption.
- **Privacy**:
  - Three profile settings: Community, Employers, Private.
  - **Accounts created by the institution default to Private.**
  - Career services can view even private profiles **but cannot change the setting**.
  - Virtual 1:1s need the Employers or Community setting, and the student is prompted at sign-up.
  - "**GPA is never visible to other students… and only visible to employers if you expressly opt in.**"
- **Pricing to schools**: not public. A third-party estimate puts it at about $8k/yr (Sacra, unverified), while UT Dallas lists it as "no cost". Employer premium is annual and negotiated.

### Steal
1. **Eligibility logic stated in the UI**: OR within a field, AND across fields, shown as plain-language chips. Add per-field "requires X?" flags on the TPO monitor.
2. **Freeze eligibility once the drive opens.** Editing creates a new version, and nobody already included is dropped silently.
3. **Draft / hidden drive + "preview as employer" link** before publishing.
4. **TPO live monitor**: an "In progress" filter, no-show markers for both sides, and a "drive today" banner that opens straight into the live view.
5. **Nudge segments** built from funnel state: invited-not-joined, joined-no-AI-interview, eligible-not-online, request-pending, offer-unanswered.
6. **Join windows**: employer can enter early, student 5 min early, a grace overrun, and booking allowed mid-drive.
7. **Institution-created accounts start private.** The student opts in to employer visibility at consent. CGPA can drive eligibility filters without showing the exact value unless the student opts in.
8. **In-call Report User + report technical issue.** Both parties must be authenticated drive participants.
9. **Post-drive export** (attendees, notes, labels) for the employer, scoped to that drive.

### Avoid
1. **Students locked out with no explanation** because a field is missing (UCSB note). Always show "why you're not eligible" and "fix: add CGPA".
2. **Employer-side schedule-claiming ceremony** (owner creates, each recruiter claims, only then can students book). It adds latency. Findtern's instant-request model shouldn't need it.
3. **Forcing a public "Community" setting** just to join group sessions. That couples visibility to participation.
4. **Fixed 10-minute 1:1s that can't be edited** (per school guides). Offer 5/10/15/30 instead.

---

## 3. Unstop (unstop.com; FLIVE Consulting Pvt Ltd, formerly Dare2Compete)

### Sources
- https://unstop.com/employers/campus-hiring and https://unstop.com/employers/virtual-hiring (employer campus/virtual hiring; "42,000+ colleges", "32M+")
- https://unstop.com/our-partners/become-a-partner (the only college-facing page: fests and competitions hosting)
- https://unstop.com/legal/privacy-policy (rendered 2026-10-27)
- https://apps.apple.com/in/app/unstop-jobs-internships/id1601170365 (4.7★, 3.1k ratings; v4.1)
- Checked and found missing: there is no `/colleges`, `/universities`, `/tpo` or institute dashboard page. These SPA routes return a "wrong turn" page.

### Screens and flows found
- **College-facing**: "Partner with Unstop: power your college events, fests & competitions". It offers **free and unlimited event listing**, a no-code microsite, emails from your own dashboard, payment collection, proctoring, submissions and certificates ("32Mn+ verified users, 103k+ events, 25K+ organisers").
  - **No public TPO or placement dashboard.** For colleges, Unstop is a student-acquisition funnel, not a placement system.
- **Employer campus drive**:
  - Source by "campus, location, academics, demographics, and desired skills".
  - Configurable funnel stages per role (Tech vs MBA) on a central dashboard.
  - Built-in virtual interviews "with no external meeting links", automated scheduling, panelist assignment.
  - "Real-time dashboard tracking gender, colleges, ratings". "Bulk offer rollout in a single click."
  - Branded no-code microsite per drive. Bulk communications.
- **Proctoring**: "**Aadhaar verification**, voice biometrics, IP/geo-location tracking, tab-switch detection, face detection, multilayered recording". The privacy policy says the registration photo "can later be used for proctoring".
- **Privacy policy**:
  - Mentions the DPDP Act only for log purging.
  - Retains data "for a period of **5 (five) years after you have requested that your account is closed** or if it's been inactive for 5 (five) years".
  - Written mostly in GDPR / UK DPA 2018 terms.
- **Student app** (App Store): jobs and internships with filters, competitions, mentorship, practice. One review (10 Jun) says users find it "difficult to clearly understand event requirements, **eligibility criteria**, and submission processes."
- **Pricing**: free for colleges (event hosting). Employer campus hiring is sold through a demo, with no public price.

### Steal
1. **Drive microsite per employer or drive**, no-code and branded. This maps directly to the co-branded drive page.
2. **Video meetings inside the product, with no external links**, as a target state. Findtern uses Google Meet today, so the drive view should at least never need copy-pasting a link.
3. **Funnel-stage health dashboard** for the employer (registrations → shortlisted → met → proposal) for each drive.

### Avoid
1. **Aadhaar and biometric collection for hiring.** It fails DPDP data minimisation (s.6(1) "limited to such personal data as is necessary"), and Incruiter already handles interview integrity.
2. **5-year retention after account closure.** It conflicts with s.8(7) erasure on withdrawal or once the purpose is served.
3. **Unclear eligibility on listings**, as the user complaint above shows. Every drive card needs an explicit eligibility block and a "you qualify because…" line.
4. **Free-for-colleges positioning.** It trains TPOs to expect free tools. Findtern charges about ₹2.5 L, so it has to sell outcomes (coverage, AI-verified readiness, offers) rather than event hosting.

---

## 4. HirePro (hirepro.in): campus hiring and virtual drives

### Sources
- https://hirepro.in/ and https://hirepro.in/university-hiring/ ("since 2004", "43,000+ colleges, 1 crore+ graduates yearly")
- https://hirepro.in/college-hiring-workflows/ (workflow product)
- https://hirepro.in/virtual-hiring/ and https://hirepro.in/educators/ (college-facing)
- https://technicalhelp.hirepro.in/ (candidate system requirements)
- https://hirepro.in/privacy-policy/ (last updated 13 Jan 2026)
- Cross-check only: FACE Prep's write-up of the HirePro/ProGrads drive flow, which says the company sets eligibility, the **placement cell shares test links only with eligible students**, there's a 24–72 h test window, and sessions can't be paused.

### Screens and flows found
- **Workflow product**:
  - Stakeholders: "placement officers, candidates, recruiters, event managers, hiring managers, interviewers, and the HR ops".
  - Digital registration and invitation management, "**automated eligibility check, admit card generation and verification**, and assessment shortlisting".
  - Interviewers manage slots with "branch, diversity, and gender mix".
  - Automated email/SMS status communication and a post-offer help desk. LOIs, digital offers, document collection.
  - Analytics "by college type, college, degree, branch, or CGPA", plus stage-wise conversion and interviewer analytics.
  - "Complete audit trails for evaluations, recruiter actions, and system events". "**Recruiters decide; AI assists.**"
  - Targets ISO 27001, GDPR and DPDPA. Deletion and extraction on request.
- **Educators**:
  - "Customised registration form, or **bulk upload using MS Excel**".
  - A "**central command centre** for assisting departments".
  - Automated stage and status movement.
- **Candidate requirements**: "**Laptop/Desktop Only** · Windows 10/11 or macOS 10.13+ · latest Chrome/Edge · **8 GB RAM** · **2 Mbps** stable broadband · webcam & mic mandatory". There's a pre-test compatibility check.
- **Proctoring**: live or AI, "voice and face recognition".
- **Privacy policy**:
  - HirePro is a **processor for its customers** and a controller only for website visitors.
  - "We do not knowingly collect… children under 18". Data may be stored in India, Singapore, EU or US.
  - Residual logs are purged within a year. **No mention of DPDP by name.**
- **Pricing**: not public.
- **Note**: several counters on hirepro.in render as "0 K+" or "0 M+". These are broken placeholders on the live site, so don't quote them.

### Steal
1. **Excel roster bulk upload** by the TPO as the source of "invited" students. This also backs the "verified by college" fields.
2. **Analytics cut by branch / CGPA band / year.** The same cuts suit the TPO dashboard and an employer's post-drive report.
3. **Audit trail of recruiter actions** (who viewed which student, report or recording). DPDP Rule 6(1)(c) and (e) require access logs kept for 1 year anyway.
4. **"Recruiters decide; AI assists"** as positioning for the Findtern score. Never auto-reject on score.
5. **Pre-flight device check** before a live drive, but for mobile (camera, mic, notifications permission, network).
6. **Command-centre helpdesk** idea: give the TPO a live drive "issues" lane.

### Avoid
1. **Desktop-only, 8 GB RAM, 2 Mbps.** It excludes the tier-2/3 students on phones that Findtern is selling to. The instant-meeting flow must work on a mid-range Android phone over 4G.
2. **Admit-card and proctoring heaviness** for what is a conversation-first drive.
3. **Processor-only stance with no DPDP wording.** Findtern decides the purposes (scoring, matching, employer visibility), so it is a **Data Fiduciary** and can't hide behind "processor".

---

## 5. Synthesis: pattern → source → decision → where in Findtern

| # | Pattern | Product | Decision | Where |
|---|---|---|---|---|
| 1 | Live "N eligible" count while editing rules | Superset | **Adopt** | Drive builder |
| 2 | Eligibility shown as chips; OR within a field, AND across fields | Handshake | **Adopt** | Drive builder; employer drive view (read-only); student "why eligible" |
| 3 | Freeze eligibility when the drive opens; edits create a version, nobody dropped silently | Handshake (learned from their caveat) | **Adapt** | Drive builder (schema: `drive_eligibility_versions`, `drive_inclusions` snapshot) |
| 4 | Manual include/exclude list on top of rules | Handshake (Invite Only) + our spec | **Adopt** | Drive builder |
| 5 | Hidden/draft drive + "preview as employer" link | Handshake | **Adopt** | Drive builder |
| 6 | Co-brand (logo, brand + accent) with live preview, applied to employer and student surfaces | Superset | **Adopt** (restrained: logo + one accent, Findtern type) | Drive builder → employer drive page, student banner |
| 7 | Branded per-drive microsite | Unstop | **Adapt** (one page per drive, not a CMS) | Employer drive view |
| 8 | Employer invite tracking (sent/opened/signed-in, resend, revoke); sign-in by email code | Superset | **Adopt** (sign-in stays mandatory) | Drive builder → employer onboarding |
| 9 | Employer must be signed in and on the drive's allow-list to see students or join a meeting | Handshake | **Adopt** | Employer drive view (`requireMutation` + drive-scoped guard) |
| 10 | TPO live monitor: in-progress, no-show markers, "drive today" banner | Handshake | **Adopt** | TPO dashboard (live drive) |
| 11 | Drive totals strip + filterable activity log + CSV | Superset | **Adopt** | TPO dashboard |
| 12 | Funnel-state nudge segments (invited-not-joined, no AI interview, offline, offer unanswered) | Handshake (email segments) | **Adapt** → one-click nudge per segment, rate-limited | TPO dashboard |
| 13 | Presence "490/500 online" from in-app heartbeat | (none ship this; Superset's door check-in is the nearest) | **Adapt**: drive-scoped, only during the drive window, **off for under-18s** | TPO live view; student |
| 14 | Join windows (employer early, student 5 min early, grace overrun, book mid-drive) | Handshake | **Adapt** to now / 5 / 10 min instant requests with a short accept TTL | Employer drive view; student mobile |
| 15 | Per-recruiter session qualifications | Handshake | **Avoid** (drive-level eligibility is enough; per-recruiter filters lock students out) | — |
| 16 | Employer "claim your schedule" ceremony | Handshake | **Avoid** | — |
| 17 | In-call Report User and report technical issue | Handshake | **Adopt** | Student mobile; employer meeting |
| 18 | Institution-created accounts private by default; TPO can view but can't change visibility | Handshake | **Adopt** | Student consent; TPO dashboard permissions |
| 19 | CGPA used for filtering but shown to employers only on student opt-in | Handshake | **Adapt** (employer sees "meets CGPA ≥ 7" unless the student opts in to the exact value) | Employer drive view; student consent |
| 20 | College-verified fields badge | Superset | **Adopt** | TPO roster import; employer view |
| 21 | Verified data locked, no correction path | Superset (reviews) | **Avoid** → "request correction" with TPO SLA | Student; TPO queue |
| 22 | TPO bulk roster upload (Excel/CSV) | HirePro | **Adopt** | TPO dashboard (roster coverage = invited vs joined) |
| 23 | Analytics by branch / year / CGPA band; stage conversion | HirePro, Unstop | **Adopt** | TPO dashboard (cohorts 2nd/3rd/4th year) |
| 24 | Audit trail of who viewed which student, report or recording | HirePro (+ DPDP Rule 6) | **Adopt** (required) | All; surfaced to TPO for their college |
| 25 | "Recruiters decide; AI assists" | HirePro | **Adopt** as copy and as policy (no auto-reject) | Employer view; marketing |
| 26 | Mobile pre-flight check (notifications, mic/cam, network) | HirePro (desktop version) | **Adapt** for mobile | Student mobile (before the drive) |
| 27 | Desktop-only, 8 GB RAM, 2 Mbps requirement | HirePro | **Avoid** | — |
| 28 | Aadhaar, biometrics, geo-IP proctoring | Unstop, HirePro | **Avoid** | — |
| 29 | Multi-year retention after account closure; no retention period at all | Unstop (5 yrs), Superset (none) | **Avoid** | Schema / retention jobs |
| 30 | Push-only alerts that silently fail | Superset (reviews) | **Avoid** → push + WhatsApp/SMS/email fallback, delivery receipts | Student mobile; TPO nudge |
| 31 | Unclear eligibility on listings | Unstop (review) | **Avoid** → explicit "you qualify because…" | Student drive card |
| 32 | Free for colleges | Unstop | **Avoid** (position on outcomes) | GTM |

---

## 6. AISHE institution directory (summary; full details in `aishe-source.md`)

- **Source**: AISHE Higher Education Institution Directory, https://dashboard.aishe.gov.in/hedirectory/#/hedirectory, linked from https://aishe.gov.in/aishe/home. Run by MoE (Dept. of Higher Education, Statistics Division) and hosted by NIC.
- **Format**: a browser-generated **.xlsx** per list (green "Download as Excel" icon) with a 3-row preamble: title, "As on Date", header. There's also a PDF option. No public bulk API; the backend uses encrypted query parameters.
- **Counts on 2026-10-27**: 1,437 universities, 54,436 colleges, 17,045 standalone, 169 INIs shown separately, 289 R&D.
- **Columns**:
  - Universities: Aishe Code, Name, State, District, Website, Year Of Establishment, Location.
  - Colleges: those plus College Type, "Manegement" (sic), University Aishe Code, University Name, University Type.
  - Standalone: Aishe Code, Name, State, District, Year Of Establishment, Location, Standalone Type, Manegement.
- **Licence (ambiguous)**:
  - The AISHE website policy says content "may not be reproduced… without due permission from Ministry of Education", but also that material "may be downloaded without requiring specific prior permission. Any other proposed use… is subject to the approval of Department of Higher Education" (https://aishe.gov.in/website-policies/).
  - The IndiaAI **AIKOSH** mirror labels the same lists **"Open Government License, India"**.
  - Recommendation: rely on the GODL mirror, attribute AISHE/MoE, and get written permission for commercial reuse.
- **JK Lakshmipat University, Jaipur: AISHE code `U-0657`** (State Private University, Jaipur, Rajasthan, est. 2011). Verified in the live directory and its Excel export on 2026-10-27.

---

## 7. DPDP Act 2023 + DPDP Rules 2025: obligations that shape this feature

### Primary sources
- **Act**: The Digital Personal Data Protection Act, 2023 (No. 22 of 2023), Gazette of India Extraordinary, 11 Aug 2023. MeitY PDF: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
- **Rules**: Digital Personal Data Protection Rules, 2025, **G.S.R. 846(E)**, Gazette No. 760, CG-DL-E-14112025-267650, dated **13 Nov 2025**. MeitY PDF: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- **PIB backgrounder** "DPDP Rules, 2025 Notified" (17 Nov 2025): https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ("notified on 14 November 2025", "eighteen-month period for phased compliance", requests answered "within ninety days"). Press release: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014
- **Act commencement notification**: **G.S.R. 843(E), 13 Nov 2025**. Cited from TeamLease RegTech (https://www.teamleaseregtech.com/updates/article/49364/) because I couldn't reach the gazette PDF itself. **Verify against the eGazette before relying on the section split.**

### Commencement dates (today is 2026-10-27)
| Instrument | In force | What |
|---|---|---|
| Rules 1, 2, 17–21; Act s.1(2), 2, 18–26, 35, 38–43, 44(1),(3) | **13 Nov 2025** | Definitions; Data Protection Board set up |
| Rule 4; Act s.6(9), 27(1)(d) | **13 Nov 2026** (in 17 days) | Consent Manager registration |
| Rules 3, 5–16, 22, 23; Act s.3–17 (incl. notice, consent, fiduciary duties, children, rights), 27–34, 36, 37, 44(2) | **13 May 2027** (18 months) | All substantive obligations and penalties |

> **Flag**: in Jan 2026 MeitY consulted on cutting the 18 months to 12, which would mean **13 Nov 2026**, reportedly mainly for Significant Data Fiduciaries (S.S. Rana, Apr 2026; Storyboard18; Takshashila). As of today I found **no notified amendment**. Build to the full obligations now: the college pilot will collect consents before May 2027, and s.5(2) requires a fresh notice for consents taken before commencement.

### Obligations → what the schema and UX must carry

1. **Notice** (Act s.5(1); Rule 3; in force May 2027)
   - The notice must be standalone ("understandable independently") and in clear, plain language.
   - It must contain an **itemised description of the personal data**, the **specified purpose(s)** and the goods/services each enables.
   - It must link to **withdraw consent "with the ease… comparable to that with which such consent was given"**, to **exercise rights**, and to **complain to the Board**.
   - It must be available in **English or any Eighth-Schedule language** (s.5(3), s.6(3)).
   - Each consent request must carry DPO or contact details (s.6(3)).
   - → `privacy_notices(id, version, locale, body, data_items jsonb, purposes jsonb, published_at)`. Every consent row points to the exact notice version and locale shown.
2. **Consent per purpose** (s.6(1)): "free, specific, informed, unconditional and unambiguous with a clear affirmative action… limited to such personal data as is necessary". Bundled or pre-ticked consent is out, and any part that waives rights is void (s.6(2)).
   - → `consents(user_id, purpose_code, notice_version_id, granted_at, method, ip/ua, withdrawn_at, withdrawn_via)`, one row per purpose.
   - Minimum purposes: `platform_profile_and_ai_interview`, `share_with_my_college_tpo` (score, report, recording, activity, offers), `visible_to_drive_employers`, `instant_meeting_and_presence`, `interview_recording_retention`, `marketing`.
   - Employment "legitimate use" (s.7(i)) covers an employer's own employees, not candidates, so **consent is the lawful basis here**.
3. **Withdrawal** (s.6(4)–(6)): any time, as easy as granting. On withdrawal the fiduciary must "within a reasonable time, cease and cause its Data Processors to cease".
   - → One-tap toggles per purpose in student settings.
   - → A withdrawal triggers jobs: hide from TPO and employers, cancel pending meeting requests, tell processors (Incruiter for interview data, Google for Meet invites, email/SMS vendors) to stop or erase.
   - → `processor_actions` log.
4. **Erasure and retention** (s.8(7)–(8); Rule 8):
   - Erase on withdrawal **or** "as soon as it is reasonable to assume that the specified purpose is no longer being served", whichever is earlier, and make processors erase too.
   - The Third Schedule's 3-year inactivity clock applies only to large e-commerce, gaming and social-media fiduciaries, **not Findtern**. Findtern still needs a defined purpose-end, e.g. "drive closed + N days" for drive visibility, "graduation + N months" for the TPO share.
   - **Rule 8(3)**: keep the personal data, traffic data and **logs of processing for a minimum of 1 year** from processing (for Seventh-Schedule purposes), then erase.
   - Rule 8(2): a **48-hour pre-erasure notice** is mandatory only for Third-Schedule classes but is good practice.
   - → `retention_policies(purpose_code, ttl, trigger)`, `erasure_jobs`, `retain_until` on records, and a separate `processing_logs` table with a 1-year floor.
5. **Children (<18)** (s.2(f), s.9; Rule 10; Rule 12 + Fourth Schedule):
   - Get **verifiable parental consent** before processing any child's data. The parent must be confirmed as an identifiable adult, either from identity and age details already held or via a **virtual token from an authorised entity (e.g. DigiLocker)**.
   - **No "tracking or behavioural monitoring of children or targeted advertising directed at children"** (s.9(3)).
   - The Fourth Schedule exemption for an "educational institution" only covers *that institution's* tracking for educational activities or safety. **Findtern is not an educational institution, so the exemption doesn't apply to it.** Some 2nd-year students will be 17.
   - → `users.date_of_birth` and a derived `is_minor`.
   - → `parental_consents(child_user_id, parent_identity_ref, verification_method enum('existing_adult_account','digilocker_token',...), verified_at, purposes)`.
   - → Hard rules for minors: **presence and "online now" tracking off**, excluded from drive presence counts, no marketing.
   - → Product call: either exclude <18 from drives or require parental consent first.
6. **Security and logs** (s.8(5); Rule 6):
   - Encryption, masking or tokenisation; access control.
   - "**visibility on the accessing of such personal data, through appropriate logs, monitoring and review**", with logs kept 1 year.
   - Contracts with processors must carry security obligations.
   - → `data_access_log(actor_id, actor_role, subject_user_id, resource [score|report|recording|profile], drive_id, at)`. Recordings and reports only through short-lived signed URLs (don't repeat the legacy unauthenticated `/uploads` defect).
7. **Breach** (s.8(6); Rule 7): notify each affected student "without delay" (what happened, consequences, mitigation, what they can do, contact) and the **Board within 72 hours** with details.
   - → A `breach_incidents` table, and a notification template that is ready in advance.
8. **Contact, rights and grievance** (s.8(9)–(10), s.11–14; Rules 9, 14):
   - **Publish the DPO or contact person prominently** and include them in every rights response.
   - Publish how to request access, correction or erasure and how to nominate someone.
   - **Resolve grievances within ≤90 days.**
   - → `dsr_requests(user_id, type, opened_at, due_at = opened_at + 90d, status, closed_at)` and `nominees`.
9. **College relationship (flag for legal)**:
   - The college uploads a roster (names, emails, maybe CGPA). For that data **the college is a Data Fiduciary** and needs its own lawful basis to share it with Findtern.
   - For the TPO dashboard view, Findtern shares the student's data **back** to the college, so Findtern needs the student's consent (`share_with_my_college_tpo`).
   - The MoU must set out roles, purposes, retention and breach duties. Superset's "liability of the placement cell officer" clause isn't enough.
10. **Penalties** (Act Schedule, per PIB): up to ₹250 cr for failing to keep reasonable security safeguards; up to ₹200 cr each for failing to notify a breach and for breaching child obligations; up to ₹50 cr for other violations.
