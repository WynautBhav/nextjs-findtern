// WP2 (college audit): privacy of claimed students and CSV safety. Pure, no database.
import { test } from "node:test";
import assert from "node:assert/strict";

const { redactUnverified, toStudentRow } = await import("../college/serialize.ts");
const { csvCell, toCsv, buildMasterRow, cellText } = await import("../college/master-row.ts");

const NOW = new Date("2026-11-23T04:00:00Z");
const base = {
  userId: "u1", collegeId: "c1", status: "claimed" as const, verifiedBy: null, joinedAt: NOW, leftAt: null as Date | null, year: 3, branch: "CSE",
  rollNo: "R1", firstName: "Asha", lastName: "Meena", email: "asha@jklu.edu.in", phone: "+91 98290 00000", linkedin: "https://linkedin.com/in/asha",
  cgpa: 8.1, semester: 6, score: 7.4, aiStatus: "completed", lastSeenAt: NOW, offersPending: 2, proposals: 3, hired: 1, offersNew: 1, hiredNew: 1,
  callsPending: 1, interviewsScheduled: 1, driveMeetings: 1, lastActivityAt: NOW, openToWork: false,
};

test("WP2-01: a claimed student's last-seen and semester are redacted with the rest of their progress", () => {
  const r = redactUnverified(base);
  assert.equal(r.lastSeenAt, null, "last seen");
  assert.equal(r.lastActivityAt, null, "last activity");
  assert.equal(r.semester, null, "semester");
  assert.equal(r.score, null);
  assert.equal(r.cgpa, null);
});

test("WP2-01: every row shape a page can build from a redacted claimed student carries no progress", () => {
  const row = toStudentRow(redactUnverified(base));
  for (const k of ["score", "cgpa", "lastSeenAt", "lastActivityAt", "phone", "linkedin", "semester"] as const) assert.equal(row[k], null, k);
  for (const k of ["offersPending", "callsPending", "hired", "proposals", "interviewsScheduled", "driveMeetings"] as const) assert.equal(row[k], 0, k);
  assert.equal(row.aiStatus, "not_applied");
});

test("a verified student is returned untouched", () => {
  const v = { ...base, status: "verified" as const };
  assert.deepEqual(redactUnverified(v), v);
});

test("WP2-02: CSV neutralises every formula start, including after a leading blank or a newline", () => {
  for (const evil of ["=1+1", "+1", "-1+2", "@SUM(1)", "\t=1", "\r=1", "=HYPERLINK(\"http://x\",\"y\")", "\n=1+1", " =1+1", "\u00a0=1+1", "\ufeff=1+1"]) {
    const cell = csvCell(evil);
    const inner = cell.slice(1, -1).replace(/""/g, '"');
    assert.match(inner, /^'/, `${JSON.stringify(evil)} -> ${cell}`);
  }
  assert.equal(csvCell("plain"), '"plain"');
  assert.equal(csvCell("Rs 5,000 \"x\""), '"Rs 5,000 ""x"""');
  assert.equal(csvCell("2026-11-23"), '"2026-11-23"');
});

test("WP2-02: a claimed student exports blank beyond name, email, course, branch and year", () => {
  const verified = buildMasterRow({ ...base, status: "verified" as const }, undefined);
  const claimed = buildMasterRow({ ...base, status: "claimed" as const, phone: null, linkedin: null, cgpa: null, score: null }, undefined);
  const keys = ["name", "email", "phone", "cgpa", "score", "lastSeenAt", "offers", "hired", "ppo", "offerReplies", "driveCalls", "meetingsDone", "workMode", "city", "skills"] as const;
  const csv = toCsv([claimed], [...keys]);
  const row = csv.split("\r\n")[1];
  assert.equal(row, '"Asha Meena","asha@jklu.edu.in","","","","","","","","","","","","",""');
  assert.equal(cellText(verified, "email"), "asha@jklu.edu.in");
});

test("WP2-03: last seen in the CSV is India time, not a UTC ISO string", () => {
  const verified = buildMasterRow({ ...base, status: "verified" as const }, undefined);
  const row = { ...verified, lastSeenAt: "2026-11-22T20:00:00.000Z" }; // 01:30 IST on the 23rd
  assert.equal(cellText(row, "lastSeenAt"), "2026-11-23 01:30 IST");
  assert.equal(cellText({ ...row, lastSeenAt: null }, "lastSeenAt"), "");
  assert.equal(cellText({ ...row, lastSeenAt: "not a date" }, "lastSeenAt"), "");
});
