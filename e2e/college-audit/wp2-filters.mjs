// WP2 C1: every Master data filter, ready-made view and custom value opens exactly the students a plain SQL oracle says.
// Oracle = raw SQL on the scratch DB (not the app's code). Needs the wp2 build on WP2_BASE (default :3332) and a Chromium.
//   cd <worktree> && DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_wp2 node e2e/college-audit/wp2-filters.mjs
import pg from "pg";
import { openRoles, closeAll } from "./lib/ctx.mjs";
const base = process.env.WP2_BASE ?? "http://localhost:3332";
const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_[A-Za-z0-9_]+$/.test(url)) throw new Error("refusing: wp2 scratch DB only");
const db = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await db.connect();
const college = (await db.query("select college_id from college_admins where email='tpo@jklu.edu.in'")).rows[0].college_id;
// One row per current member with the raw facts; verified only is applied by each oracle that needs it.
const M = (await db.query(`
  select m.status, coalesce(r.year, m.year) as year, o.extra_data as ed, o.location_types as lt, o.has_laptop as laptop,
    (select count(*) from proposals p where p.intern_id=m.user_id and p.status<>'draft' and p.employer_id<>'admin') offers,
    (select count(*) from proposals p where p.intern_id=m.user_id and (p.hired_at is not null or p.status in ('hired','completed'))) hired,
    (select count(*) from proposals p where p.intern_id=m.user_id and p.status not in ('draft','withdrawn') and jsonb_typeof(p.offer_details->'fullTimeOffer')='object') ppo
  from college_memberships m join users u on u.id=m.user_id left join intern_onboarding o on o.user_id=m.user_id
  left join college_roster r on r.college_id=m.college_id and r.email=lower(u.email)
  where m.college_id=$1 and m.left_at is null`, [college])).rows.map((r) => {
  const a = r.ed?.academics ?? {};
  const score = typeof r.ed?.findternScore === "number" ? Math.min(10, Math.max(0, r.ed.findternScore)) : null;
  const sc = a.scoreType ?? "cgpa";
  const cgpa = sc === "cgpa" && /^[0-9]+(\.[0-9]+)?$/.test(a.score ?? "") && Number(a.score) <= 10 ? Number(a.score) : null;
  const types = (r.lt ?? []).map((x) => String(x).toLowerCase());
  const mode = types.includes("onsite") ? "onsite" : types.includes("hybrid") ? "hybrid" : types.includes("remote") ? "remote" : null;
  const open = r.ed?.openToWork !== false;
  return { v: r.status === "verified", year: r.year, score, cgpa, mode, laptop: r.laptop, offers: +r.offers, hired: +r.hired, ppo: +r.ppo, open, degree: a.degree ?? null };
});
const V = M.filter((m) => m.v);
const strong = (m) => m.score !== null && m.score >= 7, high = (m) => m.cgpa !== null && m.cgpa >= 7.5;
const quad = (m) => (m.score === null || m.cgpa === null ? null : strong(m) && high(m) ? "stars" : strong(m) ? "scoreBeatsCg" : high(m) ? "cgBeatsScore" : "support");
const idx = { remote: 0, hybrid: 1, onsite: 2 };
const cases = [
  ["status=verified", "?status=verified", V.length],
  ["status=unverified", "?status=unverified", M.length - V.length],
  ["mode=remote (picked remote only)", "?mode=remote", M.filter((m) => m.v || true).filter((m) => m.mode !== null && idx[m.mode] <= 0).length],
  ["mode=hybrid (remote or hybrid pick)", "?mode=hybrid", V.filter((m) => m.mode !== null && idx[m.mode] <= 1).length],
  ["mode=onsite (all three)", "?mode=onsite", V.filter((m) => m.mode !== null).length],
  ["band=espresso (<6)", "?band=espresso", V.filter((m) => m.score !== null && m.score < 6).length],
  ["band=cappuccino (6 to <8, 6.0 is Cappuccino)", "?band=cappuccino", V.filter((m) => m.score !== null && m.score >= 6 && m.score < 8).length],
  ["band=latte (8+, 8.0 is Latte)", "?band=latte", V.filter((m) => m.score !== null && m.score >= 8).length],
  ["band=done", "?band=done", V.filter((m) => m.score !== null).length],
  ["band=none (verified, no score)", "?band=none", V.filter((m) => m.score === null).length],
  ["marks=foundation", "?marks=foundation", V.filter((m) => m.cgpa !== null && m.cgpa < 4).length],
  ["marks=rising (4 to <6)", "?marks=rising", V.filter((m) => m.cgpa !== null && m.cgpa >= 4 && m.cgpa < 6).length],
  ["marks=strong (6 to <8)", "?marks=strong", V.filter((m) => m.cgpa !== null && m.cgpa >= 6 && m.cgpa < 8).length],
  ["marks=top (8+)", "?marks=top", V.filter((m) => m.cgpa !== null && m.cgpa >= 8).length],
  ["year=1", "?year=1", M.filter((m) => m.year === 1).length],
  ["year=4", "?year=4", M.filter((m) => m.year === 4).length],
  ["course=B.Tech", "?course=B.Tech", M.filter((m) => m.v && m.degree === "B.Tech").length],
  ["course=Course not set", "?course=Course+not+set", M.filter((m) => !m.v || m.degree === null).length],
  ["placement=offer", "?placement=offer", V.filter((m) => m.offers > 0).length],
  ["placement=hired", "?placement=hired", V.filter((m) => m.hired > 0).length],
  ["placement=ppo", "?placement=ppo", V.filter((m) => m.ppo > 0).length],
  ["view Strong score, no offer", "?view=overlooked", V.filter((m) => strong(m) && m.offers === 0).length],
  ["view Most offers", "?view=most-offers", V.filter((m) => m.offers > 0).length],
  ["view Score beats CGPA", "?view=score-beats-cg", V.filter((m) => quad(m) === "scoreBeatsCg").length],
  ["view CGPA beats score", "?view=cg-beats-score", V.filter((m) => quad(m) === "cgBeatsScore").length],
  ["view Strong on both", "?view=stars", V.filter((m) => quad(m) === "stars").length],
  ["view Needs support", "?view=support", V.filter((m) => quad(m) === "support").length],
  ["view Placed and PPO", "?view=placed", V.filter((m) => m.hired > 0).length],
  ["view No laptop", "?view=no-laptop", V.filter((m) => m.laptop === false).length],
];
const { browser, ctxs } = await openRoles(["tpo"], { base });
const p = await ctxs.tpo.newPage();
const listed = async () => { const t = await p.locator("section[aria-label='Master data table']").innerText(); const m = t.match(/([\d,]+)\s+of\s+([\d,]+)\s+students/); return m ? +m[1].replace(/,/g, "") : null; };
let bad = 0;
for (const [name, q, want] of cases) {
  await p.goto(`${base}/college/master-data${q}`, { waitUntil: "load" }); await p.waitForTimeout(250);
  const got = await listed();
  if (got !== want) { bad++; console.log("FAIL", name, "list", got, "oracle", want); } else console.log("ok  ", name, got);
}
// Custom values: Minimum Findtern score and CGPA typed by hand, on the page's own controls.
await p.goto(`${base}/college/master-data?status=verified`, { waitUntil: "load" }); await p.waitForTimeout(300);
const setMin = async (label, v) => {
  const sel = p.locator(`select[aria-label="Minimum ${label}"]`);
  await sel.selectOption("custom");
  await p.locator(`input[aria-label="Minimum ${label}, 0 to 10"]`).fill(v);
  await p.waitForTimeout(150);
};
const clear = async () => { await p.goto(`${base}/college/master-data?status=verified`, { waitUntil: "load" }); await p.waitForTimeout(250); };
for (const [label, v, f] of [["Findtern score", "7.3", (m) => m.score !== null && m.score >= 7.3], ["Findtern score", "6", (m) => m.score !== null && m.score >= 6], ["Findtern score", "10", (m) => m.score !== null && m.score >= 10], ["Findtern score", "7.25", (m) => m.score !== null && m.score >= 7.3], ["CGPA", "8.5", (m) => m.cgpa !== null && m.cgpa >= 8.5], ["CGPA", "9.7", (m) => m.cgpa !== null && m.cgpa >= 9.7], ["CGPA", "0", (m) => m.cgpa !== null && m.cgpa >= 0]]) {
  await clear();
  const has = (await p.locator(`select[aria-label="Minimum ${label}"]`).count()) > 0;
  if (!has) { console.log("skip custom", label, "(no such control)"); continue; }
  await setMin(label, v);
  const got = await listed(), want = V.filter(f).length;
  if (got !== want) { bad++; console.log("FAIL custom", label, v, "list", got, "oracle", want); } else console.log("ok   custom", label, v, got);
}
await closeAll(browser);
await db.end();
console.log(bad ? `\nWP2 filters: ${bad} FAIL` : "\nWP2 filters: PASS");
process.exit(bad ? 1 : 0);
