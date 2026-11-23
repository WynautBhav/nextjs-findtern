// Loopback guard for the audit scripts: they create users, orders and mail rows, so they may only ever talk to a local
// server (localhost / 127.0.0.1 on 3330-3339) and a local scratch database (127.0.0.1:5549x / findtern_ca_*).
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/** Throws unless `databaseUrl` is a findtern_ca_* database on 127.0.0.1/localhost port 55490-55499 and no PG* env var points elsewhere. */
export function assertLocalDb(databaseUrl = process.env.DATABASE_URL, env = process.env) {
  if (!databaseUrl) throw new Error("refused: DATABASE_URL is not set (a missing URL would fall back to PG* defaults)");
  let u;
  try { u = new URL(databaseUrl); } catch { throw new Error("refused: DATABASE_URL is not a valid URL"); }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") throw new Error("refused: DATABASE_URL must be a postgres URL");
  if (!LOOPBACK.has(u.hostname)) throw new Error(`refused: DATABASE_URL host must be 127.0.0.1 or localhost (got '${u.hostname}')`);
  const port = Number(u.port);
  if (!(port >= 55490 && port <= 55499)) throw new Error(`refused: DATABASE_URL port must be 55490-55499 (got '${u.port}')`);
  if (!/^\/findtern_ca_[A-Za-z0-9_]+$/.test(u.pathname)) throw new Error("refused: DATABASE_URL database must be findtern_ca_*");
  for (const k of ["host", "hostaddr", "port"]) if (u.searchParams.has(k)) throw new Error(`refused: DATABASE_URL must not carry a '${k}' override`);
  for (const k of ["PGHOST", "PGHOSTADDR"]) {
    const v = env[k];
    if (v && !LOOPBACK.has(v) && !v.startsWith("/")) throw new Error(`refused: ${k} points at a non-loopback host`);
  }
  if (env.PGPORT && !(Number(env.PGPORT) >= 55490 && Number(env.PGPORT) <= 55499)) throw new Error("refused: PGPORT outside 55490-55499");
}

export function assertLocalOnly(base, databaseUrl = process.env.DATABASE_URL, env = process.env) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d$/.test(base ?? "")) throw new Error(`refused: BASE must be http://localhost:333x (got '${base}')`);
  assertLocalDb(databaseUrl, env);
}
