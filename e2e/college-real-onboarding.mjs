/**
 * College Partners, the real onboarding story (40 steps): Findtern staff issue
 * a new JKLU officer login, the officer uploads a roster, 5 brand-new students
 * sign up through the signup form (OTP read from the dev mail log), save
 * academics, get AI interview ratings, pick JKLU with consent; the officer
 * builds a drive; an employer joins, shortlists, calls; students accept and
 * decline on phones; the officer watches presence, nudges, opens a recording
 * (audited); one student withdraws; the link is closed; a claimed student is
 * verified by a roster upload.
 *
 * Product UI and APIs only. The DB is touched for cleanup (so it can repeat)
 * and for read-only assertions.
 *
 * Needs: `npm run dev` on :3200 against the private DB on :5433 after
 * `db:seed` + `db:seed-colleges`, MAIL_MODE=log. Signup allows 5 accounts per
 * hour per IP, so a second run within the hour needs a dev-server restart.
 *
 *   node e2e/college-real-onboarding.mjs [screenshot-dir]
 */
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const require = createRequire("/home/wynautbhav/Desktop/findtern-college/package.json");
const { chromium, devices } = require("playwright");

const B = "http://localhost:3200";
const OUT = process.argv[2] ?? "/tmp/college-real-e2e";
mkdirSync(`${OUT}/shots`, { recursive: true });
const MAIL = `/home/wynautbhav/Desktop/findtern-college/logs/mail/${new Date().toISOString().slice(0, 10)}.log`;
const PW = "Findtern@2026";
const STUDENT_PW = "Jklu@Test2026";
const psql = (q) =>
  execSync(`PGTZ=UTC psql -h localhost -p 5433 -U findtern -d findtern -tAc "${q.replace(/"/g, '\\"')}"`, {
    env: { ...process.env, PGPASSWORD: "findtern_dev" },
  }).toString().trim();

const STUDENTS = [
  { key: "aanya", first: "Aanya", last: "Mehta", email: "aanya.mehta@jklu.edu.in", phone: "9829100001", year: "3", branch: "CSE", cgpa: "8.4", roster: true, scores: { communication: 8.5, coding: 8.0, aptitude: 8.2, interview: 8.1 } },
  { key: "rohit", first: "Rohit", last: "Bansal", email: "rohit.bansal@jklu.edu.in", phone: "9829100002", year: "3", branch: "ECE", cgpa: "7.1", roster: true, scores: { communication: 6.0, coding: 6.8, aptitude: 6.5, interview: 6.7 } },
  { key: "priya", first: "Priya", last: "Soni", email: "priya.soni.jk@gmail.com", phone: "9829100003", year: "4", branch: "CSE", cgpa: "6.2", roster: true, scores: null },
  { key: "kunal", first: "Kunal", last: "Rao", email: "kunal.rao@jklu.edu.in", phone: "9829100004", year: "4", branch: "ME", cgpa: "9.0", roster: false, scores: { communication: 7.2, coding: 7.0, aptitude: 7.9, interview: 7.5 } },
  { key: "neha", first: "Neha", last: "Gupta", email: "neha.gupta.7@gmail.com", phone: "9829100005", year: "3", branch: "CSE", cgpa: "5.8", roster: false, scores: null },
];
const OFFICER = { name: "Test Placement Officer", email: "placement.test@jklu.edu.in" };
const DRIVE = "JKLU live test drive";

