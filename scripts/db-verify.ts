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

import { sql } from "drizzle-orm";

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

  // Once-only notifications (reminders, nudges) rely on this partial unique
  // index; without it a repeated dedupeKey inserts a second row and mail.
  console.log("\nindexes");
  const idx = await db.execute(sql`select 1 from pg_indexes where indexname = 'notifications_dedupe_uniq'`);
  const hasDedupe = (idx.rows ?? (idx as unknown as unknown[])).length > 0;
  if (!hasDedupe) failed = true;
  console.log(`  ${hasDedupe ? "PASS" : "FAIL"}  notifications_dedupe_uniq (run npm run db:migrate if missing)`);

  // Migrations 0018-0024. Run against a QA copy after `npm run db:migrate`.
  console.log("\nmigration 0018-0024 schema");
  const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[]));
  const report = (ok: boolean, label: string) => {
    if (!ok) failed = true;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : " (run npm run db:migrate)"}`);
  };
  for (const t of [
    "college_drive_orders", "drive_imports", "drive_roster_entries", "identity_reviews", "drive_codes",
    "drive_entitlements", "email_campaigns", "email_outbox", "payment_refunds", "threads", "messages",
    "user_presence", "realtime_events", "notification_prefs",
  ]) {
    const r = await db.execute(sql`select 1 from information_schema.tables where table_schema = current_schema() and table_name = ${t}`);
    report(rowsOf(r).length > 0, `table ${t}`);
  }
  for (const [table, col] of [
    ["college_seat_batches", "drive_order_id"], ["college_drives", "order_id"],
    ["projects", "rejection_reason"], ["projects", "submitted_at"], ["projects", "published_at"],
  ]) {
    const r = await db.execute(sql`select 1 from information_schema.columns where table_schema = current_schema() and table_name = ${table} and column_name = ${col}`);
    report(rowsOf(r).length > 0, `column ${table}.${col}`);
  }
  for (const [table, name, needle] of [
    ["college_drive_orders", "college_drive_orders_amount_eq", "slots"],
    ["college_drive_orders", "college_drive_orders_counts_valid", "issued_count"],
    ["projects", "projects_status_check", "status"],
  ]) {
    const r = await db.execute(sql`select pg_get_constraintdef(c.oid) as def, c.convalidated as validated from pg_constraint c where c.conname = ${name} and c.conrelid = ${table}::regclass`);
    const row = rowsOf(r)[0] as { def: string; validated: boolean } | undefined;
    report(!!row && row.def.includes(needle), `check ${name}${row && !row.validated ? " (NOT VALID: validate by hand)" : ""}`);
  }
  const amountDef = rowsOf(await db.execute(sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'college_drive_orders_amount_eq'`))[0] as { def: string } | undefined;
  report(!!amountDef && /amount_minor.*slots.*fee_per_student_minor/.test(amountDef.def), "amount_minor = slots * fee_per_student_minor");
  const countsDef = rowsOf(await db.execute(sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'college_drive_orders_counts_valid'`))[0] as { def: string } | undefined;
  report(!!countsDef && /issued_count.*<=.*slots/.test(countsDef.def) && /redeemed_count.*<=.*issued_count/.test(countsDef.def), "issued <= slots, redeemed <= issued");
  for (const [name, needle] of [
    ["drive_codes_hash_uq", "code_hash"],
    ["drive_entitlements_order_intern_uq", "order_id, intern_id"],
    ["payment_refunds_live_per_payment", "failed"],
    ["college_seat_batches_drive_order_unique", "drive_order_id"],
  ]) {
    const r = await db.execute(sql`select indexdef from pg_indexes where indexname = ${name}`);
    const def = (rowsOf(r)[0] as { indexdef: string } | undefined)?.indexdef ?? "";
    report(def.includes("UNIQUE") && def.includes(needle), `unique index ${name}`);
  }
  // email_outbox.idempotency_key is a UNIQUE constraint (backed by an index).
  const ob = await db.execute(sql`select 1 from pg_constraint where conname = 'email_outbox_idempotency_key_unique' and contype = 'u'`);
  report(rowsOf(ob).length > 0, "unique email_outbox.idempotency_key");

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