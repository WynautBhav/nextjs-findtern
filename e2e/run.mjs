#!/usr/bin/env node
/**
 * `npm run e2e` - build if needed, start a production server against the
 * local test database, prove the server is really on that database, run the
 * critical-path story with node:test, stop the server, exit non-zero on any
 * failure.
 *
 * Env:
 *   DATABASE_URL   test DB (default postgresql://findtern:findtern_dev@localhost:5433/findtern_e2e);
 *                  refused unless the host is localhost / 127.0.0.1 / ::1
 *   E2E_PORT       server port (default 3300)
 *   E2E_REBUILD=1  run `next build` even when .next/BUILD_ID exists
 *   E2E_HEADED=1   show the browser
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { ARTIFACTS, ROOT, port, testDatabaseUrl } from "./lib/env.mjs";
import { closeDb, one } from "./lib/db.mjs";

const log = (...a) => console.log("[e2e]", ...a);

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(1);
}

let DATABASE_URL;
try {
  DATABASE_URL = testDatabaseUrl();
} catch (e) {
  fail(e.message);
}
process.env.DATABASE_URL = DATABASE_URL; // lib/db.mjs reads it
const PORT = port();
const ORIGIN = `http://localhost:${PORT}`;

/**
 * Every variable that could make the server reach something real is set
 * here, explicitly, so a value in .env / .env.local cannot fill the gap
 * (@next/env only fills keys that are *undefined* in process.env - an empty
 * string counts as set).
 */
const serverEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  DATABASE_URL,
  MAIL_MODE: "log",
  PAYMENTS_MODE: "free",
  SCHEDULERS: "off",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  DEEPSEEK_API_KEY: "",
  INCRUITER_WEBHOOK_SECRET: "",
  STORAGE_BUCKET: "",
  TRUST_PROXY: "",
  VERCEL: "",
  SESSION_SECRET: "e2e-session-secret-0123456789-abcdefghijklmnop",
  SIGNING_SECRET: "e2e-signing-secret-0123456789-abcdefghijklmnop",
  PUBLIC_ORIGIN: ORIGIN,
  UPLOAD_ROOT: join(ARTIFACTS, "uploads"),
  LEGACY_UPLOAD_ROOT: join(ARTIFACTS, "legacy-uploads"),
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

function portFree(p) {
  return new Promise((resolve) => {
    const srv = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => srv.close(() => resolve(true)))
      .listen(p, "::");
  });
}

async function waitReady(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ORIGIN}/login`, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${ORIGIN} within ${timeoutMs / 1000}s`);
}

/**
 * Proof the server reads the test DB, before any test writes anything: a
 * row that exists only in the test DB must be visible through the app.
 * GET /api/users/exists/phone/:phone is public and read-only.
 */
async function canary() {
  const digits = String(Date.now()).slice(-10);
  const row = await one(
    `INSERT INTO users (first_name, last_name, email, country_code, phone_number, password, role, is_active)
     VALUES ('E2E', 'Canary', $1, '+999', $2, '!canary-cannot-sign-in', 'intern', false) RETURNING id`,
    [`e2e-canary-${digits}@e2e.invalid`, digits],
  );
  try {
    const res = await fetch(`${ORIGIN}/api/users/exists/phone/${digits}?cc=%2B999`);
    const body = await res.json().catch(() => ({}));
    if (body.exists !== true) {
      throw new Error(
        `server does not see the test database (canary lookup → ${res.status} ${JSON.stringify(body)}). ` +
          `Is another DATABASE_URL winning? Refusing to run.`,
      );
    }
  } finally {
    await one(`DELETE FROM users WHERE id = $1`, [row.id]);
  }
}

async function main() {
  mkdirSync(join(ARTIFACTS, "uploads"), { recursive: true });
  mkdirSync(join(ARTIFACTS, "legacy-uploads"), { recursive: true });

  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(p, "utf8"));
    if (m) log(`${f} sets DATABASE_URL (host ${safeHost(m[1])}); overridden by process env → test DB`);
  }

  try {
    const r = await one(`SELECT current_database() AS db, (SELECT count(*) FROM users)::int AS users`);
    log(`test DB ${r.db} on ${safeHost(DATABASE_URL)} (${r.users} users)`);
  } catch (e) {
    fail(`cannot query the test database: ${e.message}. Migrate a local copy first (see e2e/README.md).`);
  }

  if (process.env.E2E_REBUILD === "1" || !existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    log("building (next build)…");
    // Build with the same env: prerendered pages read the DB at build time.
    const code = await run("npm", ["run", "build"], { env: serverEnv });
    if (code !== 0) fail(`next build failed (exit ${code})`);
  } else {
    log(`using existing build ${readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim()} (E2E_REBUILD=1 to rebuild)`);
  }

  if (!(await portFree(PORT))) fail(`port ${PORT} is in use; set E2E_PORT or stop that server`);

  const serverLog = createWriteStream(join(ARTIFACTS, "server.log"));
  log(`starting next start -p ${PORT} (log: e2e/.artifacts/server.log)`);
  const server = spawn(join(ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(PORT)], {
    cwd: ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  let exited = false;
  server.on("exit", () => (exited = true));

  const stop = () => {
    if (exited) return;
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  let code = 1;
  try {
    await waitReady();
    if (exited) throw new Error("server exited during startup; see e2e/.artifacts/server.log");
    await canary();
    log("canary passed: server reads the test DB");
    const started = Date.now();
    code = await run(
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-reporter=spec", join("e2e", "critical-path.e2e.mjs")],
      {
        env: {
          ...process.env,
          DATABASE_URL,
          E2E_BASE_URL: ORIGIN,
          E2E_RUN_STARTED: String(started),
        },
      },
    );
  } catch (e) {
    console.error(`[e2e] ${e.message}`);
    code = 1;
  } finally {
    stop();
    await closeDb();
  }
  log(code === 0 ? "PASS" : `FAIL (exit ${code})`);
  process.exit(code);
}

function safeHost(u) {
  try {
    const x = new URL(u.trim().replace(/^["']|["']$/g, ""));
    return `${x.hostname}:${x.port || 5432}`;
  } catch {
    return "?";
  }
}

main();
