// Every campus drive page against master data and the raw tables. For each drive it reads the page the officer
// sees (pipeline figures, every tile and every student list, by student id), recomputes the same lists from the
// tables with plain rules, and checks each student against their master data row (year, branch, CGPA and score
// for eligibility; offers, offer replies, hired, PPO and drive meets for the lists).
//
//   DATABASE_URL=postgresql://findtern:findtern_dev@127.0.0.1:5435/findtern_otw271 BASE=http://localhost:3528 \
//     node e2e/drive-vs-master.mjs
//
// Loopback only. Read-only, except the master data export writes one college audit row. Headless browser.
import pg from "pg";
import { chromium } from "playwright";

const DB = process.env.DATABASE_URL;
const BASE = process.env.BASE ?? "http://localhost:3528";
const TPO = { email: process.env.TPO_EMAIL ?? "tpo@jklu.edu.in", password: process.env.TPO_PASSWORD ?? "Findtern@2026" };
if (!DB || !/@(127\.0\.0\.1|localhost)[:/]/.test(DB)) throw new Error("DATABASE_URL must be a loopback test DB");

const GRACE_MS = 10 * 60_000; // CALL_GRACE_MS
const now = Date.now();
const todayIst = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
pg.types.setTypeParser(1114, (v) => new Date(`${v.replace(" ", "T")}Z`)); // UTC wall time columns

const db = new pg.Client({ connectionString: DB, options: "-c TimeZone=UTC" });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;
const college = (await q(`SELECT college_id AS id FROM college_admins WHERE email = $1`, [TPO.email]))[0];
const drives = await q(`SELECT * FROM college_drives WHERE college_id = $1 ORDER BY starts_at`, [college.id]);
const members = await q(`SELECT m.user_id, m.status, m.left_at, u.email FROM college_memberships m JOIN users u ON u.id = m.user_id WHERE m.college_id = $1`, [college.id]);
const verifiedIds = members.filter((m) => m.status === "verified").map((m) => m.user_id);
const emailOf = new Map(members.map((m) => [m.user_id, m.email]));

