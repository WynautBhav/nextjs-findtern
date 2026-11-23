// WP3: freeze/hold in drive meet requests (P1), unverified hand-included student on the TPO drive board (P3),
// drive turned off in the middle of a meet (X3). Acts through the real HTTP API of a running build on a findtern_ca_* DB.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-p1-p3-x3.mjs
import { BASE, db, q, one, session, check, finish, flight } from "./wp3-lib.mjs";

const drive = await one(`SELECT * FROM college_drives WHERE title = 'Summer internship drive 2027'`);
const nw = await one(`SELECT id FROM employers WHERE email = 'hiring@northwind.dev'`).catch(() => null) ?? await one(`SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'`);
const emp = await session("employer", "hiring@northwind.dev");
const tpo = await session("college", "tpo@jklu.edu.in");
const LINK = "https://meet.example.com/wp3-audit";
const ask = (userId, drv = drive.id, who = emp) => who.post(`/api/employer/drives/${drv}/meetings`, { userId, inMinutes: 10, manualLink: LINK });
const wipeMeetings = () => q(`DELETE FROM college_drive_meetings WHERE drive_id = $1`, [drive.id]);
await wipeMeetings();

const pickFree = (extra = "") => one(
  `SELECT u.id, u.email FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL
   JOIN intern_onboarding o ON o.user_id = u.id AND o.extra_data->>'approvalStatus' = 'Approved'
   WHERE m.year IN (2,3) AND u.frozen_at IS NULL AND u.is_active AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id) ${extra}
   ORDER BY u.email LIMIT 1`);

/* ── A: P1 freeze / hold / inactive ── */
const s1 = await pickFree();
let r = await ask(s1.id);
check("P1.0", "control: a free pool student gets a meet request (201)", r.status === 201, `${r.status} ${r.text.slice(0, 160)}`);
await wipeMeetings();

await q(`UPDATE users SET frozen_at = now() WHERE id = $1`, [s1.id]);
r = await ask(s1.id);
check("P1.1", "frozen student: meet request refused (409), same as the full-time offer", r.status === 409, `${r.status} ${r.text.slice(0, 160)}`);
const frozenRows = await q(`SELECT 1 FROM college_drive_meetings WHERE user_id = $1`, [s1.id]);
check("P1.1b", "frozen student: no meeting row was created", frozenRows.length === 0);
await q(`UPDATE users SET frozen_at = NULL WHERE id = $1`, [s1.id]);
await wipeMeetings();

const s2 = await one(
  `SELECT u.id FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL
   JOIN proposals p ON p.intern_id = u.id AND p.status = 'hired' AND p.employer_id <> $1 AND p.offer_details->>'duration' = '6m'
   WHERE m.year IN (2,3) ORDER BY u.email LIMIT 1`, [nw.id]);
r = await ask(s2.id);
check("P1.2", "student held by another company's running hire: meet request refused (409 candidate_unavailable)", r.status === 409 && r.json?.code === "candidate_unavailable", `${r.status} ${r.text.slice(0, 160)}`);
await wipeMeetings();

await q(`UPDATE users SET is_active = false WHERE id = $1`, [s1.id]);
r = await ask(s1.id);
check("P1.3", "deactivated account: meet request refused (409, the same as on hold; R4-02)", r.status === 409, `${r.status} ${r.text.slice(0, 160)}`);
await q(`UPDATE users SET is_active = true WHERE id = $1`, [s1.id]);
await wipeMeetings();

/* ── B: P3 unverified hand-included student on the TPO drive board ── */
const s3 = await one(
  `SELECT u.id, u.first_name, u.last_name FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL
   JOIN proposals p ON p.intern_id = u.id AND p.status = 'sent' AND p.created_at >= $1 AND NOT (p.offer_details ? 'fullTimeOffer')
   JOIN college_drive_employers de ON de.drive_id = $2 AND de.employer_id = p.employer_id
   WHERE m.year IN (2,3) ORDER BY u.email LIMIT 1`, [drive.starts_at, drive.id]);
