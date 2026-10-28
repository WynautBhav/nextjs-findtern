# Release matrix (WIP, stopped on the owner's instruction, 28 Oct 2026)

Build: production build of master `8955cff`, QA database (live copy, scrubbed, `npm run qa:seed`), `PAYMENTS_MODE=free`.
Method: one `npm run qa -- crawl --browsers=<b> --widths=<w>` per cell, so each cell has its own totals, with `QA_ALL_WIDTHS=1` (a switch added to `e2e/crawl.e2e.mjs`: WebKit and Firefox run the same widths as Chromium). Personas: signed out, intern-hired, employer-main, admin, college admin at the width given, plus the situation accounts (intern-empty/one/heavy/longtext/lowscore/hidden, employer-empty/one/heavy/usd/longtext) in Chromium at 375, 768 and 1440 (so those widths have more page visits). axe is on (WCAG 2.0/2.1 A and AA, serious and critical).
Aggregation: `docs/qa/b/repro/matrix-aggregate.mjs`.

## Done: Chromium, all nine widths

| cell | pages | error screens | console errors | failed requests | overflow | axe serious/critical | harness / probe |
|---|---|---|---|---|---|---|---|
| chromium 360 | 541 | 0 | 0 | 114 | 0 | 28 | 21 |
| chromium 375 | 572 | 0 | 0 | 128 | 0 | 28 | 21 |
| chromium 393 | 541 | 0 | 0 | 114 | 0 | 28 | 21 |
| chromium 412 | 541 | 0 | 0 | 114 | 0 | 28 | 21 |
| chromium 768 | 541 | 0 | 0 | 114 | 0 | 55 | 21 |
| chromium 1024 | 541 | 0 | 0 | 114 | 0 | 55 | 21 |
| chromium 1280 | 541 | 0 | 0 | 114 | 0 | 55 | 21 |
| chromium 1440 | 573 | 0 | 0 | 128 | 0 | 64 | 21 |
| chromium 1920 | 541 | 0 | 0 | 114 | 0 | 55 | 21 |

- **Failed requests** are all `404 /api/intern/avatar` and `404 /api/uploads/qa-photo.png`: uploads are not served on the local QA server (a known limit of the harness, not a product defect).
- **Harness / probe (21 per cell)**: 8 "access leaks" that are false positives (`/employers` and `/employer-terms-and-conditions` are public marketing pages, but the crawler classes any `/employer…` path as an employer route) and 13 "no database row to fill" for dynamic routes of situation accounts that have no such row.
- **axe, by cause** (distinct pages; each one repeats at every width it shows): see QA-161 to QA-164 in the ledger. The count rises from 768 up because the label-in-name finding also appears on about 30 admin pages from that width.

## Not done
- WebKit (all widths) and Firefox: the WebKit run at 360 was stopped twice, see below; Firefox was not started.
- keyboard, motion (reduced motion), Lighthouse on the four dashboards plus home, `e2e/run.mjs`, the college e2e: not run.

## WebKit memory (QA-166)
The first WebKit crawl at 360 (4 contexts) took the machine to under 1.5 GB free: one `WPEWebProcess` held 9.7 GB. A second run at concurrency 2 with a watchdog (kill above 3.5 GB) had the watchdog kill one `WPEWebProcess` at 3.58 GB within two minutes. The page was not identified (the cell was stopped before it finished). Separately the home page `/` crashes the WebKit renderer after about 4 s every time (QA-111, `docs/qa/b/repro/webkit-mem.mjs`).
