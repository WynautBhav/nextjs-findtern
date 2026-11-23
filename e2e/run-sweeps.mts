// Runs the app's own expiry sweeps (offers and interviews: src/lib/proposal-expiry-db.ts) once, as the hourly cron would,
// against the LOCAL test database, with the QA server's safe env (mail logged, payments free, no outside service).
// The live dev server runs with SCHEDULERS=off, so this is how a test moves "time passed" rows to what the sweep writes.
//
//   DATABASE_URL=postgresql://…@127.0.0.1:5435/<db> npx tsx e2e/run-sweeps.mts
import { qaEnv } from "./lib/qa-server.mjs";

Object.assign(process.env, qaEnv(), { NODE_ENV: "development", SCHEDULERS: "" });
const { sweepProposalExpiry } = await import("../src/lib/proposal-expiry-db.ts");
console.log(`[sweeps] ${JSON.stringify(await sweepProposalExpiry())}`);
process.exit(0);
