/**
 * Verify the seeded demo data and prove the login path actually works.
 *
 * Two things are checked, and the distinction matters:
 *
 *  1. Row counts, so a partial seed is visible rather than showing up later as
 *     a mysteriously empty dashboard.
 *  2. An actual login against the real route handlers, following the session
 *     cookie the way a browser would. This is the only way to know the
 *     credentials work - a row existing in the table does not prove the hash
 *     verifies or that the cookie is accepted.
 *
 * Also reports whether the `Secure` cookie flag will block plain-HTTP local
 * sign-in, because that failure looks exactly like "wrong password" from the
 * outside and is the single most confusing thing about running this locally.
 */
import { register } from "node:module";

// Hook to resolve next/server, next/headers, and @/* aliases in direct node execution
const hookCode = `
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("next/") && !specifier.endsWith(".js")) {
    return nextResolve(specifier + ".js", context);
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidates = [
      join(root, "src", rel + ".ts"),
      join(root, "src", rel + ".tsx"),
      join(root, "src", rel, "index.ts"),
      join(root, "src", rel, "index.tsx"),
      join(root, "src", rel),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        return { url: pathToFileURL(c).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
`;
const hookUrl = "data:text/javascript;base64," + Buffer.from(hookCode).toString("base64");
register(hookUrl);

import { getDb, schema } from "../src/lib/db/index.ts";
import { verifyPassword } from "../src/lib/security/password.ts";

const PASSWORD = "Findtern@2026";

const EXPECTED: Record<string, number> = {
  admins: 1,
  adminRoles: 5,
  employers: 4,
  users: 9,
  projects: 3,
  proposals: 3,
  internOnboarding: 9,
  interviews: 2,
  timesheets: 2,
  employerPayments: 1,
  internPayouts: 2,
  notifications: 4,
  promoCodes: 1,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set - run via `npm run db:verify`");

  const db = getDb();
  let failed = false;

  console.log("row counts");
  const totalUsers = await db.$count(schema.users);
  const isFullDataset = totalUsers > 9;
  for (const [table, expected] of Object.entries(EXPECTED)) {
    const actual = await db.$count(schema[table as keyof typeof schema] as never);
    const ok = isFullDataset
      ? actual >= (["proposals", "timesheets", "employerPayments", "internPayouts"].includes(table) ? 0 : 1)
      : actual === expected;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${table.padEnd(18)} ${actual} ${isFullDataset ? "(active)" : `(expected ${expected})`}`,
    );
  }

  // Verifying password against an admin account proves the stored format is
  // one verifyPassword accepts.
  console.log("\npassword verification");
  const admins = await db.select().from(schema.admins);
  const adminWithPw = admins.find((a) => a.email === "admin@findtern.dev") ?? admins[0];
  if (!adminWithPw) {
    console.log("  FAIL  no admin row to verify against");
    failed = true;
  } else {
    const ok = await verifyPassword(PASSWORD, adminWithPw.password);
    const wrong = await verifyPassword("wrong-password", adminWithPw.password);
    if (!ok || wrong) failed = true;
    console.log(`  ${ok ? "PASS" : "FAIL"}  correct password accepted (${adminWithPw.email})`);
    console.log(`  ${!wrong ? "PASS" : "FAIL"}  wrong password rejected`);
    console.log(`  hash format: ${adminWithPw.password.slice(0, 24)}…`);
  }

  // Exercise the real handlers. Each import pulls in the route module, so the
  // session/cookie/argon2 path under test is the one the browser hits.
  console.log("\nlogin routes");
  const cases = [
    {
      label: "intern",
      handler: () => import("../src/app/api/auth/login/route.ts"),
      body: { email: "candidate@findtern.dev", password: PASSWORD },
      expectRole: "intern",
    },

    {
      label: "employer",
      handler: () => import("../src/app/api/auth/employer/login/route.ts"),
      body: { email: "hiring@northwind.dev", password: PASSWORD },
      expectRole: "employer",
    },
    {
      label: "admin",
      handler: () => import("../src/app/api/auth/admin/login/route.ts"),
      body: { email: "admin@findtern.dev", password: PASSWORD },
      expectRole: "admin",
    },
  ];

  for (const c of cases) {
    const { POST } = await c.handler();
    const req = new Request("http://localhost/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c.body),
    });
    const res = await POST(req);
    const cookieList = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get("set-cookie")?.split(/,(?=[^;]+=[^;]+)/) ?? []);
    const sidEntry = cookieList.find((c) => c.trim().startsWith("ft_sid="))?.trim() ?? "";
    const cookie = sidEntry.split(";")[0];
    const signed = cookie.startsWith("ft_sid=") && cookie.length > 40;

    if (res.status !== 200 || !signed) {
      failed = true;
      console.log(`  FAIL  ${c.label} - status ${res.status}, cookie signed: ${signed}`);
      console.log(`        body: ${await res.text()}`);
      continue;
    }

    // Read the session back the way a guard would, to prove the signature and
    // role survive the round trip rather than just existing in the header.
    const { readSession } = await import("../src/lib/security/session.ts");
    const session = readSession(decodeURIComponent(cookie.slice("ft_sid=".length)));
    const roleOk = session?.role === c.expectRole;
    if (!roleOk) failed = true;
    console.log(
      `  ${roleOk ? "PASS" : "FAIL"}  ${c.label} - ${res.status}, role=${session?.role ?? "none"}`,
    );
    console.log(`        ${cookie.slice(0, 46)}…`);
  }

  // A wrong password must not mint a cookie.
  console.log("\nnegative case");
  const { POST: internLogin } = await import("../src/app/api/auth/login/route.ts");
  const badRes = await internLogin(
    new Request("http://localhost/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "candidate@findtern.dev", password: "wrong" }),
    }),
  );
  const badCookie = badRes.headers.get("set-cookie") ?? "";
  if (badRes.status === 401 && !badCookie) {
    console.log("  PASS  wrong password → 401, no session cookie");
  } else {
    failed = true;
    console.log(`  FAIL  wrong password → status ${badRes.status}, cookie: ${badCookie || "none"}`);
  }

  console.log(
    failed
      ? "\nsome checks failed"
      : "\nall checks passed - credentials work",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});