/* ── The officer's screens ── */
const browser = await chromium.launch();
// A fresh client IP per run (e2e/lib/env.mjs freshIpHeaders), so reruns don't hit the sign-in limiter.
const ip = `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip } })).newPage();
const login = await page.request.post(`${BASE}/api/auth/college/login`, { data: TPO, headers: { origin: BASE } });
if (!login.ok()) throw new Error(`college login ${login.status()}`);

// Master data for every verified student, as the officer downloads it.
const COLS = ["email", "year", "semester", "branch", "cgpa", "score", "offers", "offerReplies", "hired", "ppo", "driveCalls"];
const csrf = decodeURIComponent((await page.context().cookies(BASE)).find((c) => c.name === "ft_csrf")?.value ?? "");
const exp = await page.request.post(`${BASE}/api/college/students/export`, { data: { columns: COLS, userIds: verifiedIds }, headers: { origin: BASE, ...(csrf ? { "x-csrf-token": csrf } : {}) } });
if (!exp.ok()) throw new Error(`export ${exp.status()}`);
function parseCsv(text) {
  const rows = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { rows.at(-1).push(cell); cell = ""; }
    else if (ch === "\n") { rows.at(-1).push(cell.replace(/\r$/, "")); rows.push([]); cell = ""; }
    else cell += ch;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell);
  return rows.filter((r) => r.length > 1);
}
const [, ...lines] = parseCsv((await exp.text()).replace(/^﻿/, ""));
const masterByEmail = new Map(lines.map((l) => [l[0].replace(/^'/, "").toLowerCase(), Object.fromEntries(COLS.map((k, i) => [k, l[i] ?? ""]))]));
const master = (id) => masterByEmail.get((emailOf.get(id) ?? "").toLowerCase());
if (process.env.SHOW) for (const e of process.env.SHOW.split(",")) console.log(`[drives] master data for ${e}:`, JSON.stringify(masterByEmail.get(e.toLowerCase())));
const num = (v) => (v === "" || v === undefined ? null : Number(v));

const failures = [];
const fail = (drive, msg) => failures.push(`${drive.title}: ${msg}`);
const name = (id) => emailOf.get(id) ?? id;
const diff = (drive, what, got, want) => {
  const extra = [...got].filter((x) => !want.has(x)), missing = [...want].filter((x) => !got.has(x));
  if (extra.length || missing.length) fail(drive, `${what}: page ${got.size}, tables ${want.size}${extra.length ? ` · only on page: ${extra.slice(0, 5).map(name).join(", ")}` : ""}${missing.length ? ` · missing from page: ${missing.slice(0, 5).map(name).join(", ")}` : ""}`);
};
const summary = [];

const TILES = { meetingsWaiting: "Meets not answered", offersWaiting: "Offers not answered", offers: "Offers received", meetings: "Meets accepted", internships: "Placed: internship", fullTime: "Placed: full-time" };
for (const drive of drives) {
  await page.goto(`${BASE}/college/drives/${drive.id}`, { waitUntil: "load" });
  await page.waitForSelector("h1");
  // Pipeline figures on the hero.
  const stages = Object.fromEntries(
    await page.$$eval('ol[aria-label="Drive pipeline"] > li', (lis) => lis.map((li) => {
      const label = li.querySelector("span")?.childNodes[0]?.textContent?.trim() ?? "";
      const value = Number((li.querySelector("span.nums.block, span.nums.mt-2")?.textContent ?? "").replace(/[^0-9]/g, ""));
      return [label, value];
    })),
  );
  const boardOpen = (await page.locator("#board").count()) > 0;
  const lists = {};
  const tiles = {};
  if (boardOpen) {
    for (const [key, label] of Object.entries(TILES)) {
      const btn = page.locator("#board button[aria-pressed]", { hasText: label }).first();
      tiles[key] = Number(((await btn.locator("span.nums").first().textContent()) ?? "").replace(/[^0-9]/g, ""));
      await btn.click();
      const all = page.locator("#board button", { hasText: /^Show all/ });
      if (await all.count()) await all.click();
      lists[key] = new Set(await page.$$eval('#board ul > li a[href^="/college/students/"]', (as) => as.map((a) => a.getAttribute("href").split("/").pop())));
    }
    for (const key of ["called", "hired"]) {
      await page.goto(`${BASE}/college/drives/${drive.id}?show=${key}#board`, { waitUntil: "load" });
      await page.waitForSelector("#board");
      const all = page.locator("#board button", { hasText: /^Show all/ });
      if (await all.count()) await all.click();
      lists[key] = new Set(await page.$$eval('#board ul > li a[href^="/college/students/"]', (as) => as.map((a) => a.getAttribute("href").split("/").pop())));
    }
  }

  /* ── The same drive from the tables ── */
  const e = drive.eligibility ?? {};
  const inc = drive.include_user_ids ?? [], exc = drive.exclude_user_ids ?? [];
  const eligible = new Set(
    members.filter((m) => {
      if (m.left_at || exc.includes(m.user_id)) return false;
      const r = master(m.user_id);
      const year = num(r?.year), sem = num(r?.semester);
      if (drive.kind === "full_time" && !(year === 4 || (year === 3 && (sem ?? 0) >= 6))) return false;
      if (inc.includes(m.user_id)) return true;
      if (m.status !== "verified" || !r) return false;
      if (e.minCgpa != null && (num(r.cgpa) === null || num(r.cgpa) < e.minCgpa)) return false;
      if (e.minScore != null && (num(r.score) === null || num(r.score) < e.minScore)) return false;
      if (Array.isArray(e.years) && e.years.length && !e.years.includes(year)) return false;
      if (Array.isArray(e.branches) && e.branches.length && !e.branches.map((b) => b.trim().toLowerCase()).includes((r.branch ?? "").trim().toLowerCase())) return false;
      return true;
    }).map((m) => m.user_id),
  );
  const came = (await q(`SELECT employer_id FROM college_drive_employers WHERE drive_id = $1`, [drive.id])).map((r) => r.employer_id);
  const end = drive.revoked_at && drive.revoked_at < drive.ends_at ? drive.revoked_at : drive.ends_at;
  const offers = (await q(`SELECT * FROM proposals WHERE employer_id = ANY($1) AND created_at BETWEEN $2 AND $3 AND status NOT IN ('draft', 'withdrawn')`, [came, drive.starts_at.toISOString(), end.toISOString()])).filter((p) => eligible.has(p.intern_id));
  const meets = (await q(`SELECT * FROM college_drive_meetings WHERE drive_id = $1`, [drive.id])).filter((m) => eligible.has(m.user_id));
  const begun = (p) => /^\d{4}-\d{2}-\d{2}/.test(p.offer_details?.startDate ?? "") && p.offer_details.startDate.slice(0, 10) <= todayIst;
  const isHired = (p) => p.hired_at || ["hired", "completed"].includes(p.status);
  const ft = (p) => p.offer_details?.fullTimeOffer && typeof p.offer_details.fullTimeOffer === "object";
  const ids = (rows, key = "intern_id") => new Set(rows.map((r) => r[key]));
  const want = {
    offers: ids(offers),
    // Waiting on the student = master data's "waiting": sent, start day not begun yet.
    offersWaiting: ids(offers.filter((p) => p.status === "sent" && !begun(p) && !p.hired_at)),
    internships: ids(offers.filter((p) => isHired(p) && !ft(p))),
    fullTime: ids(offers.filter((p) => isHired(p) && ft(p))),
    hired: ids(offers.filter(isHired)),
    meetings: ids(meets.filter((m) => m.status === "accepted"), "user_id"),
    meetingsWaiting: ids(meets.filter((m) => m.status === "requested" && m.starts_at.getTime() + GRACE_MS >= now && drive.ends_at.getTime() > now && (!drive.revoked_at || drive.revoked_at.getTime() > now)), "user_id"),
    called: ids(meets.filter((m) => m.status !== "cancelled"), "user_id"),
  };

  /* ── Compare ── */
  if (stages["Students in the drive"] !== eligible.size) fail(drive, `Students in the drive: page ${stages["Students in the drive"]}, by master data's year/branch/CGPA/score ${eligible.size}`);
  for (const [label, key] of [["Asked to meet", "called"], ["Got an offer", "offers"], ["Hired", "hired"]]) {
    if (stages[label] !== want[key].size) fail(drive, `${label} figure: page ${stages[label]}, tables ${want[key].size}`);
  }
  if (boardOpen) {
    if (tiles.offers !== offers.length) fail(drive, `Offers received tile: page ${tiles.offers}, tables ${offers.length} offers`);
    for (const key of ["meetingsWaiting", "offersWaiting", "meetings", "internships", "fullTime"]) {
      if (tiles[key] !== lists[key].size) fail(drive, `${TILES[key]} tile says ${tiles[key]} but its list has ${lists[key].size}`);
    }
    for (const key of Object.keys(want)) diff(drive, key, lists[key], want[key]);
    // Each listed student against their master data row.
    const check = (key, ok, what) => { for (const id of lists[key] ?? []) { const r = master(id); if (!r) fail(drive, `${name(id)} is in ${key} but not in master data`); else if (!ok(r)) fail(drive, `${name(id)} in ${key}, but master data ${what}: ${JSON.stringify(r)}`); } };
    check("offers", (r) => num(r.offers) > 0, "shows no offer");
    check("offersWaiting", (r) => /waiting/.test(r.offerReplies), "shows no offer waiting");
    check("hired", (r) => r.hired === "Yes", "says not hired");
    check("internships", (r) => r.hired === "Yes", "says not hired");
    check("fullTime", (r) => r.hired === "Yes" && r.ppo === "Yes", "says no full-time hire");
    check("meetings", (r) => /accepted/.test(r.driveCalls), "shows no accepted drive meet");
    check("meetingsWaiting", (r) => /waiting/.test(r.driveCalls), "shows no drive meet waiting");
    check("called", (r) => r.driveCalls !== "", "shows no drive meet");
    for (const key of Object.keys(lists)) for (const id of lists[key]) if (!eligible.has(id)) fail(drive, `${name(id)} is listed in ${key} but is not in the drive by master data`);
  }
  summary.push(`${drive.title} (${boardOpen ? "open" : "over"}): in drive ${eligible.size} · asked to meet ${want.called.size} · offered ${want.offers.size} (${offers.length} offers) · waiting ${want.offersWaiting.size} · hired ${want.hired.size} · meets accepted ${want.meetings.size} · meets waiting ${want.meetingsWaiting.size}`);
}

await browser.close();
await db.end();
console.log(summary.map((s) => `[drives] ${s}`).join("\n"));
if (failures.length) {
  console.log(`[drives] FAIL ${failures.length}\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("[drives] PASS: every drive figure and list matches master data and the tables");
