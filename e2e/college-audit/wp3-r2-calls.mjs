// R2-02 / R1-03 / R3-01 / R3-02 / R3-03: the employer's view of drive calls follows the student's live membership, and Call on a
// student who is no longer available gets one neutral answer. Real HTTP on a 333x production build over a findtern_ca_* DB.
// Every row it edits to stage a case is put back.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-r2-calls.mjs
import { q, one, session, check, finish } from "./wp3-lib.mjs";

const drive = await one(`SELECT * FROM college_drives WHERE title = 'Summer internship drive 2027'`);
const emp = await session("employer", "hiring@northwind.dev");
const employer = await one(`SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'`);
await q(`INSERT INTO college_drive_employers (drive_id, employer_id) SELECT $1::varchar, $2::varchar WHERE NOT EXISTS (SELECT 1 FROM college_drive_employers WHERE drive_id = $1 AND employer_id = $2)`, [drive.id, employer.id]);
const pool = await q(
  `SELECT u.id, u.email, u.first_name, u.last_name FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.college_id = $1 AND m.status = 'verified' AND m.left_at IS NULL
   WHERE u.frozen_at IS NULL AND u.is_active AND NOT ($2::jsonb @> to_jsonb(u.id::text)) AND NOT EXISTS (SELECT 1 FROM college_drive_meetings x WHERE x.user_id = u.id AND x.status IN ('requested','accepted'))
     AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id AND p.status IN ('accepted','processing','hired'))
   ORDER BY u.email LIMIT 12`, [drive.college_id, JSON.stringify(drive.exclude_user_ids)]);
const eligible = [];
for (const s of pool) {
  const r = await emp.post(`/api/employer/drives/${drive.id}/meetings`, { userId: s.id, inMinutes: 10, manualLink: "https://meet.example.com/r2" });
  if (r.status === 200 || r.status === 201) eligible.push({ ...s, meeting: r.json.meeting });
  if (eligible.length === 3) break;
}
if (eligible.length < 3) throw new Error("need 3 callable students in the drive");
const [a, b, c] = eligible;
const mine = async (id) => (await emp.get(`/api/employer/drives/${drive.id}/meetings`)).json?.meetings?.find((x) => x.id === id);
const initials = (s) => `${s.first_name[0]}${s.last_name[0]}`.toUpperCase();
const origDrive = { ex: drive.exclude_user_ids, el: drive.eligibility };
const neutral = (r) => r.json?.error === "This student is no longer available.";
try {
  // A: accepted, then the officer excludes the student / raises the CGPA cutoff: still a member, still accepted on both sides.
  await q(`UPDATE college_drive_meetings SET status = 'accepted', responded_at = now() WHERE id = $1`, [a.meeting.id]);
  await q(`UPDATE college_drives SET exclude_user_ids = $2::jsonb WHERE id = $1`, [drive.id, JSON.stringify([...drive.exclude_user_ids, a.id])]);
  let v = await mine(a.meeting.id);
  check("R2-02.1", "excluded student's accepted call is still accepted for the employer (with link)", v?.status === "accepted" && Boolean(v.meetingLink), JSON.stringify(v));
  check("R2-02.2", "stored row untouched", (await one(`SELECT status FROM college_drive_meetings WHERE id = $1`, [a.meeting.id])).status === "accepted");
  await q(`UPDATE college_drives SET exclude_user_ids = $2::jsonb, eligibility = '{"minCgpa": 10}'::jsonb WHERE id = $1`, [drive.id, JSON.stringify(drive.exclude_user_ids)]);
  v = await mine(a.meeting.id);
  check("R2-02.3", "a raised CGPA cutoff does not make the accepted call look cancelled", v?.status === "accepted", JSON.stringify(v));
  await q(`UPDATE college_drives SET eligibility = $2::jsonb WHERE id = $1`, [drive.id, JSON.stringify(origDrive.el)]);

  // B: the student left the college: cancelled for the employer, initials kept, flagged for the neutral reason.
  await q(`UPDATE college_memberships SET left_at = now() WHERE user_id = $1`, [b.id]);
  v = await mine(b.meeting.id);
  check("R2-02.4", "left student's open call reads cancelled without a link", v?.status === "cancelled" && v.meetingLink === null && v.noLongerInDrive === true, JSON.stringify(v));
  check("R2-02.5", "and keeps the student's initials, never a name", v?.studentLabel === initials(b) && !JSON.stringify(v).includes(b.last_name), JSON.stringify(v));
  const page = await emp.get(`/employer/drives/${drive.id}`);
  check("R2-02.6", "drive page carries no name of the student who left", !page.text.includes(`${b.first_name} ${b.last_name}`));

  // C: Call on students that are no longer available: one neutral message, WP3's status codes.
  const call = (id) => emp.post(`/api/employer/drives/${drive.id}/meetings`, { userId: id, inMinutes: 5, manualLink: "https://meet.example.com/r2c" });
  await q(`UPDATE college_drive_meetings SET status = 'cancelled' WHERE id = $1`, [c.meeting.id]);
  await q(`UPDATE users SET is_active = false WHERE id = $1`, [c.id]);
  let r = await call(c.id);
  check("R3-01.1", "disabled student: 409, the same status and neutral message as on hold / held elsewhere (R4-02)", r.status === 409 && neutral(r), `${r.status} ${r.text}`);
  await q(`UPDATE users SET is_active = true, frozen_at = now() WHERE id = $1`, [c.id]);
  r = await call(c.id);
  check("R3-01.2", "student on hold: 409, the same message, no mention of a hold", r.status === 409 && neutral(r) && !/hold|moderat|review/i.test(r.text), `${r.status} ${r.text}`);
  await q(`UPDATE users SET frozen_at = NULL WHERE id = $1`, [c.id]);
  // Held by another company's running hire (payment in progress): borrow one of their sent offers for a moment (restored below).
  const borrowed = await one(`SELECT id, intern_id, status FROM proposals WHERE employer_id <> $1 AND status = 'sent' AND NOT (offer_details ? 'fullTimeOffer') ORDER BY id LIMIT 1`, [employer.id]);
  await q(`UPDATE proposals SET intern_id = $2, status = 'processing' WHERE id = $1`, [borrowed.id, c.id]);
  try {
    r = await call(c.id);
    check("R3-01.3", "student held by another company: 409, the same message, nothing about the other company", r.status === 409 && neutral(r), `${r.status} ${r.text}`);
  } finally {
    await q(`UPDATE proposals SET intern_id = $2, status = $3 WHERE id = $1`, [borrowed.id, borrowed.intern_id, borrowed.status]);
  }
} finally {
  await q(`UPDATE college_drives SET exclude_user_ids = $2::jsonb, eligibility = $3::jsonb WHERE id = $1`, [drive.id, JSON.stringify(origDrive.ex), JSON.stringify(origDrive.el)]);
  await q(`UPDATE college_memberships SET left_at = NULL WHERE user_id = $1`, [b.id]);
  await q(`UPDATE users SET is_active = true, frozen_at = NULL WHERE id = $1`, [c.id]);
  await q(`UPDATE college_drive_meetings SET status = 'cancelled' WHERE drive_id = $1 AND user_id = ANY($2) AND status IN ('requested','accepted')`, [drive.id, [a.id, b.id, c.id]]);
}
await finish();
