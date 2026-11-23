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
  `SELECT m.user_id, u.email FROM college_memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = $1 AND m.status = 'verified' ORDER BY u.email`,
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
const login = await fetch(`${BASE}/api/auth/college/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify(TPO) });
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
const inDrive = students.filter((s) => calls.has(s.user_id)).length;
const shownInDrive = students.filter((s) => shown.get(s.email.toLowerCase())?.driveCalls).length;
if (inDrive !== shownInDrive) failures.push(`students with a drive call: tables ${inDrive}, master data ${shownInDrive}`);

await db.end();
console.log(`[consistency] ${students.length} students · students with data per column ${JSON.stringify(tally)} · in a drive call ${inDrive}`);
if (failures.length) {
  console.log(`[consistency] FAIL ${failures.length}\n  ${failures.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log("[consistency] PASS: master data matches the raw tables for every student");