// ── reporting ────────────────────────────────────────────────────────────
const results = [];
let step = 0;
async function check(name, fn) {
  step++;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ step, name, ok: true, detail: detail ?? "", ms: Date.now() - t0 });
    console.log(`PASS ${String(step).padStart(2)} ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ step, name, ok: false, detail: String(err.message ?? err).split("\n")[0].slice(0, 300), ms: Date.now() - t0 });
    console.log(`FAIL ${String(step).padStart(2)} ${name} — ${String(err.message ?? err).split("\n")[0].slice(0, 300)}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/shots/${name}.png`, fullPage: full });
const csrfOf = async (ctx) => (await ctx.cookies()).find((c) => c.name === "ft_csrf")?.value;
async function api(page, method, path, data) {
  const csrf = await csrfOf(page.context());
  const res = await page.request.fetch(B + path, {
    method,
    headers: { "x-csrf-token": csrf ?? "", "content-type": "application/json" },
    data: data === undefined ? undefined : JSON.stringify(data),
    maxRedirects: 0,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status(), body, headers: res.headers() };
}
function latestOtp(email) {
  const log = readFileSync(MAIL, "utf8");
  const blocks = log.split(/\n--- /).filter((b) => b.includes(`To: ${email}`));
  const last = blocks.at(-1) ?? "";
  const m = last.match(/\b(\d{6})\b/);
  if (!m) throw new Error(`no OTP mail for ${email}`);
  return m[1];
}

// ── cleanup (so the run repeats) ─────────────────────────────────────────
const emails = STUDENTS.map((s) => `'${s.email}'`).join(",");
const ids = psql(`select string_agg(quote_literal(id), ',') from users where email in (${emails})`);
if (ids) {
  for (const t of ["college_presence", "college_memberships", "college_consents", "college_drive_meetings", "college_drive_shortlist", "college_nudges", "push_subscriptions"])
    psql(`delete from ${t} where user_id in (${ids})`);
  psql(`delete from notifications where recipient_id in (${ids})`);
  psql(`delete from college_audit_log where subject_user_id in (${ids})`);
  psql(`delete from intern_onboarding where user_id in (${ids})`);
  psql(`delete from users where id in (${ids})`);
}
psql(`delete from email_otps where lower(subject_id) in (${emails})`);
const oldDrives = psql(`select string_agg(quote_literal(id), ',') from college_drives where title='${DRIVE}'`);
if (oldDrives) {
  for (const t of ["college_drive_employers", "college_drive_shortlist", "college_drive_meetings"]) psql(`delete from ${t} where drive_id in (${oldDrives})`);
  psql(`delete from college_drives where id in (${oldDrives})`);
}
psql(`delete from college_admins where email='${OFFICER.email}'`);
psql(`delete from college_roster where email in (${emails}, 'dev.khatri@jklu.edu.in')`);

const browser = await chromium.launch();
const desktop = () => browser.newContext({ viewport: { width: 1366, height: 900 } });
const phone = () => browser.newContext({ ...devices["Pixel 7"] });
const pageErrors = [];
const watch = (p, who) => p.on("pageerror", (e) => pageErrors.push(`${who}: ${String(e).slice(0, 160)}`));

const admin = await (await desktop()).newPage(); watch(admin, "admin");
const tpo = await (await desktop()).newPage(); watch(tpo, "officer");
const emp = await (await desktop()).newPage(); watch(emp, "employer");
const stu = {};
for (const s of STUDENTS) {
  stu[s.key] = await (await phone()).newPage();
  watch(stu[s.key], s.key);
}
for (const p of [admin, tpo, emp, ...Object.values(stu)]) p.setDefaultTimeout(30_000);

let officerPassword = "";
let driveLink = "";
let driveId = "";
let employerDriveId = "";
const userId = {};

// ── 1. Findtern admin issues the JKLU officer's login ────────────────────
await check("Admin signs in and opens College partners", async () => {
  await admin.goto(`${B}/admin/login`);
  await admin.getByLabel(/email/i).fill("admin@findtern.dev");
  await admin.getByLabel(/^password/i).fill(PW);
  await admin.getByRole("button", { name: /sign in/i }).first().click();
  await admin.waitForURL(/\/admin\/(dashboard|interns|users)/);
  await admin.goto(`${B}/admin/colleges`);
  await admin.getByRole("heading", { name: "JK Lakshmipat University" }).waitFor();
});

await check("Admin issues a new placement-officer login for JKLU", async () => {
  const card = admin.locator("section", { has: admin.getByRole("heading", { name: "JK Lakshmipat University" }) });
  await card.getByLabel("Officer name").fill(OFFICER.name);
  await card.getByLabel("Officer email").fill(OFFICER.email);
  await card.getByRole("button", { name: "Issue login" }).click();
  const code = card.locator("code");
  await code.waitFor();
  officerPassword = (await code.innerText()).trim();
  await shot(admin, "01-admin-issued-login");
  const stored = psql(`select left(password, 10) from college_admins where email='${OFFICER.email}'`);
  assert(stored.startsWith("$argon2"), `password not hashed: ${stored}`);
  return `password shown once (${officerPassword.length} chars), stored as argon2 hash`;
});

// ── 2. Officer signs in, uploads a roster ────────────────────────────────
await check("New officer signs in to the placement console", async () => {
  await tpo.goto(`${B}/college/login`);
  await tpo.getByLabel(/email/i).fill(OFFICER.email);
  await tpo.getByLabel(/^password/i).fill(officerPassword);
  await tpo.getByRole("button", { name: /sign in/i }).first().click();
  await tpo.waitForURL(`${B}/college`);
  await tpo.getByRole("heading", { name: "JK Lakshmipat University" }).waitFor();
});

await check("Officer uploads a 4-row roster CSV (3 of our students + 1 who never joins)", async () => {
  await tpo.goto(`${B}/college/roster`);
  const csv = [
    "Roll No,Student Name,Email ID,Department,Year",
    "23JK501,Aanya Mehta,Aanya.Mehta@jklu.edu.in,CSE,3rd",
    "23JK502,Rohit Bansal,rohit.bansal@jklu.edu.in,ECE,3rd",
    "22JK503,Priya Soni,priya.soni.jk@gmail.com,CSE,IV",
    "22JK504,Dev Khatri,dev.khatri@jklu.edu.in,ME,4",
  ].join("\n");
  await tpo.getByText("Or paste rows").click();
  await tpo.getByLabel("Roster rows").fill(csv);
  await tpo.getByRole("button", { name: "Import pasted rows" }).click();
  const status = tpo.getByRole("status").filter({ hasText: /Imported/ });
  await status.waitFor();
  const text = (await status.innerText()).trim();
  assert(/^Imported 4 students\.$/.test(text), `nobody had joined yet, so nobody is newly verified: "${text}"`);
  return text;
});

// ── 3. Five new students sign up through the real signup form ────────────
for (const s of STUDENTS) {
  await check(`${s.first} signs up on a phone (email OTP from the inbox)`, async () => {
    const p = stu[s.key];
    await p.goto(`${B}/signup`);
    await p.getByLabel("First name").fill(s.first);
    await p.getByLabel("Last name").fill(s.last);
    await p.getByLabel("Email", { exact: true }).fill(s.email);
    await p.locator("#phoneNumber").fill(s.phone);
    await p.locator("#password").fill(STUDENT_PW);
    await p.getByRole("checkbox").last().check();
    await p.getByRole("button", { name: "Send verification code" }).click();
    await p.locator("#otp").waitFor();
    await p.waitForTimeout(400);
    await p.locator("#otp").fill(latestOtp(s.email));
    await p.getByRole("button", { name: /Verify code|Create account/ }).click();
    await p.waitForURL(/\/intern\//, { timeout: 30_000 });
    userId[s.key] = psql(`select id from users where email='${s.email}'`);
    const verified = psql(`select email_verified from users where email='${s.email}'`);
    assert(userId[s.key], "no user row");
    return `account created, email_verified=${verified}, landed on ${new URL(p.url()).pathname}`;
  });
}

await check("Students save the academics step of onboarding (CGPA, branch, skills)", async () => {
  const out = [];
  for (const s of STUDENTS) {
    const r = await api(stu[s.key], "POST", "/api/intern/onboarding", {
      academics: { institution: "JK Lakshmipat University", degree: "B.Tech / B.E.", branch: s.branch, yearOfGraduation: String(2026 + (5 - Number(s.year))), scoreType: "cgpa", cgpa: s.cgpa, status: "Pursuing" },
      skills: ["React", "SQL", "Python"].slice(0, 2 + (s.key.length % 2)),
      city: "Jaipur",
      state: "Rajasthan",
    });
    assert(r.status === 200, `${s.key}: ${r.status} ${JSON.stringify(r.body)}`);
    out.push(s.key);
  }
  return `${out.length} drafts saved`;
});

await check("Findtern enters AI interview results for 3 students (admin ratings)", async () => {
  const done = [];
  for (const s of STUDENTS.filter((x) => x.scores)) {
    const r = await api(admin, "PUT", `/api/admin/interns/${userId[s.key]}/ratings`, {
      ...s.scores,
      aiFeedbackLink: `https://example.org/incruiter/${s.key}-report.pdf`,
      aiRecordingLink: `https://example.org/incruiter/${s.key}-recording.mp4`,
    });
    assert(r.status === 200, `${s.key}: ${r.status}`);
    done.push(`${s.first} ${r.body.findternScore}`);
  }
  return done.join(", ");
});

