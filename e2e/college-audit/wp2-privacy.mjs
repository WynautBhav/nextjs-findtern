// WP2 P1/P2 repro: claimed (unverified) students must never expose progress data to the TPO; Aadhaar/PAN/bank never shown or
// exported; CSV neutralises formulas. Needs the wp2 fixtures (wp2-fixtures.mjs) and a running build (WP2_BASE, default :3332).
// Usage: DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_wp2 node e2e/college-audit/wp2-privacy.mjs
import pg from "pg";
import { login, parseCsv, BASE } from "./wp2-lib.mjs";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/findtern@127\.0\.0\.1:5549\d\/findtern_ca_[A-Za-z0-9_]+$/.test(url)) throw new Error("refusing: wp2 scratch DB only");
const db = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await db.connect();
const bad = [];
const fail = (m) => { bad.push(m); console.log("FAIL", m); };
const ok = (m) => console.log("ok  ", m);

const claimed = (await db.query(`select m.user_id id, u.email, u.first_name, u.last_name, u.phone_number phone, o.linkedin_url linkedin, p.last_seen_at seen,
    (o.extra_data->>'findternScore') score, o.extra_data->'academics'->>'score' cgpa
  from college_memberships m join users u on u.id=m.user_id join intern_onboarding o on o.user_id=m.user_id left join college_presence p on p.user_id=m.user_id
  where m.status='claimed' and m.left_at is null order by u.email`)).rows;
if (claimed.length < 5) throw new Error("run wp2-fixtures.mjs first");
// wp2-fixtures stamps the claimed students' presence with now(); a page that prints the server's own current time (presence snapshot `at`)
// in that same second would look like a leaked lastSeenAt (the residual flake). Let the second pass before any page is read.
const waitS = Number((await db.query(`select greatest(0, 2.2 - extract(epoch from ((now() at time zone 'utc') - max(p.last_seen_at)))) w from college_presence p where p.user_id = any($1)`, [claimed.map((c) => c.id)])).rows[0].w ?? 0);
if (waitS > 0) await new Promise((r) => setTimeout(r, waitS * 1000));
const everyone = (await db.query(`select o.aadhaar_number a, o.pan_number p, o.pin_code pin, o.extra_data->'bankDetails'->>'accountNumber' bank, o.extra_data->>'emergencyPhone' em from intern_onboarding o`)).rows;
const secrets = [...new Set(everyone.flatMap((r) => [r.a, r.p, r.bank].filter((v) => v && v.length >= 6)))];
const ids = claimed.map((c) => c.id);
const verifiedNames = new Set((await db.query(`select lower(trim(u.first_name || ' ' || coalesce(u.last_name, ''))) n from college_memberships m join users u on u.id = m.user_id where m.status = 'verified' and m.left_at is null`)).rows.map((r) => r.n));
const namesakes = new Set(claimed.filter((c) => verifiedNames.has(`${c.first_name} ${c.last_name ?? ""}`.trim().toLowerCase())).map((c) => c.id));
// The seed stamps every presence row with the same now(): a claimed student's timestamp that a verified student also carries is not a leak.
const verifiedSeen = new Set((await db.query(`select p.last_seen_at s from college_presence p join college_memberships m on m.user_id = p.user_id where m.status = 'verified' and m.left_at is null`)).rows.map((r) => new Date(r.s + "Z").toISOString().slice(0, 19)));
const proposals = (await db.query(`select id from proposals where intern_id = any($1)`, [ids])).rows.map((r) => r.id);
const meets = (await db.query(`select id from college_drive_meetings where user_id = any($1)`, [ids])).rows.map((r) => r.id);

