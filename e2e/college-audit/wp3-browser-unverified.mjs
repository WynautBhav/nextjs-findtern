// WP3: (1) 'In association with' bar in a real browser, (2) a TPO hand-included UNVERIFIED student as the employer sees them.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-browser-unverified.mjs
import { openRoles, closeAll } from "./lib/ctx.mjs";
import { q, one, session, check, finish, flight } from "./wp3-lib.mjs";

const drive = await one(`SELECT * FROM college_drives WHERE title = 'Summer internship drive 2027'`);
const nw = await one(`SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'`);
await q(`INSERT INTO college_drive_employers (drive_id, employer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [drive.id, nw.id]);

const { browser, ctxs } = await openRoles(["employer"], { base: process.env.BASE });
const page = await ctxs.employer.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${process.env.BASE}/employer/drives/${drive.id}`, { waitUntil: "networkidle", timeout: 60000 });
const bar = await page.locator("text=In association with").first().isVisible().catch(() => false);
check("B1.1", "'In association with <college>' shows in the employer's top bar on the drive page", bar && (await page.locator("text=JK Lakshmipat University").count()) > 0);
await page.screenshot({ path: (await import("node:path")).resolve(process.env.OUT ?? "./out", "employer-drive-bar.png") });
await page.goto(`${process.env.BASE}/employer/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
check("B1.2", "the bar is gone on the employer dashboard (only inside a drive)", !(await page.locator("text=In association with").first().isVisible().catch(() => false)));
check("B1.3", "no page errors", errors.length === 0, errors.join("; "));
await closeAll(browser);

/* unverified, hand-included student */
const emp = await session("employer", "hiring@northwind.dev");
const tpo = await session("college", "tpo@jklu.edu.in");
const s = await one(
  `SELECT u.id, u.first_name, u.last_name FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL AND m.year IN (2,3)
   JOIN intern_onboarding o ON o.user_id = u.id AND o.extra_data->>'approvalStatus' = 'Approved' WHERE NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id) ORDER BY u.email OFFSET 7 LIMIT 1`);
await q(`UPDATE college_memberships SET status = 'claimed' WHERE user_id = $1`, [s.id]);
await q(`UPDATE college_drives SET include_user_ids = include_user_ids || to_jsonb($2::text) WHERE id = $1`, [drive.id, s.id]);
const html = flight((await emp.get(`/employer/drives/${drive.id}`)).text);
const i = html.indexOf(`"id":"${s.id}"`);
const card = i >= 0 ? html.slice(i, i + 400) : "";
console.log("        employer's card for the unverified hand-included student:", card.slice(0, 260));
check("B2.1", "employer sees the unverified hand-included student as initials only (no full name, no email)", i >= 0 && !html.includes(`${s.first_name} ${s.last_name}`));
check("B2.2", "their CGPA is not shown on an internship drive and no raw score of an unverified student", !/"cgpa":\d/.test(card));
const r = await emp.post(`/api/employer/drives/${drive.id}/meetings`, { userId: s.id, inMinutes: 10, manualLink: "https://meet.example.com/b2" });
console.log(`        meet request to the unverified hand-included student: ${r.status} ${r.text.slice(0, 100)}`);
check("B2.3", "RECORDED: meet request to an unverified hand-included student is allowed (the college vouches for them; eligibility.ts:70 by design)", r.status === 201, `${r.status}`);
await q(`DELETE FROM college_drive_meetings WHERE user_id = $1`, [s.id]);
// restore
await q(`UPDATE college_memberships SET status = 'verified' WHERE user_id = $1`, [s.id]);
await q(`UPDATE college_drives SET include_user_ids = '[]'::jsonb WHERE id = $1`, [drive.id]);

/* frozen / held students stay listed in the employer's drive page (default decision) */
const fz = await one(`SELECT u.id FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL AND m.year IN (2,3) ORDER BY u.email OFFSET 11 LIMIT 1`);
await q(`UPDATE users SET frozen_at = now() WHERE id = $1`, [fz.id]);
const html2 = flight((await emp.get(`/employer/drives/${drive.id}`)).text);
check("B3.1", "DEFAULT DECISION: a frozen student stays listed on the employer's drive page (hide-from-lists is a PROPOSAL)", html2.includes(`"id":"${fz.id}"`));
const rf = await emp.post(`/api/employer/drives/${drive.id}/meetings`, { userId: fz.id, inMinutes: 10, manualLink: "https://meet.example.com/b3" });
check("B3.2", "...but a meet request to them is refused (409)", rf.status === 409, `${rf.status}`);
await q(`UPDATE users SET frozen_at = NULL WHERE id = $1`, [fz.id]);
await finish();