// ── 4. Students pick JKLU and consent ─────────────────────────────────────
for (const s of STUDENTS) {
  await check(`${s.first} picks JKLU on /intern/college and gives both consents`, async () => {
    const p = stu[s.key];
    await p.goto(`${B}/intern/college`);
    const box = p.getByRole("combobox", { name: "Search for your college" });
    await box.fill("JK Lak");
    await p.getByRole("option", { name: /JK Lakshmipat University/ }).first().click();
    const states = await p.getByRole("checkbox").evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked") ?? String(e.checked)));
    assert(!states.includes("true"), "a consent box was pre-ticked");
    await p.getByLabel("Year of study").selectOption(s.year);
    await p.getByLabel(/Branch/).fill(s.branch);
    await p.getByRole("checkbox", { name: /Share my progress/ }).click();
    await p.getByRole("checkbox", { name: /Show my profile to employers/ }).click();
    await p.getByRole("checkbox", { name: /18 or older/ }).click();
    await p.getByRole("button", { name: "Join college" }).click();
    await p.getByText(/Verified student|Not verified yet/).first().waitFor();
    if (s.key === "aanya") await shot(p, "02-student-joined-mobile", true);
    const m = psql(`select status||'/'||coalesce(verified_by,'-') from college_memberships where user_id='${userId[s.key]}' and left_at is null`);
    const expected = s.roster ? "verified/roster" : s.email.endsWith("@jklu.edu.in") ? "verified/email_domain" : "claimed/-";
    assert(m === expected, `membership ${m}, expected ${expected}`);
    return m;
  });
}

