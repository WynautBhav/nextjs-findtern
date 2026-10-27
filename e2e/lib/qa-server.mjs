/**
 * The QA server: `next start` against a LOCAL scrubbed database, with every
 * outward-facing integration switched off. Same safety contract as
 * e2e/run.mjs (process env beats .env*, loopback DB only, canary row proves
 * the server reads the DB we think it does) plus TRUST_PROXY=1 so the crawler
 * can give each persona its own X-Forwarded-For and not share the 8-logins /
 * 15-minute limiter bucket. TRUST_PROXY is safe here: the server listens on
 * loopback only.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { ARTIFACTS, ROOT, testDatabaseUrl } from "./env.mjs";
import { one } from "./db.mjs";

export const QA_PORT = Number(process.env.QA_PORT || 3500);
export const QA_ORIGIN = `http://localhost:${QA_PORT}`;

export function qaEnv() {
  const DATABASE_URL = testDatabaseUrl();
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(QA_PORT),
    DATABASE_URL,
    MAIL_MODE: "log",
    PAYMENTS_MODE: "free",
    SCHEDULERS: "off",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: "",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    DEEPSEEK_API_KEY: "",
    INCRUITER_WEBHOOK_SECRET: "",
    STORAGE_BUCKET: "",
    TRUST_PROXY: "1",
    VERCEL: "",
    SESSION_SECRET: "qa-session-secret-0123456789-abcdefghijklmnop",
    SIGNING_SECRET: "qa-signing-secret-0123456789-abcdefghijklmnop",
    PUBLIC_ORIGIN: QA_ORIGIN,
    UPLOAD_ROOT: join(ARTIFACTS, "qa-uploads"),
    LEGACY_UPLOAD_ROOT: join(ARTIFACTS, "qa-legacy-uploads"),
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

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

/** Build when there is no build, or when QA_REBUILD=1 (do this after src/ changes). */
export async function ensureBuild(log = console.log) {
  const have = existsSync(join(ROOT, ".next", "BUILD_ID"));
  if (have && process.env.QA_REBUILD !== "1") {
    log(`using existing build ${readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim()} (QA_REBUILD=1 to rebuild)`);
    return;
  }
  log("building (next build)…");
  const code = await run("npm", ["run", "build"], { env: qaEnv() });
  if (code !== 0) throw new Error(`next build failed (exit ${code})`);
}

/** Starts the server, waits for it, proves it reads the test DB. Returns { stop, logPath }. */
export async function startServer(log = console.log) {
  mkdirSync(join(ARTIFACTS, "qa-uploads"), { recursive: true });
  mkdirSync(join(ARTIFACTS, "qa-legacy-uploads"), { recursive: true });
  if (!(await portFree(QA_PORT))) throw new Error(`port ${QA_PORT} is in use; set QA_PORT or stop that server`);
  const logPath = join(ARTIFACTS, "qa-server.log");
  const serverLog = createWriteStream(logPath);
  const server = spawn(join(ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(QA_PORT)], {
    cwd: ROOT,
    env: qaEnv(),
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
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });

  const deadline = Date.now() + 90_000;
  for (;;) {
    if (exited) throw new Error(`server exited during startup; see ${logPath}`);
    try {
      const res = await fetch(`${QA_ORIGIN}/login`, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`server did not answer on ${QA_ORIGIN} within 90s`);
    await new Promise((r) => setTimeout(r, 500));
  }

  // Canary: a row that exists only in the QA database must be visible through the app.
  const digits = String(Date.now()).slice(-10);
  const row = await one(
    `INSERT INTO users (first_name, last_name, email, country_code, phone_number, password, role, is_active)
     VALUES ('QA', 'Canary', $1, '+999', $2, '!canary-cannot-sign-in', 'intern', false) RETURNING id`,
    [`qa-canary-${digits}@qa.invalid`, digits],
  );
  try {
    const res = await fetch(`${QA_ORIGIN}/api/users/exists/phone/${digits}?cc=%2B999`);
    const body = await res.json().catch(() => ({}));
    if (body.exists !== true) throw new Error(`server does not see the QA database (canary → ${res.status} ${JSON.stringify(body)}). Refusing to run.`);
  } finally {
    await one(`DELETE FROM users WHERE id = $1`, [row.id]);
  }
  log("canary passed: server reads the QA database");
  return { stop, logPath };
}
