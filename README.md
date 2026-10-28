<div align="center">

<img src="public/media/findtern-logo.png" alt="Findtern" height="72" />

### Pre-screened interns. Hired by the hour. Billed only for approved work.

The platform behind **[findtern.in](https://findtern.in)**: the public site, candidate app,<br/>
hiring app, placement-officer console and admin console, in one Next.js codebase.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-Drizzle-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Razorpay](https://img.shields.io/badge/Payments-Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)

<br/>

**101 screens** · **137 API routes** · **67 unit-test files** · **strict TypeScript** · **one `npm run build`**

<br/>

[What it does](#-what-it-does) ·
[Architecture](#-architecture) ·
[Run it locally](#-run-it-locally) ·
[Going live](#-going-live) ·
[How we keep it safe](#-how-we-keep-it-safe) ·
[Project map](#-project-map)

</div>

<br/>

## ✨ What it does

Findtern sits between companies that need interns and students who want real work. Every candidate is
screened (coding, aptitude, communication and an AI interview) before an employer ever sees them. That
**Findtern Score** sets the price, so employers pay for proven skill and candidates get paid for the hours they log.

<table>
<tr>
<td width="33%" valign="top">

### 🎓 Candidates
- Sign up with an email code
- Eight-step profile: academics, skills, languages, documents, photo, intro video
- Pay the activation fee, unlock the AI interview
- Receive offers, pick interview slots, get Google Meet links
- Log hours on a daily timesheet
- See every stipend payout as it lands

</td>
<td width="33%" valign="top">

### 🏢 Employers
- Search scored candidates by skill, city and score
- Shortlist, compare side by side, book interviews in any timezone
- Send offers priced from the candidate's band
- Pay upfront (10% off) or monthly, with promo codes
- GST-correct tax invoices (CGST + SGST or IGST)
- Approve or correct timesheets, make full-time offers

</td>
<td width="33%" valign="top">

### 🛠 Admins
- One dashboard of what needs attention today
- 360° views of every candidate and company
- **View as** any user (read-only)
- Pricing, promo codes, fees and payouts
- Website content: blog, FAQs, testimonials, partners, terms, NDA
- Roles and permissions, broadcasts, reports, CSV exports

</td>
</tr>
</table>

### 🎓 Placement officers

- Upload and track a college roster
- Run dated campus drives and invite employers
- Follow student interview and offer progress without editing student data
- Monitor drive calls and participation from a dedicated console

<details>
<summary><b>The full journey, end to end</b></summary>

<br/>

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant F as Findtern
    actor E as Employer
    C->>F: Sign up, build profile, pay activation fee
    F->>C: AI interview → Findtern Score (sets the price band)
    E->>F: Search, shortlist, book interview (3 slots)
    F->>C: Invite email
    C->>F: Picks a slot
    F-->>C: Meet link + calendar invite
    F-->>E: Meet link + calendar invite
    E->>F: Sends offer (priced server-side from the band)
    C->>F: Accepts (terms + NDA)
    E->>F: Pays via Razorpay (upfront or monthly)
    F-->>C: You're hired 🎉
    loop Every period
        C->>F: Timesheet
        E->>F: Approve
        F-->>C: Stipend transferred
    end
```

</details>

<br/>

## 🧭 Architecture

```mermaid
flowchart LR
    subgraph Browser
        M[Marketing site]
        I[Candidate app]
        EM[Hiring app]
        A[Admin console]
        C[College console]
    end

    subgraph Next["Next.js 16 · one Node process"]
        P[proxy.ts<br/>admin permissions]
        RSC[Server components<br/>read straight from the DB]
        API[105 route handlers<br/>requireMutation on every write]
        J[Schedulers<br/>reminders and nudges]
    end

    DB[(Postgres<br/>shared with the legacy app<br/>during cutover)]
    FS[[Private file store<br/>signed, expiring links]]

    M & I & EM & A & C --> P --> RSC & API
    RSC & API & J --> DB
    API --> FS
    API <--> RZ[Razorpay]
    API --> G[Google<br/>sign-in, Calendar, Meet]
    API & J --> SMTP[Email]
```

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** App Router, React 19 | Server components fetch data in place; one deployable for site and apps |
| Data | **Postgres + Drizzle ORM** | Typed queries, plain-SQL migrations we can read before they run |
| Auth | argon2id, HMAC-signed session cookie, CSRF double-submit | No auth vendor, no JWT footguns, works behind any proxy |
| Payments | Razorpay over `fetch` | Two calls and a signature check; no SDK |
| Google | OAuth, Calendar, Meet over `fetch` | Replaced a 239 MB SDK with about 100 lines |
| Styling | Tailwind v4 with design tokens in `globals.css` | One source of colour, type and spacing |
| Motion | GSAP + Motion, reduced-motion aware | Marketing polish without hurting the apps |

<br/>

## 🚀 Run it locally

> **Needs** Node 20+, a local Postgres, and a local `findtern` role.

```bash
git clone https://github.com/WynautBhav/nextjs-findtern.git
cd nextjs-findtern
npm ci
cp .env.example .env.local      # fill in what you need; defaults are safe
npm run db:seed                 # fresh local DB with demo data
npm run dev                     # → http://localhost:3000
```

**Demo logins** (password `Findtern@2026`):

| Role | Email | Sign in at |
|---|---|---|
| Candidate | `candidate@findtern.dev` | `/login` |
| Employer | `hiring@northwind.dev` | `/employer/login` |
| Admin | `admin@findtern.dev` | `/admin/login` |
| Placement officer* | `tpo@jklu.edu.in` | `/college/login` |

\* Run `npm run db:seed-colleges` after `npm run db:seed` to add the college demo data.

> 💡 Locally, **emails are written to `logs/mail/`** instead of being sent, scheduled jobs stay off, and
> Razorpay is off unless you add **test** keys. You can click anything without notifying a real person.

<details>
<summary><b>Test against a copy of the live database</b></summary>

<br/>

```bash
# one time: let the local role create databases
sudo -u postgres psql -c 'ALTER ROLE findtern CREATEDB'

# .env.local: LIVE_SSH=root@<server>  LIVE_DB=findtern  LIVE_UPLOADS=/path/to/uploads
npm run db:pull-live            # read-only dump of live → local findtern_live
DATABASE_URL=postgresql://findtern:findtern_dev@localhost:5432/findtern_live npm run db:migrate
npm run db:make-admin you@findtern.in 'YourPassword1'
```

</details>

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` · `npm start` | Production build and server |
| `npm test` | Unit tests for pricing, GST, offers, onboarding, college drives and security |
| `npm run lint` | ESLint |
| `npm run db:seed` | Reset the **local** DB and load demo data (refuses anything but localhost) |
| `npm run db:migrate` | Apply pending migrations; additive, recorded, safe to re-run |
| `npm run db:verify` | Row counts plus real logins through the route handlers |
| `npm run db:pull-live` | Create a local testing copy of production data (never use it as an app database) |

**Before every push:** `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run test:security` → `npm run db:verify` → `npm run build`

<br/>

## 🌍 Going live

The new app runs on the Hostinger KVM next to Postgres, behind nginx, on port **3001**. The legacy app keeps
port **5000** until we're done, so rolling back is a one-line nginx change.

```mermaid
flowchart LR
    A[1 · Back up<br/>deploy/backup.sh] --> B[2 · Restore test<br/>row counts compared]
    B --> C[3 · Rehearse<br/>migrate the restored copy]
    C --> D[4 · Release<br/>deploy/release.sh]
    D --> E[5 · Switch nginx<br/>5000 → 3001]
    E --> F[6 · Team tests<br/>on findtern.in]
    E -. one line .-> R[↩ Rollback to 5000]
```

| File | Purpose |
|---|---|
| [`deploy/backup.sh`](deploy/backup.sh) | Dumps the live DB and uploads, **restores the dump** into a scratch DB and compares every table |
| [`deploy/release.sh`](deploy/release.sh) | Pull `staging` → install → build → migrate → reload PM2 |
| [`deploy/ecosystem.config.cjs`](deploy/ecosystem.config.cjs) | PM2: one process (schedulers must run exactly once) |
| [`deploy/nginx-findtern.conf`](deploy/nginx-findtern.conf) | TLS, streaming, 60 MB uploads, rollback line |
| [`.env.example`](.env.example) | Every setting, grouped and explained |

<details>
<summary><b>Production settings checklist</b></summary>

<br/>

- `DATABASE_URL`, `PUBLIC_ORIGIN=https://findtern.in`
- `SESSION_SECRET`, `SIGNING_SECRET` (32+ random characters each)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; webhook → `/api/webhooks/razorpay`
- `SMTP_*` and `MAIL_MODE=send`
- `FINDTERN_GSTIN`, `FINDTERN_BILLING_ADDRESS`
- `UPLOAD_ROOT` (persistent), `LEGACY_UPLOAD_ROOT` (old `uploads/`)
- `SCHEDULERS=on` on **one** server only
- `PASSWORD_UPGRADE=off` until the legacy app is retired

</details>

<br/>

## 🛡 How we keep it safe

<table>
<tr><td>

**🔐 Accounts**
- Passwords hashed with argon2id; legacy passwords upgraded only when it's safe
- Signed session cookies plus CSRF tokens on every write
- Deactivated users lose access immediately, not at next login
- Admin roles enforced on every page and action; nobody can grant more than they hold

</td><td>

**💳 Money**
- Prices are computed on the server, never taken from the browser
- Razorpay signatures verified; webhooks must be signed
- Settlement is atomic: a payment hires exactly the offers it paid for, once
- GST split by place of supply (Rajasthan → CGST + SGST, elsewhere IGST, exports 0)

</td></tr>
<tr><td>

**📁 Files**
- Identity documents never sit in a public folder
- Links are signed, short-lived and checked against the viewer
- Per-type size and format limits; path traversal blocked

</td><td>

**🗃 Data**
- During cutover both apps share the live DB, so we read and write the **legacy shapes**
- Migrations only add; they're recorded and tested against the legacy schema
- Every backup is restore-tested before anything changes

</td></tr>
</table>

<br/>

## 🗺 Project map

```text
src/
├── app/
│   ├── (marketing)/      Public site: home, pricing, employers, interns, blog, legal
│   ├── (auth)/           Login, signup, email codes, password reset
│   ├── intern/           Candidate app
│   ├── employer/         Hiring app
│   ├── admin/            Admin console
│   └── api/              Route handlers (each write starts with requireMutation)
├── components/           UI by area: app, employer, admin, home, marketing, payments, ui
├── lib/
│   ├── offer.ts          The one way to read or write an offer (legacy money shape)
│   ├── checkout.ts       What an employer pays: per-hire, upfront discount, monthly, full-time
│   ├── gst.ts            Place of supply and the CGST / SGST / IGST split
│   ├── onboarding.ts     Candidate profile ⇄ legacy storage shape
│   ├── payments.ts       Idempotent settlement for checkout and webhooks
│   ├── notify.ts         In-app notification + email, deduplicated
│   ├── schedulers.ts     Interview reminders and nudges
│   ├── admin/            Permissions, CMS collections, CSV, ratings import
│   ├── security/         Sessions, CSRF, passwords, rate limits, signed URLs, file store
│   └── content/          Marketing copy, DB first with built-in fallbacks
└── proxy.ts              Admin permission gate for pages and APIs

drizzle/                  SQL migrations (read them before they run)
scripts/                  Seed, migrate, live-copy tools, legacy password patch
deploy/                   Backup, release, PM2 and nginx
```

<br/>

## 🤝 Working on it

1. Branch from `master`; keep pull requests small.
2. New write endpoint? Start it with `requireMutation({ req, roles })`.
3. Touching offers or profiles? Go through `lib/offer.ts` and `lib/onboarding.ts`; never read the JSON directly.
4. Schema change? `npm run db:generate`, read the SQL, commit it.
5. Colours and spacing come from tokens in `src/app/globals.css`.
6. Run the four checks above before pushing.

<br/>

<div align="center">

**Built for the people who hire and the people who get hired.**

<sub>© Findtern · <a href="https://findtern.in">findtern.in</a></sub>

</div>
