// Data-sync oracle. Loopback only (sync-lib refuses anything but findtern_ca_* on 5549x and http://localhost:333x).
//
//   BASE=http://localhost:3337 DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_sync \
//     SYNC_OUT=out.json SYNC_BASELINE=baseline.json node --experimental-strip-types e2e/college-audit/sync-oracle.mjs <tag> [--tpo=email]
//
//   tag "seed" also writes the baseline of invariant rows that the SEED script (not the app) violates; later tags fail only on NEW rows.
//   Runs: Part C (SQL invariants over the whole DB) + Part B for the college screens (per student + tiles) of every college with a TPO login.
//   Prints a PASS/FAIL line per check and writes a JSON summary (checks, cells = matrix entries, failures).
import { runInvariants } from "./sync-invariants.mjs";
import { collegeOracle } from "./sync-college.mjs";
import { q, rec, summary, closeDb, session } from "./sync-lib.mjs";

const tag = process.argv[2] ?? "run";
const only = process.argv.find((a) => a.startsWith("--tpo="))?.slice(6);
const sampleCap = Number(process.env.SYNC_SAMPLE_CAP ?? Infinity);
const t0 = Date.now();
await runInvariants(tag);
const colleges = await q(`SELECT c.id, c.name, a.email FROM colleges c JOIN college_admins a ON a.college_id = c.id AND a.is_active ORDER BY c.name, a.created_at`);
const seen = new Set();
const admin = await session("admin", process.env.ADMIN_EMAIL ?? "admin@findtern.dev").catch((e) => { rec("B-college", `${tag}:admin login`, "admin session", false, e.message); return null; });
const stats = {};
for (const c of colleges) {
  if (seen.has(c.id) || (only && c.email !== only)) continue; seen.add(c.id);
  try { stats[c.name] = await collegeOracle(`${tag}:${c.name}`, { collegeId: c.id, tpoEmail: c.email, admin, sampleCap }); }
  catch (e) { rec("B-college", `${tag}:${c.name}`, `college oracle ran for ${c.name}`, false, e.stack?.split("\n").slice(0, 3).join(" | ")); }
}
// ---- ledger (what was typed through the real UI/API in sync-enter.mjs) vs what the DB stored and the TPO CSV shows
if (process.env.LEDGER) {
  const { readFileSync } = await import("node:fs"); const { cell } = await import("./sync-lib.mjs"); const { cgpaText } = await import("../../src/lib/college/master-row.ts");
  const led = JSON.parse(readFileSync(process.env.LEDGER, "utf8"));
  for (const i of led.interns) {
    const u = (await q(`SELECT u.first_name, u.last_name, u.email, u.phone_number, o.skills, o.city, o.state, o.has_laptop, o.extra_data->'academics' a, m.status ms, m.year, m.branch, m.left_at, c.name cn FROM users u LEFT JOIN intern_onboarding o ON o.user_id = u.id LEFT JOIN college_memberships m ON m.user_id = u.id LEFT JOIN colleges c ON c.id = m.college_id WHERE u.email = $1`, [i.email]))[0];
    if (!u) { cell(i.email, "user", "db", "exists", "missing", { area: "A-ledger" }); continue; }
    const L = (f, e, a) => cell(i.email, f, "ledger->db", e, a, { area: "A-ledger" });
    L("first_name", i.firstName, u.first_name); L("last_name", i.lastName, u.last_name); L("phone", i.phone, u.phone_number);
    L("branch(academics)", i.typed.branch, u.a?.specialization ?? u.a?.branch); L("city", i.typed.city, u.city); L("state", i.typed.state, u.state); L("laptop", i.typed.laptop, u.has_laptop);
    L("skills", i.typed.skills.join(","), (u.skills ?? []).map((x) => x?.name ?? x).join(","));
    L("semester", i.typed.semester, u.a?.currentSemester);
    L("cgpa stored as typed", i.typed.cgpa, u.a?.score ?? u.a?.cgpa);
    L("membership year", i.typed.year, u.year); L("membership branch", i.typed.branch, u.branch);
    L("membership status", "verified", u.ms);
  }
}
const out = summary({ tag, stats, seconds: Math.round((Date.now() - t0) / 1000) });
await closeDb();
process.exit(out.fail ? 1 : 0);
