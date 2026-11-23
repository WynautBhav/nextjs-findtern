// Loopback guard for the audit scripts: they create users, orders and mail rows, so they may only ever talk to a local
// server (localhost / 127.0.0.1 on 3330-3339) and a local scratch database (127.0.0.1:5549x / findtern_ca_*).
export function assertLocalOnly(base, databaseUrl = process.env.DATABASE_URL) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):333\d$/.test(base ?? "")) throw new Error(`refused: BASE must be http://localhost:333x (got '${base}')`);
  if (databaseUrl !== undefined && databaseUrl !== "" && !/^postgres(ql)?:\/\/[^@/]*@127\.0\.0\.1:5549\d\/findtern_ca_[A-Za-z0-9_]+(\?.*)?$/.test(databaseUrl)) throw new Error("refused: DATABASE_URL must be a findtern_ca_* database on 127.0.0.1:5549x");
}
