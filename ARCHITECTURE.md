# ARCHITECTURE.md: how Findtern is built, and the rules that keep it sound

Locked 29 Oct 2026. Every session reads this, then `SPECS.md`, before it
changes code. Change either file only on an owner decision, and record the
change in its changelog.

## 1. Which document wins

| Question | Source of truth |
|---|---|
| What the product is, what must never be true | `PRODUCT.md` |
| How the system is built, the code rules | **`ARCHITECTURE.md`** (this file) |
| How screens look and behave, the plan, the definition of done | **`SPECS.md`** |
| Colour, type and radius values | `src/app/globals.css` (the tokens) |
| Known bugs and their status | `docs/qa/bug-ledger.md` |
| Gaps against the legacy app | `LEGACY_PARITY_REPORT.txt` |
| Next.js APIs (v16, not the version in training data) | `node_modules/next/dist/docs/` |

**Superseded, history only:** `DESIGN.md`, `docs/design_system.md`,
`docs/implementation_plan.md`, `docs/finish-tracker.md`. If one of them
disagrees with `SPECS.md`, `SPECS.md` is right.

## 2. The system in one picture

```
Browser ── proxy.ts ──┬── app/<role>/layout.tsx   session + role check, ConsoleShell
                      │      └── page.tsx (RSC)   reads through lib/*, renders
                      └── app/api/**/route.ts     every write: requireMutation → zod → lib/* → db
                                                        │
lib/* (domain logic, tested) ── lib/db (Drizzle) ── Postgres (shared with the legacy app)
instrumentation.ts ── lib/schedulers.ts (reminders, nudges)
```

- **Stack:** Next.js 16 App Router (React 19, server components first),
  Tailwind v4 with tokens in `globals.css`, Postgres through Drizzle, zod at
  the trust boundary, Radix through the Watermelon/shadcn registry. One
  Node process serves the marketing site and all five consoles.
- **The route gate is `src/proxy.ts`** (what older Next called middleware).
  Do not add a `middleware.ts`.
- **The database is shared with the legacy app.** We read and write the
  legacy shapes. Migrations only add (`drizzle/`, read the SQL before it
  runs, `npm run db:verify` after).

## 3. Where code goes

```
src/app/<role>/           pages: intern, employer, admin, college, drive, (marketing), (auth)
src/app/api/<area>/       route handlers, one folder per resource
src/components/ui/        primitives from the Watermelon registry (button, dialog, sheet, table, ...)
src/components/app/       shared app building blocks (PageHead, Surface, Pill, EmptyScene, RowMenu, ...)
src/components/layout/    ConsoleShell, site header/footer, navigation progress
src/components/<role>/    pieces used by one console only
src/lib/<domain>.ts       business rules: offer, checkout, gst, journey, payments, timesheets, ...
src/lib/security/         sessions, CSRF, passwords, rate limits, signed URLs, file store
src/lib/db/               schema.ts + getDb()
```

**Rules for placing new code:**

1. **Pages stay thin.** A page loads data through a `lib/*` function and
   renders components. Business rules (money, status, eligibility, dates)
   never live in a page or a component. They go in `lib/` with a
   `*.test.ts` next to them.
2. **One place per concept.** Offers go through `lib/offer.ts`, intern
   profiles through `lib/onboarding.ts`, status labels and tones through
   one map, dates through `lib/format.ts`. Before writing a helper, search
   (`graphify query`, then grep). A second copy is a bug waiting to diverge.
3. **Promote, don't copy.** A component used by two consoles moves from
   `components/<role>/` to `components/app/`. It is never duplicated.
4. **Client components are leaves.** `"use client"` only on the part that
   needs state or events. Data fetching stays on the server.
5. **Files over ~400 lines get split** when you touch them, by job and not
   by size. At the time of writing that means `employer/candidates/page.tsx`
   (1155 lines), `send-proposal-form.tsx` (975), `employer/onboarding-form.tsx`
   (737) and `orders-manager.tsx` (625).

### Blast radius: shared files

A change to any of these reaches **every** console (intern, employer, admin,
college). It needs screenshots of all four, not only the one you were
working on:

`src/app/globals.css` · `components/layout/console-shell.tsx` ·
`components/app/primitives.tsx` · `components/ui/*` · `lib/format.ts` ·
`lib/auth.ts` · `lib/security/*` · `lib/guards-mutation.ts` · `proxy.ts`

## 4. Request rules (non-negotiable)