await q(`UPDATE college_memberships SET status = 'claimed' WHERE user_id = $1`, [s3.id]);
await q(`INSERT INTO college_drive_meetings (drive_id, employer_id, user_id, starts_at, status, meeting_link) VALUES ($1,$2,$3, now() AT TIME ZONE 'UTC' + interval '5 minutes','requested',$4)`, [drive.id, nw.id, s3.id, LINK]);
await q(`UPDATE college_drives SET include_user_ids = include_user_ids || to_jsonb($2::text) WHERE id = $1`, [drive.id, s3.id]);
await q(`INSERT INTO college_presence (user_id, college_id, last_seen_at) VALUES ($1,$2, now() AT TIME ZONE 'UTC') ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now() AT TIME ZONE 'UTC'`, [s3.id, drive.college_id]);
const page = await tpo.get(`/college/drives/${drive.id}`);
const f = flight(page.text);
const mine = (re) => new RegExp(`"userId":"${s3.id}"[^{}]*?${re}`).test(f);
check("P3.0", "page loads", page.status === 200, String(page.status));
check("P3.1", "unverified student appears with name/roll/year/branch only (control: the row exists)", mine(`"rollNo"`), "student row missing from payload");
check("P3.2", "unverified student carries no offer/meeting detail on the drive board", !mine(`"detail":"[^"]*(Offer from|asked for a meet|meet request|offer)`), "board item with a detail for the unverified student");
check("P3.3", "unverified student's last-seen is not in the payload", !mine(`"lastSeenAt":"\\d`), "lastSeenAt present for an unverified student");
check("P3.4", "unverified student's score / offers / calls counters are zero or null", !mine(`"offersPending":[1-9]`) && !mine(`"score":\\d`), "progress counters leaked");
await q(`UPDATE college_memberships SET status = 'verified' WHERE user_id = $1`, [s3.id]);
await q(`UPDATE college_drives SET include_user_ids = '[]'::jsonb WHERE id = $1`, [drive.id]);
await wipeMeetings();

/* ── C: X3 drive turned off in the middle of a meet ── */
const stu = await session("intern", s1.email);
const emp2 = await session("employer", "talent@meridian.dev");
const m1 = (await ask(s1.id)).json?.meeting;
const s4 = await pickFree(`AND u.id <> '${s1.id}'`);
const stu4 = await session("intern", s4.email);
const m2 = (await ask(s4.id, drive.id, emp2)).json?.meeting;
const acc = await stu4.post(`/api/intern/college/meetings/${m2.id}`, { action: "accept" });
check("X3.0", "setup: one open request and one accepted call", Boolean(m1) && acc.status === 200, `${acc.status} ${acc.text.slice(0, 120)}`);
const off = await tpo.del(`/api/college/drives/${drive.id}/link`);
check("X3.1", "TPO turns the drive off (200)", off.status === 200, `${off.status}`);
const rows = await q(`SELECT id, status FROM college_drive_meetings WHERE id = ANY($1)`, [[m1.id, m2.id]]);
check("X3.2", "open request and accepted call are both cancelled in the DB", rows.length === 2 && rows.every((x) => x.status === "cancelled"), JSON.stringify(rows));
r = await stu.post(`/api/intern/college/meetings/${m1.id}`, { action: "accept" });
check("X3.3", "student accepting the open request after the revoke gets 409", r.status === 409, `${r.status} ${r.text.slice(0, 120)}`);
r = await ask(s1.id);
check("X3.4", "employer cannot make a new request in the revoked drive (403)", r.status === 403, `${r.status} ${r.text.slice(0, 120)}`);
const empPage = await emp.get(`/employer/drives/${drive.id}`);
check("X3.5", "employer drive page says the college closed the drive", /closed this drive/.test(empPage.text), "text not found");
const empMeets = await emp.get(`/api/employer/drives/${drive.id}/meetings`);
check("X3.6a", "employer request list of a revoked drive is closed to them (403)", empMeets.status === 403, String(empMeets.status));

const tpoPage = flight((await tpo.get(`/college/drives/${drive.id}`)).text);
check("X3.7", "TPO's revoked drive page has no student lists (C12)", !/"detail":"[^"]*(asked for a meet|Offer from)/.test(tpoPage), "student list detail present on a closed drive");
const list = await tpo.get(`/college/drives`);
check("X3.8", "TPO drives list loads", list.status === 200);
// restore: new link reopens the drive
const re = await tpo.post(`/api/college/drives/${drive.id}/link`);
check("X3.9", "reissuing the link reopens the drive (200)", re.status === 200 && Boolean(re.json?.url), `${re.status}`);
await wipeMeetings();

await finish();
