// Part A (ENTRY) of the data-sync oracle: creates fresh data through the real UI/API on a scratch DB and writes a ledger of
// every value typed / action done (LEDGER=path). Then Part B/C run on it (sync-verify.mjs).
//   BASE=http://localhost:3338 DATABASE_URL=postgresql://findtern@127.0.0.1:55490/findtern_ca_entry LEDGER=ledger.json node --experimental-strip-types e2e/college-audit/sync-enter.mjs
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { openRoles, closeAll } from "/home/wynautbhav/hermes-team/artifacts/findtern-college-audit/tools/ctx.mjs";
import { businessStartDate } from "../lib/start-date.mjs";
import { deflateSync, crc32 } from "node:zlib";
import { q, session, BASE, PASSWORD, closeDb } from "./sync-lib.mjs";

const LEDGER = process.env.LEDGER ?? "sync-ledger.json";
const TAG = process.env.TAG ?? Math.random().toString(36).slice(2, 6);
const led = { baseUrl: BASE, startedAt: new Date().toISOString(), tag: TAG, colleges: [], employers: [], interns: [], actions: [], staged: [] };
let seq = 0;
const act = (kind, actor, target, expected, r, extra = {}) => { const a = { seq: ++seq, kind, actor, target, expected, httpStatus: r?.status ?? null, ok: r ? r.status >= 200 && r.status < 300 : true, ...extra }; if (r && !a.ok) a.body = (r.text ?? "").slice(0, 200); led.actions.push(a); console.log(`${a.ok ? "ok " : "REFUSED"} #${a.seq} ${kind} ${actor}->${target} ${a.httpStatus ?? ""} ${a.ok ? "" : a.body}`); return a; };
const mailFile = () => `${process.cwd()}/logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const otpFor = (email) => { const t = existsSync(mailFile()) ? readFileSync(mailFile(), "utf8") : ""; const b = t.split(/\n--- /).filter((x) => x.includes(`To: ${email}`)).at(-1) ?? ""; const m = b.match(/\b(\d{6})\b/); if (!m) throw new Error("no otp " + email); return m[1]; };
const save = () => writeFileSync(LEDGER, JSON.stringify(led, null, 1));
const jar = (ctx) => async (method, path, data) => { const c = (await ctx.cookies()).find((x) => x.name === "ft_csrf")?.value ?? ""; const r = await ctx.request.fetch(BASE + path, { method, headers: { "x-csrf-token": c, "content-type": "application/json", origin: BASE }, data: data === undefined ? undefined : JSON.stringify(data), maxRedirects: 0 }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ } return { status: r.status(), json, text }; };

const png = (size, rgb) => { const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]); const raw = Buffer.concat(Array.from({ length: size }, () => row)); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, c]); }; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
// ---------------------------------------------------------------- the 10 interns
const P = (n) => `98${TAG.replace(/\D/g, "").padEnd(2, "7").slice(0, 2)}${String(5100 + n).padStart(6, "0")}`.slice(0, 10);
const DEF = [
  { f: "Ananya", l: "Iyer", dom: "synctest.edu.in", branch: "CSE", sem: 5, cgpa: "8.3", skills: ["React", "SQL"], mode: "remote", laptop: true, city: "Jaipur", state: "Rajasthan", year: 3 },
  { f: "Zoë", l: "Müller", dom: "synctest.edu.in", branch: "ECE", sem: 7, cgpa: "7", skills: ["Python", "SQL", "Pandas"], mode: "hybrid", laptop: false, city: "Pune", state: "Maharashtra", year: 4 },
  { f: "Priya", l: "Ranganathan-Śarma", dom: "synctest.edu.in", branch: "AI & DS", sem: 3, cgpa: "9.125", skills: ["Node.js"], mode: "onsite", laptop: true, city: "Chennai", state: "Tamil Nadu", year: 2 },
  { f: "Rohan", l: "D'Souza", dom: "synctest.edu.in", branch: "ME", sem: 0, cgpa: "6.5", skills: ["React", "TypeScript"], mode: "remote", laptop: true, city: "Goa", state: "Goa", year: 4 },
  { f: "Ishaan", l: "Khandelwal", dom: "synctest.edu.in", branch: "CSE", sem: 1, cgpa: "8.55", skills: ["SQL"], mode: "remote", laptop: false, city: "Jaipur", state: "Rajasthan", year: 1 },
  { f: "Meera", l: "Nair", dom: "synctest.edu.in", branch: "BBA", sem: 6, cgpa: "7.449", skills: ["React"], mode: "hybrid", laptop: true, city: "Kochi", state: "Kerala", year: 3 },
  { f: "Aditya", l: "Verma", dom: "synctest.edu.in", branch: "CSE", sem: 8, cgpa: "9.99", skills: ["Python"], mode: "remote", laptop: true, city: "Delhi", state: "Delhi", year: 4 },
  { f: "Sana", l: "Qureshi", dom: "gmail.com", branch: "CSE", sem: 4, cgpa: "8", skills: ["SQL", "Python"], mode: "remote", laptop: true, city: "Lucknow", state: "Uttar Pradesh", year: 2 },
  { f: "Tarun", l: "Bose", dom: "gmail.com", branch: "ECE", sem: 6, cgpa: "6.75", skills: ["React"], mode: "hybrid", laptop: false, city: "Kolkata", state: "West Bengal", year: 3 },
  { f: "Lakshmi", l: "Pillai", dom: "gmail.com", branch: "ME", sem: 2, cgpa: "7.1", skills: ["Node.js", "SQL"], mode: "onsite", laptop: true, city: "Kochi", state: "Kerala", year: 1 },
].map((d, i) => ({ ...d, n: i, email: `${d.f.normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}.${TAG}${i}@${d.dom}`, phone: P(i), pw: "Sync@2026x" }));

const admin = await session("admin", "admin@findtern.dev");
// 1) new college + TPO through the admin API
let r = await admin.post("/api/admin/colleges", { name: `Sync Test Institute ${TAG}`, city: "Jaipur", state: "Rajasthan", emailDomains: ["synctest.edu.in"], isPartner: true });
act("college.create", "admin", `Sync Test Institute ${TAG}`, "201 + id", r);
const newCollegeId = r.json?.id; const newCollege = await q("select id, code, name from colleges where id=$1", [newCollegeId]).then((x) => x[0]);
r = await admin.post(`/api/admin/colleges/${newCollegeId}/seat-batches`, { seats: 10 });
act("college.seats.buy", "admin", "10 seats", "200 + 944x10 = 9440.00 incl GST", r);
const batchId = r.json?.id;
r = await admin.patch(`/api/admin/colleges/${newCollegeId}/seat-batches/${batchId}`, { action: "paid", method: "bank", referenceId: `SYNC-${TAG}` });
act("college.seats.paid", "admin", batchId, "200 + invoice serial", r);
r = await admin.post(`/api/admin/colleges/${newCollegeId}/admins`, { name: "Sync TPO", email: `tpo.${TAG}@synctest.edu.in` });
act("college.tpo.create", "admin", `tpo.${TAG}@synctest.edu.in`, "201 + temp password", r);
const tpoPw = r.json?.tempPassword ?? r.json?.password ?? r.json?.temporaryPassword;
led.colleges.push({ name: newCollege.name, code: newCollege.code, id: newCollegeId, tpoEmail: `tpo.${TAG}@synctest.edu.in`, tpoPasswordGiven: !!tpoPw });
const jklu = (await q("select id, code from colleges where name like 'JK Lak%'"))[0];
save();

// 2) interns: real UI signup, onboarding API, join by code
const { browser, ctxs } = await openRoles(["employer"], { base: BASE });
const ictx = [];
for (const d of DEF) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { "x-forwarded-for": `10.66.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}` } });
  const sp = await ctx.newPage();
  await sp.goto(BASE + "/signup", { waitUntil: "load" });
  await sp.getByLabel("First name").fill(d.f); await sp.getByLabel("Last name").fill(d.l);
  await sp.getByLabel("Email", { exact: true }).fill(d.email); await sp.locator("#phoneNumber").fill(d.phone);
  await sp.locator("#password").fill(d.pw); await sp.getByRole("checkbox").last().check();
  await sp.getByRole("button", { name: "Send verification code" }).click();
  await sp.locator("#otp").waitFor({ timeout: 20000 }); await sp.waitForTimeout(800);
  await sp.locator("#otp").fill(otpFor(d.email));
  await sp.getByRole("button", { name: /Verify code|Create account/ }).click();
  await sp.waitForURL(/\/intern\//, { timeout: 30000 });
  const u = (await q("select id, first_name, last_name, email, phone_number, country_code from users where email=$1", [d.email]))[0];
  d.id = u?.id; d.ctx = ctx; ictx.push(ctx);
  const api = jar(ctx);
  const academics = { institution: d.dom === "synctest.edu.in" ? newCollege.name : "Some Other College", degree: "B.Tech / B.E.", branch: d.branch, yearOfGraduation: String(2030 - d.year), scoreType: "cgpa", cgpa: d.cgpa, status: "Pursuing", currentSemester: d.sem };
  if (d.sem === 0) { const pr = await ctx.request.fetch(BASE + "/api/uploads", { method: "POST", headers: { origin: BASE, "x-csrf-token": (await ctx.cookies()).find((x) => x.name === "ft_csrf")?.value ?? "", "content-type": "image/png", "x-document-kind": "certificate", "x-file-name": encodeURIComponent("last-year.png") }, data: png(48, [20, 100, 160]) }); const pj = await pr.json().catch(() => ({})); academics.semesterProofUploads = { "last-year-marksheet": { name: pj.key, originalName: "last-year.png", type: pj.contentType, size: pj.bytes } }; act("upload.proof", d.email, "last-year marksheet", "201", { status: pr.status() }); }
  r = await api("POST", "/api/intern/onboarding", { academics, skills: d.skills, city: d.city, state: d.state, hasLaptop: d.laptop, locationTypes: [d.mode], preferredLocations: [d.city] });
  act("intern.signup+onboarding", d.email, d.email, "200", r, { userId: d.id, uiSignupRowStored: u?.first_name === d.f && u?.last_name === d.l && u?.phone_number === d.phone });
  led.interns.push({ tag: TAG, email: d.email, phone: d.phone, firstName: d.f, lastName: d.l, id: d.id, typed: { branch: d.branch, year: d.year, semester: d.sem, cgpa: d.cgpa, skills: d.skills, workMode: d.mode, city: d.city, state: d.state, laptop: d.laptop, emailKind: d.dom === "gmail.com" ? "personal" : "college" }, expected: {} });
  await sp.close(); save();
}
// stage what the UI cannot do (external AI interview, interview fee, ID docs): copy the finished profile of a seeded student but keep every typed value
const model = (await q("select extra_data, skills, location_types, preferred_locations, has_laptop, pin_code, experience_json, bio, o.user_id from intern_onboarding o join users x on x.id=o.user_id where x.email like 'aarav.sharma1@%'"))[0];
for (const d of DEF.filter((x) => led.actions.find((a) => a.userId === x.id && a.ok))) {
  const mine = (await q("select extra_data->'academics' a, skills, city, state, has_laptop, location_types, preferred_locations from intern_onboarding where user_id=$1", [d.id]))[0];
  await q(`update intern_onboarding o set extra_data = $2::jsonb || jsonb_build_object('academics', $3::jsonb, 'accountType', coalesce(o.extra_data->>'accountType','individual'), 'findternScore', $4::numeric, 'ratings', jsonb_build_object('coding', 6.1, 'aptitude', 8.2, 'interview', 7.4, 'communication', 4.3)), pin_code=$5, experience_json=$6::jsonb, bio=$7, aadhaar_number='8889' || lpad((floor(random()*99999999))::text, 8, '0'), pan_number='SYNCK' || lpad((floor(random()*9999))::text, 4, '0') || 'Q' where o.user_id=$1`, [d.id, JSON.stringify(model.extra_data), JSON.stringify(mine.a), 6 + d.n / 10, model.pin_code, JSON.stringify(model.experience_json), model.bio]);
  await q("update users set profile_visibility='live' where id=$1", [d.id]);
  const doc = (await q("select d.* from intern_document d where d.user_id=$1 limit 1", [model.user_id]))[0];
  if (doc) { const cols = Object.keys(doc).filter((k) => k !== "id"); await q(`insert into intern_document (${cols.join(",")}) values (${cols.map((_, i) => "$" + (i + 1)).join(",")})`, cols.map((k) => (k === "user_id" ? d.id : doc[k] && typeof doc[k] === "object" && !(doc[k] instanceof Date) ? JSON.stringify(doc[k]) : doc[k]))); }
  led.staged.push({ who: d.email, what: "AI ratings, findternScore, interview payment flag, approval, ID docs, profile-complete keys copied from a seeded profile (UI needs external AI/payment); typed academics/skills/city/laptop/work mode restored after staging" });
}
// ---- join by code (7 college-email interns -> new college; 3 gmail -> JKLU; one wrong code; one wrong-domain)
for (const d of DEF.filter((x) => led.actions.find((a) => a.userId === x.id && a.ok))) {
  const api = jar(d.ctx);
  const code = d.dom === "synctest.edu.in" ? newCollege.code : jklu.code;
  if (d.n === 6) { r = await api("POST", "/api/intern/college", { code: "ZZZZ9999", year: d.year, branch: d.branch, declaredAdult: true }); act("join.wrong-code", d.email, "ZZZZ9999", "refused 4xx", r, { expectedRefusal: true }); }
  r = await api("POST", "/api/intern/college", { code, year: d.year, branch: d.branch, declaredAdult: true });
  act("join.by-code", d.email, d.dom === "synctest.edu.in" ? newCollege.code : "JKLU code", "200; college-domain -> verified, personal -> waiting approval", r);
  save();
}
const mem = await q("select u.email, m.status, m.verified_by, m.year, m.branch from college_memberships m join users u on u.id = m.user_id where u.email like $1 order by u.email", [`%.${TAG}%`]);
led.membershipsAfterJoin = mem;

// ---- TPO: approve / deny the waiting ones
let tpo = null;
if (tpoPw) { try { tpo = await session("college", `tpo.${TAG}@synctest.edu.in`, tpoPw); } catch (e) { act("tpo.login", "tpo", "new college", "200", { status: 0, text: e.message }); } }
const waiting = await q("select m.id, u.email, m.college_id from college_memberships m join users u on u.id=m.user_id where m.status<>'verified' and m.left_at is null and u.email like $1", [`%.${TAG}%`]);
led.waitingAfterJoin = waiting.map((w) => w.email);
save();
const out = { led, DEF, newCollege, jklu, tpoPw, ctxs, browser, ictx, waiting };
export default out;
console.log(`entered: ${led.interns.length} interns, college ${newCollege.code}, waiting ${waiting.length}`);
await closeAll(browser); await closeDb();
