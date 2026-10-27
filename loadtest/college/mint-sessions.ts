/**
 * Mint one signed-in session per seeded demo role (dev only), for crawls and
 * audits that would otherwise trip the login rate limiter.
 *   DATABASE_URL=… SESSION_SECRET=… node --experimental-strip-types loadtest/college/mint-sessions.ts > sessions.json
 */
if (process.env.NODE_ENV === "production") throw new Error("dev only");
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createSession } from "../../src/lib/security/session.ts";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const one = async (q: string) => (await c.query(q)).rows[0];
const ids = {
  college: await one("select id, email from college_admins where email='tpo@jklu.edu.in'"),
  employer: await one("select id, company_email as email from employers where company_email='hiring@northwind.dev'"),
  intern: await one("select id, email from users where email='candidate@findtern.dev'"),
  admin: await one("select id, email from admins limit 1"),
};
const out: Record<string, { cookie: string; csrf: string }> = {};
for (const [role, r] of Object.entries(ids)) {
  const csrf = randomBytes(24).toString("base64url");
  const cookie = createSession({ uid: r.id, role: role as never, email: r.email, permissions: role === "admin" ? ["*"] : undefined, secure: false }).cookie.split(";")[0];
  out[role] = { cookie: `${cookie}; ft_csrf=${csrf}`, csrf };
}
console.log(JSON.stringify(out));
await c.end();
