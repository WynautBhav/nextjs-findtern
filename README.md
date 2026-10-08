# Findtern — Next.js

Internship hiring platform. Marketing site + intern / employer / admin product.

## Stack
- Next.js 16 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Postgres
- Auth: argon2id + signed session cookie + CSRF double-submit (`src/lib/security/`)
- Payments: Razorpay · Mail: nodemailer · Motion: GSAP + Lenis

## Getting started
```bash
npm install
npm run db:reset      # generate DDL, push, seed demo accounts
npm run dev           # http://localhost:3100
```

Demo accounts (password `Findtern@2026`): see `scripts/seed.ts` `ACCOUNTS`.

## Scripts
| Command | What |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production |
| `npm run lint` | eslint |
| `npm test` | node:test security suite |
| `npm run db:reset` | regenerate + push + seed |
| `npm run db:verify` | row counts + real login against route handlers |
| `npm run db:studio` | drizzle studio |

## Layout
- `src/app/(marketing)` — public site
- `src/app/(auth)` — login / signup / reset
- `src/app/intern` · `employer` · `admin` — product surfaces
- `src/app/api` — route handlers (all mutations go through `requireMutation`)
- `src/lib/db` — schema + client · `src/lib/security` — auth primitives
- `src/lib/content` — marketing content accessors (DB-backed with TS fallback)

## Conventions
- Every mutating route handler starts with `requireMutation({ req, roles, ownerId? })`.
- Never port legacy defects: plaintext passwords, unauthenticated `/uploads`, IDOR.
- Marketing pages read through `src/lib/content` accessors, never import data files directly.
