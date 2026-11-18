# Route sweep

Logs in as each role on a **local scratch database**, visits every gated page and records status, console
errors, failed requests, horizontal overflow, an axe-core violation count and screenshots at 1440x900 and
390x844, then probes the access-control matrix (each role and a guest requesting every other role's pages).

```bash
# 1. scratch DB (loopback only), migrated and seeded
DATABASE_URL=postgresql://findtern@127.0.0.1:54350/findtern_f1 npm run db:migrate
node --experimental-strip-types scripts/seed.ts            # admin@findtern.dev, hiring@northwind.dev, candidate@findtern.dev
node --experimental-strip-types scripts/seed-colleges.ts   # tpo@jklu.edu.in (password for all: Findtern@2026)
node e2e/seed-situations.mjs --no-scrub                    # real ids for the admin [id] pages

# 2. production build, TRUST_PROXY=1 so each login carries its own X-Forwarded-For
next build && TRUST_PROXY=1 next start -p 3150 -H 127.0.0.1

# 3. sweep (about 10 minutes for 100 routes x 2 widths; run it as a background job)
SWEEP_BASE=http://127.0.0.1:3150 node scripts/route-sweep.mjs
node e2e/route-sweep/build-report.mjs                      # results.json (+ optional scores.json) -> REPORT.md
```

Output goes to `SWEEP_OUT` (default `~/hermes-team/artifacts/findtern-ui/baseline`): `results.json`,
`REPORT.md`, `<role>/<route-slug>-{desktop,mobile}.jpg` (full page, cropped at 2000 px).
Other env: `SWEEP_ROLES`, `SWEEP_ONLY` (path substring), `SWEEP_NOSHOTS=1`, `SWEEP_SKIP_MATRIX=1`,
`SWEEP_INTERN_EMAIL`/`SWEEP_INTERN_PASSWORD` (sweep as a different intern), `CHROME`.

Exit code 1 on any 5xx, console error, failed request, login failure or access-control FAIL.

Notes
- The route list comes from `src/app/**/page.tsx` (`e2e/lib/routes.mjs`). The removed employer/intern Messages
  pages are skipped. A page that redirects away is recorded with its target and not screenshotted.
- Not covered: API routes, POST/PUT/DELETE, cross-tenant object access (employer A reading employer B's id),
  screen-reader behaviour, keyboard focus order.
- `scores.json` (`{"role:/route": {hierarchy, craft, distinct, tells, bugs}}`) holds the vision ratings; the
  report builder merges it and sorts worst first.
