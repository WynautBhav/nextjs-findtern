/**
 * Load-test fixture: a "Load Test College" with N consenting students, each
 * with a minted session + CSRF pair, plus one placement officer for the SSE
 * probe. Writes the credentials to OUT (keep it outside the repo).
 *
 * Usage:
 *   DATABASE_URL=… SESSION_SECRET=… OUT=/tmp/…/sessions.json N=500 \
 *     node --experimental-strip-types loadtest/college/fixture.ts
 *
 * Re-running replaces the previous load-test rows. Dev databases only.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, like } from "drizzle-orm";
import pg from "pg";

import * as schema from "../../src/lib/db/schema.ts";
import { createSession } from "../../src/lib/security/session.ts";
import { NOTICE_HASH, NOTICE_VERSION, CONSENT_PURPOSES } from "../../src/lib/college/consent.ts";
import { generateDriveToken } from "../../src/lib/college/tokens.ts";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production");
const N = Number(process.env.N ?? 500);
const OUT = process.env.OUT;
if (!OUT) throw new Error("Set OUT to a path outside the repo");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC" });
const db = drizzle(pool, { schema });

const slug = "load-test-college";
await db
  .insert(schema.colleges)
  .values({ name: "Load Test College", slug, isPartner: true, emailDomains: ["loadtest.invalid"] })
  .onConflictDoNothing();
const [college] = await db.select().from(schema.colleges).where(eq(schema.colleges.slug, slug));

const old = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%@loadtest.invalid"));
if (old.length) {
  const ids = old.map((u) => u.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await db.delete(schema.collegePresence).where(inArray(schema.collegePresence.userId, chunk));
    await db.delete(schema.collegeMemberships).where(inArray(schema.collegeMemberships.userId, chunk));
    await db.delete(schema.collegeConsents).where(inArray(schema.collegeConsents.userId, chunk));
    await db.delete(schema.users).where(inArray(schema.users.id, chunk));
  }
}
await db.delete(schema.collegeDrives).where(eq(schema.collegeDrives.collegeId, college.id));

// The password is never used (sessions are minted directly); store a non-hash so login can't work.
const users = await db
  .insert(schema.users)
  .values(
    Array.from({ length: N }, (_, i) => ({
      firstName: "Load",
      lastName: `Student ${String(i + 1).padStart(3, "0")}`,
      email: `student${i}@loadtest.invalid`,
      emailVerified: true,
      phoneNumber: `7000${String(i).padStart(6, "0")}`,
      countryCode: "+00",
      password: "!disabled",
    })),
  )
  .returning({ id: schema.users.id, email: schema.users.email });

for (let i = 0; i < users.length; i += 250) {
  const chunk = users.slice(i, i + 250);
  const consents = await db
    .insert(schema.collegeConsents)
    .values(chunk.map((u) => ({ userId: u.id, collegeId: college.id, noticeVersion: NOTICE_VERSION, noticeHash: NOTICE_HASH, purposes: [...CONSENT_PURPOSES], declaredAdult: true })))
    .returning({ id: schema.collegeConsents.id, userId: schema.collegeConsents.userId });
  await db.insert(schema.collegeMemberships).values(
    consents.map((c) => ({ userId: c.userId, collegeId: college.id, status: "verified", verifiedBy: "email_domain", year: 3, consentId: c.id })),
  );
}

// A live drive with no cutoffs, so all N count in the drive's presence.
const { hash } = generateDriveToken();
await db.insert(schema.collegeDrives).values({
  collegeId: college.id,
  title: "Load test drive",
  kind: "internship",
  startsAt: new Date(Date.now() - 3600_000),
  endsAt: new Date(Date.now() + 24 * 3600_000),
  tokenHash: hash,
  createdBy: "loadtest",
});

await db
  .insert(schema.collegeAdmins)
  .values({ collegeId: college.id, name: "Load TPO", email: "tpo@loadtest.invalid", password: "!disabled" })
  .onConflictDoNothing();
const [tpo] = await db.select().from(schema.collegeAdmins).where(eq(schema.collegeAdmins.email, "tpo@loadtest.invalid"));

const session = (uid: string, role: "intern" | "college", email: string) => {
  const csrf = randomBytes(24).toString("base64url");
  const cookie = createSession({ uid, role, email, secure: false, ttlMs: 6 * 3600_000 }).cookie.split(";")[0];
  return { cookie: `${cookie}; ft_csrf=${csrf}`, csrf };
};

writeFileSync(
  OUT,
  JSON.stringify({
    collegeId: college.id,
    students: users.map((u) => session(u.id, "intern", u.email)),
    tpo: session(tpo.id, "college", tpo.email),
  }),
);
console.log(`fixture: ${users.length} students, 1 officer → ${OUT}`);
await pool.end();
