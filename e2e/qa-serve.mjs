#!/usr/bin/env node
/**
 * `npm run qa:serve` - the QA server on its own (QA_PORT, default 3500), for
 * running a single step by hand or poking at the app:
 *
 *   npm run qa:serve                      # terminal 1
 *   E2E_BASE_URL=http://localhost:3500 node e2e/crawl.e2e.mjs --quick     # terminal 2
 */
import { testDatabaseUrl } from "./lib/env.mjs";
import { closeDb } from "./lib/db.mjs";
import { QA_ORIGIN, ensureBuild, startServer } from "./lib/qa-server.mjs";

process.env.DATABASE_URL = testDatabaseUrl();
await ensureBuild();
const server = await startServer();
console.log(`[qa] serving ${QA_ORIGIN} (Ctrl-C to stop); log ${server.logPath}`);
process.on("SIGINT", async () => {
  server.stop();
  await closeDb();
  process.exit(0);
});
await new Promise(() => {});