**Reads (pages)**
- The layout checks the session and role (`getSession()`, then redirect).
  A page that shows one record also checks that the viewer owns it, or
  that the role is allowed to see it. Never trust an id from the URL.
- Employers see masked candidate identity (initials, no photo, no name)
  until an offer exists. The masking lives in lib (`employer-redaction`,
  `identity-mask`), never in JSX.

**Writes (route handlers)**
1. The first line is `requireMutation({ req, roles, ownerId? })`, or a
   wrapper that calls it (`requireCollegeMutation`). It checks session,
   role, CSRF and ownership in one place.
   *Allowed exceptions, nothing else:* `api/auth/*` (no session yet),
   `api/webhooks/*` (signature verified instead) and `api/website/contact`
   (public form, rate limited).
2. Parse the body with zod. Reject unknown shapes with 400 and a sentence
   a person can read.
3. Prices, totals, eligibility and status changes are computed on the
   server. The browser never sends an amount we trust.
4. Multi-row changes that must succeed together run in a transaction, and
   handlers that retry (payments, webhooks) are idempotent.
5. The client calls writes through `csrfFetch` (`lib/client-fetch.ts`).

**Never port these from legacy:** plaintext passwords, unauthenticated
`/uploads`, the `/api/interns` IDOR.

## 5. Data invariants

- **Money:** `offer_details` holds major units (rupees). Every `*_payments`
  and `intern_payouts` amount column holds minor units (paise). Convert
  only where the value is displayed, with `lib/currency.ts`.
- **Status is derived from rows, not stored as free text.** Status
  vocabularies have history (`hired` and `accepted` both mean working), so
  treat the union. Raw enum values never reach the screen.
- **Time:** stored in UTC. Interns see IST (labelled); employers see their
  own zone. Typed dates are DD/MM/YYYY; displayed dates go through
  `shortDate` / `shortDateTime`. No `toLocale*String` at call sites.
- **Score:** the mean of four axes in `intern_onboarding.extra_data.ratings`,
  cached as `findternScore`. Never purchasable, never moved by profile
  completeness.
- **Files:** identity documents go to the private store and are served
  through signed, expiring, viewer-checked links.

## 6. Failure model

- **Empty and broken are different states.** A query that fails shows an
  error state with a retry, never an empty list. `catch {}` that returns
  `[]` is banned.
- Each console segment has its own `loading.tsx` (a skeleton shaped like
  the page) and `error.tsx`. There is no root `loading.tsx`, because it
  turned not-found pages into 200s (QA-150).
- Route handlers return `{ error: "<sentence>" }` with the right status
  (400 validation, 401 no session, 403 not allowed, 404, 409 state
  conflict). The UI shows that sentence as it is.

## 7. How correctness is proven

| Layer | Command | Covers |
|---|---|---|
| Types | `npx tsc --noEmit` | everything |
| Lint | `npm run lint` | Next, React and TypeScript rules |
| Unit | `npm test` | `src/lib/**/*.test.ts`, the business rules |
| Security | `npm run test:security` | sessions, CSRF, access, impersonation |
| Schema | `npm run db:verify` | migrations against the legacy shapes |
| End to end | `npm run e2e` | the critical path per role, asserting DB rows and emails |
| Visual | `npm run shots` | screenshots at 390 / 768 / 1440 |
| UI rules | `npm run check:rules` (to be built, SPECS P1) | the mechanical bans in SPECS §4 and the guard coverage above |

CI (`.github/workflows/ci.yml`) runs the whole chain plus the build on
every push to master. **A red check is a stop, not a note.**

**Bug fixes start with a test.** Reproduce the bug in a unit test (logic)
or an e2e step (flow), watch it fail, then fix it. The fix goes in the
shared root cause, after grepping every caller, not in the one screen
that showed it.

## 8. Branches and sessions

- `master` is the integration line and what gets deployed. It is always
  green.
- **Work happens on short branches**, for example `ui/employer-candidates`,
  `fix/qa-116-tap-targets` or `feat/...`. Each one is merged within about
  two days. No long-lived area branches: intern and employer share the
  shell, the primitives and the tokens, so separate branches for each
  would conflict on exactly the files being fixed.
- To work on two areas in parallel, use `git worktree add` (one folder per
  branch). Merge often.
- A change to a blast-radius file (§3) goes in its own branch and merges
  **before** page work that depends on it.
- **Public repo:** never commit server addresses, open ports, credentials or
  infrastructure weaknesses.

## 9. Changelog

- 29 Oct 2026: written. Supersedes the doc set listed in §1.
