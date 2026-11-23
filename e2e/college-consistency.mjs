// Master data vs the raw tables, per student. Recomputes every student's meetings, drive calls and offer replies
// straight from interviews / college_drive_meetings / proposals with its own plain rules (not the app's SQL), then
// compares them with what the college's master data export returns for the same students. A student who is in a
// drive (any call row) but shows no drive call in master data fails here.
//
//   DATABASE_URL=postgresql://findtern:findtern_dev@127.0.0.1:5435/findtern_otw271 BASE=http://localhost:3528 \
//     node e2e/college-consistency.mjs
//
// Loopback only (reads the DB directly). Read-only, except the export writes one college audit row.
import pg from "pg";

const DB = process.env.DATABASE_URL;
const BASE = process.env.BASE ?? "http://localhost:3528";
const TPO = { email: process.env.TPO_EMAIL ?? "tpo@jklu.edu.in", password: process.env.TPO_PASSWORD ?? "Findtern@2026" };
if (!DB || !/@(127\.0\.0\.1|localhost)[:/]/.test(DB)) throw new Error("DATABASE_URL must be a loopback test DB");

const GRACE_MS = 10 * 60_000; // src/lib/college/constants.ts CALL_GRACE_MS
const MEETING_MS = 30 * 60_000; // interview-lifecycle.ts MEETING_MINUTES
const now = Date.now();
const todayIst = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
const utc = (d) => (d ? d.getTime() : null);
// The columns are UTC wall time without a zone; read them as UTC, not as this machine's local time.
pg.types.setTypeParser(1114, (v) => new Date(`${v.replace(" ", "T")}Z`));

const db = new pg.Client({ connectionString: DB, options: "-c TimeZone=UTC" });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;

const college = (await q(`SELECT c.id FROM college_admins a JOIN colleges c ON c.id = a.college_id WHERE a.email = $1`, [TPO.email]))[0];
if (!college) throw new Error(`no college admin ${TPO.email}`);
const students = await q(
  `SELECT m.user_id, u.email FROM college_memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = $1 AND m.status = 'verified' AND m.left_at IS NULL ORDER BY u.email`,
  [college.id],
);
const ids = students.map((s) => s.user_id);
const byUser = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) ?? []), r]), new Map());
const interviews = byUser(await q(`SELECT * FROM interviews WHERE intern_id = ANY($1)`, [ids]), "intern_id");
const calls = byUser(
  await q(`SELECT dm.*, dr.ends_at, dr.revoked_at FROM college_drive_meetings dm JOIN college_drives dr ON dr.id = dm.drive_id WHERE dr.college_id = $1`, [college.id]),
  "user_id",
);
const proposals = byUser(await q(`SELECT * FROM proposals WHERE intern_id = ANY($1)`, [ids]), "intern_id");

