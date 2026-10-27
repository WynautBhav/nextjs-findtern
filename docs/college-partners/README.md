# College Partners + Virtual Drive

Colleges get a read-only placement console. They run virtual drives that employers join with one link, and they chase students live on drive day.

| Doc | What's in it |
|---|---|
| [design-brief.md](design-brief.md) | Personas (placement officer, drive employer, student), principles, scope |
| [reference-board.md](reference-board.md) | Superset, Handshake, Unstop, HirePro: screens, what to steal, what to avoid; plus AISHE and DPDP |
| [threat-model.md](threat-model.md) | Threats → guards → the test that proves each |
| [decisions.md](decisions.md) | Settled decisions, open product decisions, questions for Incruiter |
| [loadtest-results.md](loadtest-results.md) | 500-student presence test (k6 + SSE probe) |
| [aishe-source.md](aishe-source.md) | Where the college list comes from |

## Run it locally
```bash
npm run db:migrate                                   # applies drizzle/0007_college_partners.sql (additive)
DATABASE_URL=… npm run db:seed-colleges             # JKLU demo: roster 73, 61 joined, a live drive (link printed once)
npm run dev
```
Demo logins (all use password `Findtern@2026`):

| Role | Login | Where |
|---|---|---|
| Placement officer | tpo@jklu.edu.in | `/college/login` |
| Employer | hiring@northwind.dev | opens the printed `/drive/<token>` link |
| Student | candidate@findtern.dev | `/intern/college` |
| Findtern admin | admin@findtern.dev | `/admin/colleges` |

## Code map
- **Schema:** `src/lib/db/schema.ts` (the "College partners" section), migration `drizzle/0007_college_partners.sql`
- **Rules (pure, tested):** `src/lib/college/access.ts`, `eligibility.ts`, `tokens.ts`, `consent.ts`, `roster.ts`
- **Every scoped read:** `src/lib/college/scope.ts`. Officer writes: `guard.ts` (`requireCollegeMutation`)
- **Presence:** `POST /api/intern/college/heartbeat` (30 s); `GET /api/college/presence/stream` (SSE)
- **Calls:** `src/lib/college/meetings.ts`. Uses Findtern's Google Meet; in dev without Google it falls back to a Jitsi room
- **Push:** `src/lib/college/push.ts`, `public/sw.js`. Needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

## Tests
- `npm run test:security`: `src/lib/security/college-access.test.ts` (21 authorization cases)
- `npm test`: also `src/lib/college/roster.test.ts`
- `npm run test:e2e:college`: Playwright, all 3 roles in one story (needs a running app; see the file header)
