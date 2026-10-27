#!/usr/bin/env node
/**
 * `npm run qa` - the whole QA harness in one command.
 *
 *   npm run qa                      every step
 *   npm run qa -- crawl             one step (crawl | keyboard | motion | slow3g | lighthouse | baseline)
 *   npm run qa -- crawl --quick     step flags pass through to the step
 *   QA_REBUILD=1 npm run qa         rebuild first (do this after src/ changes)
 *
 * Needs DATABASE_URL on loopback pointing at the scrubbed QA copy (see
 * docs/qa/README.md); `--seed` runs e2e/seed-situations.mjs first.
 * Starts `next start` on QA_PORT (3500) with the safe env from lib/qa-server.mjs.
 */
import { spawn } from "node:child_process";
import { ROOT, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";
import { QA_ORIGIN, ensureBuild, startServer } from "./lib/qa-server.mjs";

const STEPS = {
  crawl: "e2e/crawl.e2e.mjs",
  keyboard: "e2e/keyboard.e2e.mjs",
  motion: "e2e/motion.e2e.mjs",
  slow3g: "e2e/slow3g.e2e.mjs",
  lighthouse: "e2e/lighthouse.mjs",
  baseline: "e2e/baseline.mjs",
};

const log = (...a) => console.log("[qa]", ...a);
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--") && a !== "--seed");
const named = args.filter((a) => !a.startsWith("--"));
const steps = named.length ? named : Object.keys(STEPS);
for (const s of steps) if (!STEPS[s]) {
  console.error(`[qa] unknown step "${s}". Steps: ${Object.keys(STEPS).join(", ")}`);
  process.exit(2);
}

function run(script, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...extra], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, E2E_BASE_URL: QA_ORIGIN },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const url = testDatabaseUrl(); // refuses a non-loopback host
  process.env.DATABASE_URL = url;
  const meta = await one(`SELECT current_database() AS db, (SELECT count(*) FROM users WHERE email LIKE '%@qa.test')::int AS personas`).catch((e) => {
    throw new Error(`cannot query the QA database: ${e.message}`);
  });
  log(`database ${meta.db}; ${meta.personas} situation accounts`);
  if (args.includes("--seed") || meta.personas === 0) {
    if (meta.personas === 0) log("no situation accounts found, seeding");
    const code = await run("e2e/seed-situations.mjs");
    if (code !== 0) throw new Error("seed failed");
  }

  await ensureBuild(log);
  const server = await startServer(log);
  const results = {};
  try {
    for (const step of steps) {
      log(`── ${step}`);
      results[step] = await run(STEPS[step], flags);
    }
  } finally {
    server.stop();
    await closeDb();
  }
  log("summary:", Object.entries(results).map(([k, v]) => `${k}=${v === 0 ? "ok" : `exit ${v}`}`).join("  "));
  process.exit(Object.values(results).some((c) => c !== 0) ? 1 : 0);
}

main().catch((e) => {
  console.error("[qa]", e.message);
  process.exit(1);
});