const join = (parts) => parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`).join(" · ");
function expected(id) {
  const iv = interviews.get(id) ?? [];
  const slot = (r) => [null, r.slot1, r.slot2, r.slot3][r.selected_slot ?? 0] ?? null;
  const passed = (r) => {
    const s = utc(slot(r));
    if (s !== null) return s + MEETING_MS <= now;
    const last = Math.max(...[r.slot1, r.slot2, r.slot3].filter(Boolean).map(utc));
    return (Number.isFinite(last) && last < now) || (r.respond_by && ["pending", "waiting", "proposed"].includes(r.status) && utc(r.respond_by) <= now);
  };
  const notAccepted = iv.filter(
    (r) =>
      ["declined", "rejected"].includes(r.status) ||
      (r.status === "cancelled" && r.cancelled_by === "intern") ||
      // Never answered: the invite ran out with no slot picked. A booked meeting nobody closed is not the student's no.
      (r.selected_slot == null && (r.status === "expired" || (["pending", "waiting", "proposed", "scheduled"].includes(r.status) && passed(r)))),
  ).length;
  const cs = calls.get(id) ?? [];
  const waiting = (c) => c.status === "requested" && utc(c.starts_at) + GRACE_MS >= now && utc(c.ends_at) > now && (!c.revoked_at || utc(c.revoked_at) > now);
  const ps = (proposals.get(id) ?? []).filter((p) => p.status !== "draft");
  const begun = (p) => /^\d{4}-\d{2}-\d{2}/.test(p.offer_details?.startDate ?? "") && p.offer_details.startDate.slice(0, 10) <= todayIst;
  const lapsed = ps.filter((p) => (["sent", "interview_scheduled"].includes(p.status) && !p.hired_at && begun(p)) || (p.status === "expired" && p.offer_details?.expiredReason === "no_reply_past_start")).length;
  return {
    meetingsDone: String(iv.filter((r) => r.status === "completed").length),
    meetingsNotAccepted: String(notAccepted),
    meetingsMissed: String(iv.filter((r) => r.status === "missed").length),
    driveCalls: join([
      [cs.filter((c) => c.status === "accepted").length, "accepted"],
      [cs.filter((c) => ["declined", "expired"].includes(c.status) || (c.status === "requested" && !waiting(c))).length, "declined or lapsed"],
      [cs.filter(waiting).length, "waiting"],
    ]),
    offerReplies: join([
      [ps.filter((p) => ["accepted", "processing", "hired", "completed"].includes(p.status)).length, "accepted"],
      [ps.filter((p) => p.status === "rejected").length, "rejected"],
      [lapsed, "deadline missed"],
      [ps.filter((p) => ["sent", "interview_scheduled"].includes(p.status) && !begun(p)).length, "waiting"],
    ]),
  };
}

// Sign in as the college officer and export master data for every verified student.
const login = await fetch(`${BASE}/api/auth/college/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}` }, body: JSON.stringify(TPO) });
if (!login.ok) throw new Error(`college login ${login.status}`);
const jar = login.headers.getSetCookie().map((c) => c.split(";")[0]);
const csrf = decodeURIComponent(jar.find((c) => c.startsWith("ft_csrf="))?.slice(8) ?? "");
const COLS = ["email", "meetingsDone", "meetingsNotAccepted", "meetingsMissed", "driveCalls", "offerReplies"];
const res = await fetch(`${BASE}/api/college/students/export`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE, cookie: jar.join("; "), ...(csrf ? { "x-csrf-token": csrf } : {}) },
  body: JSON.stringify({ columns: COLS, userIds: ids }),
});
if (!res.ok) throw new Error(`export ${res.status} ${await res.text()}`);

function parseCsv(text) {
  const rows = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") rows.at(-1).push(cell), (cell = "");
    else if (ch === "\n") rows.at(-1).push(cell.replace(/\r$/, "")), rows.push([]), (cell = "");
    else cell += ch;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter((r) => r.length > 1);
}
const [, ...lines] = parseCsv((await res.text()).replace(/^﻿/, ""));
const shown = new Map(lines.map((l) => [l[0].replace(/^'/, "").toLowerCase(), Object.fromEntries(COLS.slice(1).map((k, i) => [k, l[i + 1] ?? ""]))]));

const failures = [];
const tally = Object.fromEntries(COLS.slice(1).map((k) => [k, 0]));
for (const s of students) {
  const want = expected(s.user_id);
  const got = shown.get(s.email.toLowerCase());
  if (!got) {
    failures.push(`${s.email}: missing from master data`);
    continue;
  }
  for (const k of Object.keys(want)) {
    if (want[k] !== "" && want[k] !== "0") tally[k]++;
    if (want[k] !== got[k]) failures.push(`${s.email}: ${k} shows "${got[k]}", tables say "${want[k]}"`);
  }
}
// Every student in a drive call must show it (the 23 Nov "Vikram Saini" case).
const inDrive = students.filter((s) => (calls.get(s.user_id) ?? []).some((c) => c.status !== "cancelled")).length;
const shownInDrive = students.filter((s) => shown.get(s.email.toLowerCase())?.driveCalls).length;
if (inDrive !== shownInDrive) failures.push(`students with a drive call: tables ${inDrive}, master data ${shownInDrive}`);

// ── C2: the numbers on the TPO dashboard, Students, Master data and the admin college pages equal the database. ──────────
// Plain SQL oracles (not the app's code); every figure is read from the rendered text of the page that shows it.
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const adminLogin = await fetch(`${BASE}/api/auth/admin/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL ?? "admin@findtern.dev", password: process.env.ADMIN_PASSWORD ?? TPO.password }) });
const tpoJar = jar.join("; ");
const adminJar = adminLogin.ok ? adminLogin.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") : null;
const page = async (path, cookie) => text(await (await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" })).text());
const num = (t, re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
const check = (what, got, want) => { if (got !== want) failures.push(`${what}: page shows ${got}, database says ${want}`); };
const one = async (sql, p = []) => Object.values((await q(sql, p))[0] ?? {})[0];
const cid = college.id;
const live = `m.college_id = $1 AND m.left_at IS NULL`;
const members = Number(await one(`SELECT count(*) FROM college_memberships m WHERE ${live}`, [cid]));
const verifiedN = Number(await one(`SELECT count(*) FROM college_memberships m WHERE ${live} AND m.status = 'verified'`, [cid]));
const claimedN = members - verifiedN;
// A student who LEFT this college vanishes from every count and list, so their roster row is not on the list any more.
const leaverSql = `EXISTS (SELECT 1 FROM users u JOIN college_memberships m ON m.user_id = u.id WHERE lower(u.email) = r.email AND m.college_id = r.college_id AND m.left_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM users u JOIN college_memberships m ON m.user_id = u.id WHERE lower(u.email) = r.email AND m.college_id = r.college_id AND m.left_at IS NULL)`;
const rosterN = Number(await one(`SELECT count(*) FROM college_roster r WHERE r.college_id = $1 AND NOT (${leaverSql})`, [cid]));
const noAccount = Number(await one(`SELECT count(*) FROM college_roster r WHERE r.college_id = $1 AND NOT (${leaverSql}) AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = r.email)`, [cid]));
const noScore = Number(await one(`SELECT count(*) FROM college_memberships m LEFT JOIN intern_onboarding o ON o.user_id = m.user_id WHERE ${live} AND m.status = 'verified' AND jsonb_typeof(o.extra_data->'findternScore') IS DISTINCT FROM 'number'`, [cid]));
const real = `p.employer_id <> 'admin' AND lower(coalesce((SELECT company_email FROM employers e WHERE e.id = p.employer_id), '')) <> 'ai-interview@findtern.ai'`;
const offers24 = Number(await one(`SELECT count(*) FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE p.status <> 'draft' AND ${real} AND p.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'`, [cid]));
const hires24 = Number(await one(`SELECT count(*) FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE ${real} AND p.hired_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'`, [cid]));
const withOffer = Number(await one(`SELECT count(DISTINCT p.intern_id) FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE p.status <> 'draft' AND ${real}`, [cid]));
const hiredN = Number(await one(`SELECT count(DISTINCT p.intern_id) FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE (p.hired_at IS NOT NULL OR p.status IN ('hired', 'completed')) AND ${real}`, [cid]));
const scoredN = verifiedN - noScore;

const dash = await page("/college", tpoJar);
check("/college 'Verified on Findtern'", num(dash, /Verified on Findtern\s+([\d,]+)/), verifiedN);
check("/college 'On your list'", num(dash, /On your list\s+([\d,]+)/), rosterN);
check("/college 'AI interview done'", num(dash, /AI interview done\s+([\d,]+)/), scoredN);
check("/college 'Got an offer'", num(dash, /Got an offer\s+([\d,]+)/), withOffer);
check("/college tile 'AI interview not done'", num(dash, /AI interview not done\s+([\d,]+)/), noScore);
check("/college tile 'Not joined yet'", num(dash, /Not joined yet\s+([\d,]+)/), noAccount);
check("/college tile 'Waiting for approval'", num(dash, /Waiting for approval\s+([\d,]+)/) ?? 0, claimedN);
check("/college last 24 h new offers", num(dash, /Last 24 hours:\s*([\d,]+) new offers/), offers24);
check("/college last 24 h hires", num(dash, /new offers\s*·\s*([\d,]+) hires?/), hires24);
const studentsPage = await page("/college/students", tpoJar);
check("/college/students 'Verified students'", num(studentsPage, /Verified students\s+([\d,]+)/), verifiedN);
const md = await page("/college/master-data", tpoJar);
check("/college/master-data header students", num(md, /Master data\s+([\d,]+) students/), members);
check("/college/master-data header waiting", num(md, /([\d,]+) waiting for your approval/) ?? 0, claimedN);
check("/college/approvals 'Waiting for you'", num(await page("/college/approvals", tpoJar), /Waiting for you\s+([\d,]+)/) ?? 0, claimedN);
if (!adminJar) failures.push(`admin login failed (${adminLogin.status}): admin pages not checked`);
else {
  const adminCollege = await page(`/admin/colleges/${cid}`, adminJar);
  check("/admin/colleges/<id> 'Students in this college'", num(adminCollege, /Students in this college\s*([\d,]+)/), members);
  check("/admin/colleges/<id> Students tab count", num(adminCollege, /Students\s+([\d,]+)\s+Wallet/) ?? 0, claimedN);
  const list = await page("/admin/colleges", adminJar);
  check("/admin/colleges row 'Students'", num(list, /JK Lakshmipat University\s+Code \S+ · [^\d]*?(\d[\d,]*)\s+\d[\d,]* of/), members);
}
console.log(`[consistency] C2: members ${members} (verified ${verifiedN}, waiting ${claimedN}), roster ${rosterN}, offers 24h ${offers24}, hires 24h ${hires24}`);

await db.end();
console.log(`[consistency] ${students.length} students · students with data per column ${JSON.stringify(tally)} · in a drive call ${inDrive}`);
if (failures.length) {
  console.log(`[consistency] FAIL ${failures.length}\n  ${failures.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log("[consistency] PASS: master data matches the raw tables for every student");