const s = await login();
const decode = (t) => t.replace(/\\+"/g, '"');
const pages = ["/college", "/college/students", "/college/master-data", ...ids.slice(0, 4).map((i) => `/college/students/${i}`)];
const drives = (await db.query(`select id from college_drives`)).rows.map((r) => r.id);
pages.push(...drives.map((d) => `/college/drives/${d}`));

for (const p of pages) {
  const html = await (await s.get(p)).text();
  const flat = decode(html);
  const what = [];
  for (const c of claimed) {
    if (c.linkedin && flat.includes(c.linkedin)) what.push(`${c.email} linkedin`);
    if (c.seen) { const iso = new Date(c.seen + "Z").toISOString().slice(0, 19); if (!verifiedSeen.has(iso) && flat.includes(iso)) what.push(`${c.email} lastSeenAt ${iso}`); }
  }
  for (const v of [...proposals, ...meets]) if (flat.includes(v)) what.push(`internal id ${v}`);
  // Bounded: an 11-digit number must not be matched inside an SVG coordinate.
  for (const v of secrets) if (new RegExp(`(?<![\\w.])${v.replace(/[^\w]/g, "\\$&")}(?![\\w])`).test(flat)) what.push(`SECRET ${v.slice(0, 3)}***`);
  // Chart titles carry only "First Last: score N", so a claimed student is told apart by id: a name that ALSO belongs to a verified
  // student (namesakes exist at 2000 seeded students) is not evidence about the claimed one and is skipped.
  for (const c of claimed) { if (namesakes.has(c.id)) continue; const nm = flat.match(new RegExp(`(?<![A-Za-z])${`${c.first_name} ${c.last_name}`.trim().replace(/[^A-Za-z0-9 ]/g, ".")}: score [0-9.]+`)); if (nm) what.push(`${c.email} named in a score chart title: ${nm[0]}`); }
  // The master data / drive rows carry numbers per student: parse each claimed row's flight object.
  for (const c of claimed) {
    for (const m of flat.matchAll(new RegExp(`"userId":"${c.id}"[^{}]{0,2500}`, "g"))) {
      const o = m[0];
      const grab = (k) => (o.match(new RegExp(`"${k}":([^,}]+)`)) ?? [])[1];
      for (const k of ["score", "cgpa", "marks10", "lastSeenAt", "city", "phone", "laptop", "english", "coding", "aptitude", "aiInterview", "semester"]) { const v = grab(k); if (v !== undefined && v !== "null") what.push(`${c.email} row.${k}=${v}`); }
      for (const k of ["offers", "offersAccepted", "offersOpen", "earningsMinor"]) { const v = grab(k); if (v !== undefined && v !== "0") what.push(`${c.email} row.${k}=${v}`); }
      if (grab("hired") === "true" || grab("ppo") === "true" || grab("hasReport") === "true") what.push(`${c.email} row.hired/ppo/report`);
    }
  }
  if (p.startsWith("/college/students/")) {
    const text = flat.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (/Last active|Online now/.test(text)) what.push("student page shows Last active / Online now");
    if (/Findtern score\s+\d/.test(text) || /CGPA\s+\d/.test(text)) what.push("student page shows a score / CGPA");
    if (/has not taken the AI interview|Not started|Not entered/.test(text)) what.push("student page says 'not taken / not started / not entered' for a student whose data is only hidden");
  }
  what.length ? fail(`${p}: ${[...new Set(what)].slice(0, 8).join("; ")}`) : ok(`${p}: no claimed-student data`);
}

// Artifacts of a claimed student are refused.
for (const k of ["report", "recording"]) {
  const r = await s.get(`/api/college/students/${claimed[0].id}/${k}`, {});
  r.status === 403 ? ok(`artifact ${k} of a claimed student: 403`) : fail(`artifact ${k} of a claimed student: ${r.status}`);
}

// CSV: every column, every student (claimed included).
const cols = (await (await s.get("/college/master-data")).text()).match(/\\"key\\":\\"[a-zA-Z]+\\"/g);
const ALL = ["name","email","phone","emergencyContact","degree","branch","startYear","endYear","year","semester","linkedin","city","cgpa","professionalCourse","professionalStatus","professionalLevel","certifications","experience","workMode","preferredLocations","laptop","lastSeenAt","skills","report","recording","english","coding","aptitude","aiInterview","score","offers","hired","ppo","earningsMinor","meetingsDone","meetingsNotAccepted","meetingsMissed","offerReplies","driveCalls"];
const allIds = (await db.query(`select m.user_id id from college_memberships m where left_at is null`)).rows.map((r) => r.id);
const t0 = Date.now();
const res = await s.post("/api/college/students/export", { columns: [...ALL, "aadhaarNumber", "panNumber", "bank", "pinCode", "address"], userIds: allIds });
const csv = await res.text();
console.log(`export ${res.status} ${csv.length} bytes in ${Date.now() - t0} ms`);
const table = parseCsv(csv.replace(/^\uFEFF/, ""));
const head = table[0];
for (const h of ["Aadhaar", "PAN", "Bank", "PIN", "Address", "aadhaar", "pan", "bank"]) if (head.some((x) => x.includes(h))) fail(`CSV has column ${h}`);
for (const v of secrets) if (new RegExp(`(?<![\\w.])${v.replace(/[^\w]/g, "\\$&")}(?![\\w])`).test(csv)) fail(`CSV contains secret ${v.slice(0, 3)}***`);
const idx = (l) => head.indexOf(l);
const byEmail = new Map(table.slice(1).map((r) => [r[idx("Email")], r]));
let leaked = 0;
for (const c of claimed) {
  const r = byEmail.get(c.email);
  if (!r) { fail(`claimed ${c.email} missing from CSV`); continue; }
  for (const l of head) {
    if (["Name", "Email", "Degree", "Branch", "Current year", "Start year", "End year"].includes(l)) continue;
    if (r[head.indexOf(l)] !== "") { leaked++; fail(`CSV claimed ${c.email} ${l}="${r[head.indexOf(l)]}"`); }
  }
}
if (!leaked) ok(`CSV: ${claimed.length} claimed rows blank beyond name/email/course`);
let formulas = 0, prefixed = 0;
for (const r of table) for (const cell of r) { if (/^[=+\-@\t\r]/.test(cell)) { formulas++; fail(`CSV cell starts with formula char: ${JSON.stringify(cell).slice(0, 60)}`); } if (cell.startsWith("'")) prefixed++; }
formulas ? 0 : ok(`CSV: no cell starts with = + - @ tab CR (${prefixed} neutralised)`);
// Raw check too: the file must not hold a cell like ,"=...
if (/(^|,)"[=+\-@\t\r]/m.test(csv.replace(/^\uFEFF/, ""))) fail("raw CSV has a quoted cell starting with a formula char");

// Tampered request: foreign / unknown ids and columns.
const t = await s.post("/api/college/students/export", { columns: ["name", "email", "nonsense", "__proto__"], userIds: ["00000000-0000-0000-0000-000000000000", "x'; drop table users;--"] });
t.status === 400 ? ok("tampered ids/columns: 400") : fail(`tampered ids: ${t.status}`);
// A student who belongs to another college, or who left, cannot be added by a tampered id list.
const other = (await db.query(`select id from colleges where id <> (select college_id from college_admins where email='tpo@jklu.edu.in') limit 1`)).rows[0].id;
const victims = (await db.query(`select m.user_id, m.college_id, u.email from college_memberships m join users u on u.id=m.user_id where m.status='verified' and m.left_at is null and m.college_id = (select college_id from college_admins where email='tpo@jklu.edu.in') order by u.email desc limit 2`)).rows;
try {
  await db.query(`update college_memberships set college_id=$2 where user_id=$1`, [victims[0].user_id, other]);
  await db.query(`update college_memberships set left_at=now() at time zone 'utc' where user_id=$1`, [victims[1].user_id]);
  const r = await s.post("/api/college/students/export", { columns: ["name", "email"], userIds: [victims[0].user_id, victims[1].user_id, claimed[0].id] });
  const rows = parseCsv((await r.text()).replace(/^\uFEFF/, "")).slice(1).map((x) => x[1]);
  rows.length === 1 && rows[0] === claimed[0].email ? ok("export drops another college's student and a student who left") : fail(`export with foreign/left ids returned ${JSON.stringify(rows)}`);
} finally {
  await db.query(`update college_memberships set college_id=$2 where user_id=$1`, [victims[0].user_id, victims[0].college_id]);
  await db.query(`update college_memberships set left_at=null where user_id=$1`, [victims[1].user_id]);
}
await db.end();
console.log(bad.length ? `\nWP2 privacy: ${bad.length} FAIL` : "\nWP2 privacy: PASS");
process.exit(bad.length ? 1 : 0);