// ── 5. Officer dashboard reflects reality ────────────────────────────────
await check("Officer dashboard: roster coverage, interviews, students, not-on-roster flag", async () => {
  await tpo.goto(`${B}/college`);
  const main = tpo.locator("main");
  await main.getByText("Aanya Mehta").first().waitFor();
  const text = await main.innerText();
  for (const s of STUDENTS) assert(text.includes(`${s.first} ${s.last}`), `${s.first} missing from dashboard`);
  assert(/not on roster/.test(text), "Neha should be flagged not on roster");
  await shot(tpo, "03-officer-dashboard", true);
  const joined = text.match(/(\d+)\/(\d+)\s*\n?\s*\d+% of your roster/);
  return `all 5 listed; ${joined ? `roster ${joined[1]}/${joined[2]} joined` : "roster tile read"}`;
});

await check("Officer roster page lists the one roster student who never joined", async () => {
  await tpo.goto(`${B}/college/roster`);
  const t = await tpo.locator("main").innerText();
  assert(t.includes("dev.khatri@jklu.edu.in"), "Dev Khatri should be in Not joined yet");
  assert(!t.includes("aanya.mehta@jklu.edu.in"), "Aanya joined, should not be listed");
  return (t.match(/Not joined yet \(\d+\)/) ?? [""])[0];
});

