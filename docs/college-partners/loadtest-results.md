# Presence load test: 500 concurrent students

Run 27 Oct 2026 on the dev machine, against a production build (`next build && next start -p 3201`) and the local Postgres 18 (pool of 10).

## Setup
- `loadtest/college/fixture.ts`: "Load Test College" with 500 consenting, verified students, a live drive with no cutoffs, and minted session + CSRF pairs.
- `loadtest/college/heartbeat.k6.js` (k6 v2.3.0): 500 VUs for 3 min. Each posts `/api/intern/college/heartbeat` every 30 s (the client's `HEARTBEAT_MS`), with a random 0–30 s start so tabs aren't in lockstep.
- `loadtest/college/sse-probe.mjs`: the officer's `/api/college/presence/stream`, logging every event.
- Server RSS sampled every 5 s.

## Results: all thresholds passed
| Metric | Threshold | Result |
|---|---|---|
| Heartbeat p95 | < 200 ms | **23.1 ms** |
| Heartbeat p99 | < 500 ms | **32.8 ms** (max 61 ms) |
| Failed requests | < 1% | **0 / 2,999** |
| Checks (200 + live drive in reply) | > 99% | **100%** (5,998/5,998) |
| SSE: time until officer sees 500/500 | n/a | **30.1 s** (= the tabs' staggered first beat) |
| SSE events sent in 225 s | n/a | **7** (sent only on change; keepalive otherwise) |
| Server RSS | n/a | 205–277 MB, flat after warm-up |

## What this does and doesn't prove
- 500 students are about 17 writes/s (one upsert each) plus one 5-second aggregate query per officer stream. The design never holds 500 open streams: students heartbeat, and only officers stream. That's why it is cheap.
- **Not tested:**
  - many officers or employers streaming at once;
  - Vercel serverless, where SSE is capped by function duration (production is the Hostinger Node server);
  - a slow remote DB.

  For multi-instance production nothing changes, because presence lives in Postgres, not in memory.
- Reproduce:
  `N=500 OUT=… node --experimental-strip-types loadtest/college/fixture.ts`, then
  `k6 run -e BASE=… -e SESSIONS=… loadtest/college/heartbeat.k6.js` and
  `node loadtest/college/sse-probe.mjs BASE SESSIONS 225`.
