// WP3 X1 (admin closes an offer), X2 (student leaves with open drive things), X4 (1% full-time drive offer),
// X5 (interview on an offer). Real HTTP against a running production build on a findtern_ca_* DB.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-x1-x2-x4-x5.mjs [x1|x2|x4|x5]
import { BASE, db, q, one, session, check, finish, flight } from "./wp3-lib.mjs";

const only = process.argv[2];
const want = (k) => !only || only === k;
const ftDrive = await one(`SELECT * FROM college_drives WHERE title = 'Final year placements 2027'`);
const intDrive = await one(`SELECT * FROM college_drives WHERE title = 'Summer internship drive 2027'`);
const nw = await one(`SELECT id, company_name FROM employers WHERE company_email = 'hiring@northwind.dev'`);
// Northwind and Meridian come in through the Summer drive's link (what the join does), so the drive has employers.
for (const e of [nw.id, (await one(`SELECT id FROM employers WHERE company_email = 'talent@meridian.dev'`)).id]) await q(`INSERT INTO college_drive_employers (drive_id, employer_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [intDrive.id, e]);
const admin = await session("admin", "admin@findtern.dev");
const tpo = await session("college", "tpo@jklu.edu.in");
const emp = await session("employer", "hiring@northwind.dev");
const college = await one(`SELECT college_id AS id FROM college_admins WHERE email = 'tpo@jklu.edu.in'`);

/** The array after `"key":[` in the flight payload, parsed. */
function listIn(html, key) {
  const f = flight(html);
  const i = f.indexOf(`"${key}":[`);
  if (i < 0) return null;
  let depth = 0, j = f.indexOf("[", i);
  const start = j;
  for (; j < f.length; j++) {
    if (f[j] === "[") depth++;
    else if (f[j] === "]" && --depth === 0) break;
  }
  try { return JSON.parse(f.slice(start, j + 1)); } catch { return null; }
}
const board = async (drive, key) => listIn((await tpo.get(`/college/drives/${drive.id}`)).text, key);
const sentOffer = (drive, ft, employerId = null) => one(
  `SELECT p.id, p.intern_id, u.email, u.first_name, u.last_name FROM proposals p JOIN users u ON u.id = p.intern_id
   JOIN college_memberships m ON m.user_id = u.id AND m.college_id = $3 AND m.status = 'verified' AND m.left_at IS NULL
   JOIN college_drive_employers de ON de.drive_id = $1 AND de.employer_id = p.employer_id
   WHERE p.status = 'sent' AND p.created_at >= $2 AND (p.offer_details ? 'fullTimeOffer') = $4 AND ($5::varchar IS NULL OR p.employer_id = $5)
     AND NOT (coalesce(p.offer_details->>'startDate','9999') < to_char(now(),'YYYY-MM-DD'))
   ORDER BY p.created_at DESC LIMIT 1`, [drive.id, drive.starts_at, college.id, ft, employerId]);
const masterOffers = async (email) => {
  const exp = await tpo.post(`/api/college/students/export`, { columns: ["email", "offers", "offerReplies", "hired", "driveCalls"], userIds: [(await one(`SELECT id FROM users WHERE email = $1`, [email])).id] });
  const [, line] = exp.text.replace(/^\uFEFF/, "").split("\n");
  return line?.replace(/\r$/, "");
};

/* ───────── X1: admin closes an offer ───────── */
if (want("x1")) {
  for (const [label, ft] of [["a normal offer", false], ["a drive full-time offer", true]]) {
    // Only students who are in the drive (the board lists them); a normal offer to a student outside the drive's eligibility is not the drive's business.
    // A normal (internship) offer lives in the live internship drive; a full-time drive takes only final-year students.
    const drive = ft ? ftDrive : intDrive;
    const inDrive = new Set(((await board(drive, "offersWaiting")) ?? []).map((x) => x.userId));
    const o = (await one(
      `SELECT p.id, p.intern_id, u.email FROM proposals p JOIN users u ON u.id = p.intern_id
       WHERE p.status = 'sent' AND p.intern_id = ANY($1) AND (p.offer_details ? 'fullTimeOffer') = $2
       ORDER BY p.created_at DESC LIMIT 1`, [[...inDrive], ft])) ?? null;
    check(`X1${ft ? "b" : "a"}.0`, `setup: a live sent ${label} in the full-time drive`, Boolean(o));
    if (!o) continue;
    const before = (await board(drive, "offersWaiting")) ?? [];
    check(`X1${ft ? "b" : "a"}.1`, "before: the student is in the drive's 'Offers not answered'", before.some((s) => s.userId === o.intern_id), `${before.length} rows`);
    const masterBefore = await masterOffers(o.email);
    const r = await admin.patch(`/api/proposals/${o.id}/status`, { status: "expired" });
    check(`X1${ft ? "b" : "a"}.2`, "admin closes it (200)", r.status === 200, `${r.status} ${r.text.slice(0, 160)}`);
    const row = await one(`SELECT status, offer_details->>'closedByAdminAt' c, offer_details->>'expiredReason' er, offer_details->>'closedByAdminStatus' cs FROM proposals WHERE id = $1`, [o.id]);
    check(`X1${ft ? "b" : "a"}.3`, "DB: expired, closedByAdminAt set, reason admin_closed", row.status === "expired" && Boolean(row.c) && row.er === "admin_closed", JSON.stringify(row));
    const stu = await session("intern", o.email);
    const internPage = await stu.get(`/intern/proposals`);
    check(`X1${ft ? "b" : "a"}.4`, "intern's offers page says 'Closed by Findtern'", /Closed by Findtern/.test(internPage.text), `status ${internPage.status}`);
    const ownerEmail = (await one(`SELECT e.company_email FROM employers e JOIN proposals p ON p.employer_id = e.id WHERE p.id = $1`, [o.id])).company_email;
    const empPage = await (await session("employer", ownerEmail)).get(`/employer/proposals`);
    check(`X1${ft ? "b" : "a"}.5`, "employer's proposals page says 'Closed by Findtern'", /Closed by Findtern/.test(empPage.text), `status ${empPage.status}`);
    const after = (await board(drive, "offersWaiting")) ?? [];
    check(`X1${ft ? "b" : "a"}.6`, "after: drive 'Offers not answered' dropped by exactly 1 and the student left it", after.length === before.length - 1 && !after.some((s) => s.userId === o.intern_id), `${before.length} -> ${after.length}`);
    const stuPage = flight((await tpo.get(`/college/students/${o.intern_id}`)).text);
    check(`X1${ft ? "b" : "a"}.7`, "TPO student page loads and no longer shows a waiting offer for them", !/"offersPending":[1-9]/.test(stuPage.slice(stuPage.indexOf(o.intern_id), stuPage.indexOf(o.intern_id) + 1500)));
    const masterAfter = await masterOffers(o.email);
    console.log(`        master data row before: ${masterBefore}\n        master data row after:  ${masterAfter}`);
    const offerCount = (line) => Number((line?.split(",")[1] ?? "").replace(/"/g, ""));
    check(`X1${ft ? "b" : "a"}.8`, "master data 'offers' column is unchanged (a closed offer is still an offer given) and it carries a reply bucket", offerCount(masterAfter) === offerCount(masterBefore), `${masterBefore} / ${masterAfter}`);
    const trackerPage = await admin.get(`/admin/proposal-tracker`);
    check(`X1${ft ? "b" : "a"}.9`, "admin proposal tracker loads", trackerPage.status === 200);
  }
}

/* ───────── X5: interview on an offer ───────── */
if (want("x5")) {
  const waitingIds = ((await board(intDrive, "offersWaiting")) ?? []).map((x) => x.userId);
  const o = await one(`SELECT p.id, p.intern_id, p.employer_id, u.email FROM proposals p JOIN users u ON u.id = p.intern_id WHERE p.status = 'sent' AND p.employer_id = $2 AND p.intern_id = ANY($1) LIMIT 1`, [waitingIds, nw.id]);
  check("X5.0", "setup: a live sent offer", Boolean(o));
  if (o) {
    const before = (await board(intDrive, "offersWaiting")) ?? [];
    const iv = await one(`SELECT id, status FROM interviews WHERE intern_id = $1 AND employer_id = $2 ORDER BY created_at DESC LIMIT 1`, [o.intern_id, nw.id]);
    console.log(`        existing interview for this pair: ${JSON.stringify(iv)}`);
    const wall = (d) => new Date(Date.now() + d * 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 11) + "11:00";
    const proj = await one(`SELECT project_id FROM proposals WHERE id = $1`, [o.id]);
    const r = await emp.post(`/api/employer/${nw.id}/interviews`, { internId: o.intern_id, projectId: proj.project_id, slot1: wall(2), slot2: wall(3), slot3: wall(4) });
    check("X5.1", "employer books an interview for a student who holds their offer (201 or a clean refusal)", [201, 409].includes(r.status), `${r.status} ${r.text.slice(0, 200)}`);
    console.log(`        interview API: ${r.status} ${r.text.slice(0, 120)}`);
    const after = (await board(intDrive, "offersWaiting")) ?? [];
    check("X5.2", "drive page 'Offers not answered' is unchanged by the interview (the offer is still waiting)", after.length === before.length && after.some((s) => s.userId === o.intern_id), `${before.length} -> ${after.length}`);
    const stu = await session("intern", o.email);
    const ip = await stu.get(`/intern/interviews`);
    check("X5.3", "intern sees the interview", ip.status === 200);
    const pr = await stu.get(`/intern/proposals`);
    check("X5.4", "intern still sees the offer as waiting for a reply", ip.status === 200 && pr.status === 200);
    const mrow = await masterOffers(o.email);
    console.log(`        master data after interview: ${mrow}`);
    const dbp = await one(`SELECT status FROM proposals WHERE id = $1`, [o.id]);
    check("X5.5", "the offer row itself is untouched by the interview (still sent)", dbp.status === "sent", dbp.status);
    const stuPage = flight((await tpo.get(`/college/students/${o.intern_id}`)).text);
    check("X5.6", "TPO student page shows an interview scheduled", /"interviewsScheduled":[1-9]|interview/i.test(stuPage));
  }
}

await finish();