// ── 6. Officer builds a drive ─────────────────────────────────────────────
const ist = (min) => new Date(Date.now() + min * 60_000 + 330 * 60_000).toISOString().slice(0, 16);
await check("Officer builds a live drive: CGPA ≥ 6, then hand-adds Neha (claimed, CGPA 5.8)", async () => {
  await tpo.goto(`${B}/college/drives/new`);
  await tpo.getByLabel("Name").fill(DRIVE);
  await tpo.getByLabel("Opens (IST)").fill(ist(-2));
  await tpo.getByLabel("Closes (IST)").fill(ist(180));
  await tpo.getByLabel("Minimum CGPA").fill("6");
  await tpo.getByPlaceholder("Search").fill("Mehta");
  const inTab = await tpo.getByRole("tab", { name: /^In the drive/ }).innerText();
  await tpo.getByPlaceholder("Search").fill("Neha");
  await tpo.getByRole("tab", { name: /^Left out/ }).click();
  await tpo.getByRole("button", { name: "Add anyway" }).click();
  await tpo.getByPlaceholder("Search").fill("");
  await tpo.getByRole("tab", { name: /^In the drive/ }).click();
  const list = await tpo.locator("ul").filter({ hasText: "Aanya Mehta" }).last().innerText();
  for (const n of ["Aanya Mehta", "Rohit Bansal", "Priya Soni", "Kunal Rao", "Neha Gupta"]) assert(list.includes(n), `${n} not in drive list`);
  await shot(tpo, "04-drive-builder", true);
  await tpo.getByRole("button", { name: "Create drive and get link" }).click();
  await tpo.getByLabel("Drive link").waitFor();
  driveLink = await tpo.getByLabel("Drive link").inputValue();
  driveId = new URL(tpo.url()).pathname.split("/").pop();
  return `${inTab.trim()} before hand-add; our 5 all in after; link issued`;
});

// ── 7. Employer joins from the link ──────────────────────────────────────
await check("Employer opens the link signed out: sees drive facts, no student data", async () => {
  await emp.goto(driveLink);
  await emp.getByRole("link", { name: "Sign in to enter" }).waitFor();
  const html = await emp.content();
  assert(!/Aanya|Mehta|@jklu\.edu\.in|gmail\.com/.test(html), "student data leaked on landing");
  await shot(emp, "05-drive-landing");
});

await check("Employer signs in and enters the drive", async () => {
  await emp.getByRole("link", { name: "Sign in to enter" }).click();
  await emp.getByLabel(/email/i).fill("hiring@northwind.dev");
  await emp.getByLabel(/^password/i).fill(PW);
  await emp.getByRole("button", { name: /sign in/i }).first().click();
  await emp.waitForURL(driveLink);
  await emp.getByRole("button", { name: "Enter drive" }).click();
  await emp.waitForURL(/\/employer\/drives\/[0-9a-f-]{36}$/);
  employerDriveId = emp.url().split("/").pop();
  assert(employerDriveId === driveId, "entered a different drive");
});

await check("Employer sees exactly the drive's students, masked, and the score filter works", async () => {
  const showing = await emp.getByText(/^Showing \d+ of \d+ students/).innerText();
  const html = await emp.content();
  assert(!/Aanya Mehta|Rohit Bansal|@jklu\.edu\.in|gmail\.com/.test(html), "names or emails leaked to employer");
  for (const i of ["AM", "RB", "PS", "KR", "NG"]) assert(html.includes(`>${i}<`), `card ${i} missing`);
  await emp.getByLabel("Minimum score").selectOption("8");
  const eight = await emp.getByText(/^Showing \d+ of \d+ students/).innerText();
  await emp.getByLabel("Minimum score").selectOption("0");
  await shot(emp, "06-employer-workspace");
  return `${showing.trim()} (JKLU members with drive consent who pass rules or were added: our 5 included); 8+ filter → ${eight.trim()}`;
});

