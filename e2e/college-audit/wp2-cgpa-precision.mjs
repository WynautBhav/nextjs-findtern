// WP2 C1 repro: a CGPA with two decimals (the onboarding form allows 6 characters) must read the same in the table, the CSV and
// the filters. Sets two scratch students' CGPA to 8.47 and 7.96, reads Master data and the CSV, restores the rows.
//   DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_wp2 node e2e/college-audit/wp2-cgpa-precision.mjs
import pg from "pg";
import { login, parseCsv } from "./wp2-lib.mjs";
import { openRoles, closeAll } from "./lib/ctx.mjs";
const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_wp2$/.test(url)) throw new Error("refusing: wp2 scratch DB only");
const base = process.env.WP2_BASE ?? "http://localhost:3332";
const db = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await db.connect();
const pick = (await db.query(`select o.user_id, u.email, o.extra_data->'academics'->>'score' old from intern_onboarding o join users u on u.id=o.user_id join college_memberships m on m.user_id=o.user_id and m.status='verified' order by u.email limit 2`)).rows;
const vals = ["8.47", "7.96"];
let bad = 0;
const fail = (m) => { bad++; console.log("FAIL", m); };
try {
  for (const [i, r] of pick.entries()) await db.query(`update intern_onboarding set extra_data = jsonb_set(extra_data, '{academics,score}', to_jsonb($2::text)) where user_id=$1`, [r.user_id, vals[i]]);
  const s = await login();
  const res = await s.post("/api/college/students/export", { columns: ["email", "cgpa"], userIds: pick.map((r) => r.user_id) });
  const rows = parseCsv((await res.text()).replace(/^\uFEFF/, "")).slice(1);
  for (const [i, r] of pick.entries()) { const got = rows.find((x) => x[0].replace(/^'/, "") === r.email)?.[1]; got === vals[i] ? console.log("ok   CSV CGPA", r.email, got) : fail(`CSV CGPA of ${r.email} is "${got}", student entered ${vals[i]}`); }
  const { browser, ctxs } = await openRoles(["tpo"], { base });
  const p = await ctxs.tpo.newPage();
  const count = async (q) => { await p.goto(`${base}/college/master-data?status=verified${q}`, { waitUntil: "load" }); await p.waitForTimeout(250); return +(await p.locator("section[aria-label='Master data table']").innerText()).match(/([\d,]+)\s+of\s/)[1].replace(/,/g, ""); };
  const all = (await db.query(`select o.extra_data->'academics'->>'score' s from intern_onboarding o join college_memberships m on m.user_id=o.user_id and m.status='verified'`)).rows.map((r) => Number(r.s)).filter(Number.isFinite);
  const bandTop = await count("&marks=top");
  all.filter((v) => v >= 8).length === bandTop ? console.log("ok   band Top (8+)", bandTop) : fail(`band Top shows ${bandTop}, SQL ${all.filter((v) => v >= 8).length}`);
  // custom minimum typed with two decimals
  await p.goto(`${base}/college/master-data?status=verified`, { waitUntil: "load" });
  await p.locator('select[aria-label="Minimum CGPA"]').selectOption("custom");
  await p.locator('input[aria-label="Minimum CGPA, 0 to 10"]').fill("8.46");
  await p.waitForTimeout(200);
  const got = +(await p.locator("section[aria-label='Master data table']").innerText()).match(/([\d,]+)\s+of\s/)[1].replace(/,/g, "");
  const want = all.filter((v) => v >= 8.46).length;
  got === want ? console.log("ok   custom CGPA 8.46", got) : fail(`custom CGPA 8.46 lists ${got}, SQL ${want}`);
  const cell = await p.locator("tbody tr", { hasText: pick[0].email.split("@")[0].replace(/\d+$/, "") }).first().innerText().catch(() => "");
  await closeAll(browser);
} finally {
  for (const r of pick) await db.query(`update intern_onboarding set extra_data = jsonb_set(extra_data, '{academics,score}', to_jsonb($2::text)) where user_id=$1`, [r.user_id, r.old]);
  await db.end();
}
console.log(bad ? `WP2 cgpa precision: ${bad} FAIL` : "WP2 cgpa precision: PASS");
process.exit(bad ? 1 : 0);
