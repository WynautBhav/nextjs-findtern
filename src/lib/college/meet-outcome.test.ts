import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MEET_STAGES, meetOutcome, meetStage, tallyMeets } from "./meet-outcome.ts";
import { buildDriveBoard, OFFER_STAGES, type MeetingRow, type OfferRow } from "./drive-board.ts";
import { buildDriveSummary } from "./drive-summary.ts";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const h = (n: number) => new Date(NOW + n * 3_600_000);
const student = (userId: string) => ({ userId, name: userId, rollNo: null, phone: null, email: null, year: 2, branch: "CSE" });

// The trigger data: every way a meeting can end, drive calls and interviews, one student outside the drive.
const MEETS: MeetingRow[] = [
  { userId: "s1", company: "A", status: "completed", createdAt: h(-30), startsAt: h(-24), feedback: "Strong on SQL.\nWeak on React." },
  { userId: "s2", company: "A", status: "accepted", createdAt: h(-5), startsAt: h(-4) }, // a call whose time passed: no join record
  { userId: "s3", company: "B", status: "accepted", createdAt: h(-1), startsAt: h(2) }, // accepted, time ahead
  { userId: "s4", company: "B", status: "missed", createdAt: h(-30), startsAt: h(-24) }, // the student didn't join
  { userId: "s5", company: "B", status: "unmarked", createdAt: h(-30), startsAt: h(-24) }, // picked, never marked
  { userId: "s6", company: "C", status: "expired", createdAt: h(-30), startsAt: h(-29) }, // a call nobody answered
  { userId: "s6", company: "C", status: "declined", createdAt: h(-20) },
  { userId: "s7", company: "C", status: "requested", createdAt: h(-1), startsAt: h(1) }, // sent, waiting
  { userId: "s8", company: "C", status: "cancelled", cancelledBy: "employer", reason: "Role filled", createdAt: h(-9) },
  { userId: "s9", company: "C", status: "cancelled", cancelledBy: "intern", createdAt: h(-9) },
  { userId: "out", company: "A", status: "completed", createdAt: h(-9), startsAt: h(-8) }, // not in the drive
];
const STUDENTS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"].map(student);
const OFFERS: OfferRow[] = [
  { userId: "s1", company: "A", status: "sent", hired: false, fullTime: false, createdAt: h(-5) }, // sent, waiting
  { userId: "s2", company: "A", status: "sent", hired: false, fullTime: false, createdAt: h(-50), pastStart: true }, // no reply by start: expired
  { userId: "s3", company: "B", status: "accepted", hired: false, fullTime: false, createdAt: h(-5) },
  { userId: "s4", company: "B", status: "hired", hired: true, fullTime: true, createdAt: h(-50), pastStart: true }, // hired: accepted
  { userId: "s5", company: "B", status: "accepted", hired: false, fullTime: false, createdAt: h(-50), pastStart: true }, // never paid: expired
  { userId: "s6", company: "C", status: "rejected", hired: false, fullTime: false, createdAt: h(-5) },
  { userId: "s7", company: "C", status: "withdrawn", hired: false, fullTime: false, createdAt: h(-5) },
];
const board = () => buildDriveBoard({ students: STUDENTS, meetings: MEETS, offers: OFFERS, offline: null, now: NOW });

test("owner rule: Completed only when the two met; Expired when not accepted, not joined or time over; Withdrawn either side", () => {
  const stage = (i: number) => meetStage(MEETS[i], NOW);
  assert.equal(stage(0), "completed", "an interview the company marked completed");
  assert.equal(stage(1), "expired", "a call whose time passed keeps no record both joined");
  assert.equal(meetOutcome(MEETS[1], NOW), "not_joined");
  assert.equal(stage(2), "accepted");
  assert.equal(stage(3), "expired", "missed: not joined");
  assert.equal(stage(4), "expired", "time passed, never marked");
  assert.equal(stage(5), "expired", "not accepted in time");
  assert.equal(stage(6), "expired", "declined");
  assert.equal(stage(7), "sent");
  assert.equal(stage(8), "withdrawn");
  assert.equal(stage(9), "withdrawn");
});