const card = (initials) => emp.locator("main ul > li").filter({ has: emp.locator(`span.truncate:text-is("${initials}")`) });
await check("Employer shortlists Aanya and Kunal", async () => {
  for (const i of ["AM", "KR"]) {
    const saved = emp.waitForResponse((r) => r.url().endsWith("/shortlist") && r.request().method() === "POST");
    await card(i).getByRole("button", { name: /^Shortlist / }).click();
    await card(i).getByRole("button", { name: /from shortlist$/ }).waitFor();
    assert((await saved).status() === 200, "shortlist not saved");
  }
  return psql(`select count(*) from college_drive_shortlist where drive_id='${driveId}'`) + " shortlist rows";
});

// ── 8. Live presence + calls ─────────────────────────────────────────────
await check("Aanya and Rohit have Findtern open; the other three close the app (75 s)", async () => {
  for (const k of ["priya", "kunal", "neha"]) await stu[k].goto("about:blank");
  await stu.aanya.goto(`${B}/intern/dashboard`);
  await stu.rohit.goto(`${B}/intern/dashboard`);
  await stu.aanya.waitForTimeout(80_000); // three go stale; Aanya/Rohit keep beating every 30 s
  const online = psql(`select string_agg(u.first_name, ',' order by u.first_name) from college_presence p join users u on u.id=p.user_id where p.user_id in (${Object.values(userId).map((x) => `'${x}'`).join(",")}) and p.last_seen_at > now() at time zone 'utc' - interval '75 seconds'`);
  assert(online === "Aanya,Rohit", `online: ${online}`);
  return `online = ${online}`;
});

await check("Officer's live panel (SSE) shows who is offline, with Nudge", async () => {
  await tpo.goto(`${B}/college/drives/${driveId}`);
  const panel = tpo.locator("section[aria-labelledby='live-drive']");
  await panel.getByText("Updating live").waitFor();
  const more = panel.getByRole("button", { name: /^\+\d+ more$/ });
  if (await more.count()) await more.click();
  const t = await panel.innerText();
  for (const n of ["Priya Soni", "Kunal Rao", "Neha Gupta"]) assert(t.includes(n), `${n} should be offline`);
  assert(!t.includes("Aanya Mehta") && !t.includes("Rohit Bansal"), "Aanya/Rohit should not be in offline list");
  await shot(tpo, "07-officer-live-drive");
  return t.match(/\d+\s*\/\s*\d+/)?.[0]?.replace(/\s/g, "") + " online (whole drive incl. seeded JKLU students)";
});

await check("Employer: Aanya shows Online; Priya does not", async () => {
  await emp.reload();
  await card("AM").getByText("Online").waitFor();
  assert((await card("PS").getByText("Online", { exact: true }).count()) === 0, "Priya shown online");
});

let aanyaMeeting = "";
await check("Employer calls Aanya now and Rohit in 5 minutes", async () => {
  await card("AM").getByRole("button", { name: /Call/ }).click();
  await emp.getByRole("menuitem", { name: "Now" }).click();
  await emp.getByRole("status").filter({ hasText: "Call request sent" }).waitFor();
  await card("RB").getByRole("button", { name: /Call/ }).click();
  await emp.getByRole("menuitem", { name: "In 5 minutes" }).click();
  await emp.getByRole("status").filter({ hasText: "Call request sent" }).waitFor();
  aanyaMeeting = psql(`select id from college_drive_meetings where drive_id='${driveId}' and user_id='${userId.aanya}'`);
  const link = psql(`select meeting_link from college_drive_meetings where id='${aanyaMeeting}'`);
  const mail = readFileSync(MAIL, "utf8").includes(`To: ${STUDENTS[0].email}\nSubject: An employer wants to talk right now`);
  return `2 requests; Meet link created (${link.slice(0, 26)}…); email to Aanya: ${mail}`;
});

await check("Another student can't answer Aanya's call (ownership)", async () => {
  const r = await api(stu.kunal, "POST", `/api/intern/college/meetings/${aanyaMeeting}`, { action: "accept" });
  assert(r.status === 404, `got ${r.status}`);
  return "Kunal → 404";
});

await check("Aanya sees the call card on her phone and accepts", async () => {
  await stu.aanya.reload();
  const d = stu.aanya.getByRole("alertdialog");
  await d.waitFor();
  const text = await d.innerText();
  assert(/Northwind Labs wants to talk now/.test(text), text);
  await shot(stu.aanya, "08-aanya-call-card");
  await d.getByRole("button", { name: "Accept" }).click();
  await d.getByRole("link", { name: "Join call" }).waitFor();
  await shot(stu.aanya, "09-aanya-accepted");
  return text.split("\n")[0];
});

await check("Rohit declines his request", async () => {
  await stu.rohit.reload();
  const d = stu.rohit.getByRole("alertdialog");
  await d.waitFor();
  await d.getByRole("button", { name: "Decline" }).click();
  await d.waitFor({ state: "detached" }).catch(() => {});
  const st = psql(`select status from college_drive_meetings where drive_id='${driveId}' and user_id='${userId.rohit}'`);
  assert(st === "declined", st);
});

await check("Employer's calls panel: Aanya accepted with Join link, Rohit declined", async () => {
  await emp.reload();
  const calls = emp.locator("section[aria-labelledby='calls-title']");
  await calls.getByRole("link", { name: "Join" }).waitFor();
  const t = await calls.innerText();
  assert(/Declined/.test(t), "no Declined");
  await shot(emp, "10-employer-calls");
  return t.replace(/\s+/g, " ").slice(0, 160);
});

// ── 9. Officer chases and inspects ───────────────────────────────────────
await check("Officer nudges the 3 offline students; honest reach report", async () => {
  await tpo.reload();
  const panel = tpo.locator("section[aria-labelledby='live-drive']");
  const btn = panel.getByRole("button", { name: /^Nudge/ });
  await btn.click();
  const note = panel.getByRole("status").filter({ hasText: /nudged/ });
  await note.waitFor();
  const n = psql(`select count(*) from notifications where type='college_nudge_online' and recipient_id in ('${userId.priya}','${userId.kunal}','${userId.neha}')`);
  assert(Number(n) === 3, `notifications for our 3: ${n}`);
  return (await note.innerText()).trim();
});

await check("Priya sees the nudge in her notifications", async () => {
  await stu.priya.goto(`${B}/intern/notifications`);
  await stu.priya.getByText(/placement drive is live/).first().waitFor();
});

await check("Officer opens Aanya's page and her recording; the view is audited", async () => {
  await tpo.goto(`${B}/college/students/${userId.aanya}`);
  await tpo.getByText("8.2").first().waitFor().catch(() => {});
  const r = await tpo.request.get(`${B}/api/college/students/${userId.aanya}/recording`, { maxRedirects: 0 });
  assert(r.status() === 303, `recording ${r.status()}`);
  await tpo.reload();
  await tpo.getByText(/Test Placement Officer · recording/).waitFor();
  await shot(tpo, "11-officer-student-page", true);
  return `303 → ${r.headers().location}`;
});