test("drive board: Total, Sent, Accepted, Completed, Expired, Withdrawn are the tally, add up to the total, and each list has its students", () => {
  const b = board();
  const t = tallyMeets(MEETS.filter((m) => m.userId !== "out"), NOW);
  assert.equal(b.meetCounts.total, t.total);
  for (const st of MEET_STAGES) assert.equal(b.meetCounts[st], t[st], st);
  assert.equal(MEET_STAGES.reduce((s, st) => s + b.meetCounts[st], 0), b.meetCounts.total);
  assert.deepEqual({ ...b.meetCounts }, { total: 10, sent: 1, accepted: 1, completed: 1, expired: 5, withdrawn: 2 });
  assert.equal(b.lists.meetingsWaiting.length, 1);
  assert.equal(b.lists.meetCompleted.length, 1);
  assert.equal(b.lists.meetExpired.length, 4, "s2, s4, s5, s6 (two expired meetings, one student)");
  assert.equal(b.lists.meetWithdrawn.length, 2);
  assert.deepEqual(new Set(b.lists.called.map((s) => s.userId)), new Set(STUDENTS.map((s) => s.userId)));
});

test("offers read the same way: Total, Sent, Accepted, Rejected, Expired, Withdrawn add up to the total", () => {
  const b = board();
  const c = b.offerCounts;
  assert.equal(OFFER_STAGES.reduce((s, st) => s + c[st], 0), c.total);
  assert.deepEqual([c.total, c.sent, c.accepted, c.rejected, c.expired, c.withdrawn, c.hiredFullTime], [7, 1, 2, 1, 2, 1, 1]);
  assert.equal(b.lists.offersWaiting.length, c.sent, "the Sent card and its nudge list are the same students");
  assert.equal(b.lists.offersExpired.length, c.expired);
});

test("drive summary funnel = the board: asked to meet = the Total meetings list, met = the Completed list", () => {
  const b = board();
  const s = buildDriveSummary({
    open: false,
    driveHref: "/d",
    window: { start: h(-48), end: h(48) },
    trackingSince: null,
    now: NOW,
    students: STUDENTS.map((x) => ({ ...x, score: null })),
    meetings: MEETS.map((m) => ({ ...m, employerId: m.company ?? "", respondedAt: null })),
    offers: [],
    nudges: [],
    minutes: new Map(),
    onlineAt: () => false,
    employers: [],
    invitedCount: 0,
  });
  const step = (k: string) => s.funnel.find((f) => f.key === k)!.value;
  assert.equal(step("called"), b.lists.called.length);
  assert.equal(step("met"), b.lists.meetCompleted.length);
});

test("a completed meeting shows the company's feedback, line breaks kept", () => {
  const row = board().lists.meetCompleted.find((r) => r.userId === "s1")!;
  assert.match(row.detail, /Feedback: Strong on SQL\.\nWeak on React\./);
});

test("one shared pool: only loadDrivePool fetches a drive's meetings and offers; every drive screen builds from it", () => {
  const root = join(import.meta.dirname, "../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  // The summary, the Employers table and the Companies tab take the pool; none of them reads meetings or offers itself.
  for (const f of ["lib/college/drive-summary-db.ts", "lib/college/drive-employers-db.ts", "lib/college/companies-db.ts"]) {
    assert.doesNotMatch(read(f), /schema\.proposals|loadDriveMeets|loadDriveInterviews|collegeDriveMeetings/, f);
  }
  const boardDb = read("lib/college/drive-board-db.ts");
  assert.equal(boardDb.match(/\.from\(p\)/g)?.length, 1, "offers are read in one place: loadDrivePool");
  assert.equal(boardDb.match(/loadDriveMeets\(/g)?.length, 1, "meetings are read in one place: loadDrivePool");
  // The drive page fetches the pool once and hands it to the board, the summary and the Employers table.
  const page = read("app/college/drives/[id]/page.tsx");
  assert.equal(page.match(/loadDrivePool\(/g)?.length, 1);
  assert.match(page, /loadDriveBoard\([^;]*pool\)/);
  assert.match(page, /loadDriveEmployers\(drive, pool,/);
  assert.match(page, /loadDriveSummary\([^;]*pool, true\)/);
  // The drives list shows the board's own figures for each drive.
  assert.match(read("app/college/drives/page.tsx"), /driveListFigures\(/);
  // The dashboard and Master data count meetings with the same rules, not in SQL.
  assert.doesNotMatch(read("lib/college/master-data.ts"), /'done', count\(\*\)/);
  assert.doesNotMatch(read("lib/college/drive-board.ts"), /const held = /);
  assert.doesNotMatch(read("lib/college/drive-summary.ts"), /metStatus/);
});