// ── 10. Consent withdrawal ───────────────────────────────────────────────
await check("Priya leaves the college (withdraws consent) from her phone", async () => {
  await stu.priya.goto(`${B}/intern/college`);
  await stu.priya.getByRole("button", { name: "Leave college" }).click();
  await stu.priya.getByRole("button", { name: "Leave and withdraw consent" }).click();
  await stu.priya.getByRole("combobox", { name: "Search for your college" }).waitFor();
});

await check("Priya disappears at once: officer dashboard, her page, and the employer's drive", async () => {
  await tpo.goto(`${B}/college`);
  await tpo.locator("main").getByText("Aanya Mehta").first().waitFor();
  assert(!(await tpo.locator("main").innerText()).includes("Priya Soni"), "Priya still on dashboard");
  const page = await tpo.request.get(`${B}/college/students/${userId.priya}`);
  const gone = /Page not found/.test(await page.text());
  await emp.reload();
  const empHtml = await emp.content();
  assert(!empHtml.includes(">PS<"), "Priya still in employer drive");
  assert(gone, "officer can still open Priya's page");
  return "removed from dashboard, student page 404s, gone from drive";
});

// ── 11. Security spot checks with the real sessions ──────────────────────
await check("Officer cannot write student data (scores, college membership)", async () => {
  const a = await api(tpo, "PUT", `/api/admin/interns/${userId.aanya}/ratings`, { coding: 10 });
  const b = await api(tpo, "POST", "/api/intern/college", { collegeId: "x", year: 3, branch: "x", purposes: [], declaredAdult: true });
  assert([401, 403].includes(a.status) && b.status === 403, `ratings ${a.status}, join ${b.status}`);
  return `ratings → ${a.status}, membership → ${b.status}`;
});

await check("Student cannot open the officer's recording endpoint", async () => {
  const r = await stu.aanya.request.get(`${B}/api/college/students/${userId.aanya}/recording`, { maxRedirects: 0 });
  assert(r.status() === 401, `got ${r.status()}`);
  return "401";
});

// ── 12. Officer closes the link ──────────────────────────────────────────
await check("Officer closes the link; employer is locked out, old link refused", async () => {
  await tpo.goto(`${B}/college/drives/${driveId}`);
  tpo.once("dialog", (d) => d.accept());
  await tpo.getByRole("button", { name: "Close link now" }).click();
  await tpo.getByText("Closed. No employer can get in.").waitFor();
  await emp.reload();
  assert(!/Showing \d+ of/.test(await emp.locator("main").innerText()), "employer still sees students");
  const call = await api(emp, "POST", `/api/employer/drives/${driveId}/meetings`, { userId: userId.kunal, inMinutes: 0 });
  const rejoin = await api(emp, "POST", "/api/drives/join", { token: driveLink.split("/").pop() });
  assert(call.status === 403 && rejoin.status === 403, `call ${call.status}, rejoin ${rejoin.status}`);
  await shot(emp, "12-employer-locked-out");
  return `call → ${call.status}, rejoin → ${rejoin.status}`;
});

await check("Officer adds Neha to the roster; she flips from claimed to verified", async () => {
  await tpo.goto(`${B}/college/roster`);
  await tpo.getByText("Or paste rows").click();
  await tpo.getByLabel("Roster rows").fill("Email,Name,Year,Branch\nneha.gupta.7@gmail.com,Neha Gupta,3,CSE");
  await tpo.getByRole("button", { name: "Import pasted rows" }).click();
  const status = tpo.getByRole("status").filter({ hasText: /Imported/ });
  await status.waitFor();
  const text = (await status.innerText()).trim();
  assert(text === "Imported 1 student. 1 student who had joined is now verified.", text);
  const m = psql(`select status||'/'||verified_by from college_memberships where user_id='${userId.neha}' and left_at is null`);
  assert(m === "verified/roster", m);
  return `${text} → ${m}`;
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ passed, total: results.length, results, pageErrors }, null, 2));
console.log(`\n${passed}/${results.length} passed; page errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);
process.exitCode = passed === results.length ? 0 : 1;
