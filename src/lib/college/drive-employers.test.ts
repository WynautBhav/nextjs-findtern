import assert from "node:assert/strict";
import test from "node:test";

import { buildDriveEmployers, countByEmployer, employerHref, employersLine } from "./drive-employers.ts";

const NOW = Date.parse("2026-11-23T10:00:00Z");
const minAgo = (m: number) => new Date(NOW - m * 60_000);
const came = (id: string, company: string, email: string) => ({ employerId: id, company, contact: "Ria", email, phone: null, joinedAt: minAgo(500) });

test("counts: cancelled meets are out, offers count one by one, a student hired twice is one hire", () => {
  const c = countByEmployer(
    [{ employerId: "e1", status: "accepted" }, { employerId: "e1", status: "requested" }, { employerId: "e1", status: "cancelled" }, { employerId: "e2", status: "declined" }],
    [
      { employerId: "e1", userId: "a", status: "hired", hiredAt: null },
      { employerId: "e1", userId: "a", status: "sent", hiredAt: minAgo(5) },
      { employerId: "e1", userId: "b", status: "completed", hiredAt: null },
      { employerId: "e1", userId: "c", status: "sent", hiredAt: null },
      { employerId: "e2", userId: "a", status: "declined", hiredAt: null },
    ],
  );
  assert.deepEqual(c.get("e1"), { meetings: 2, offers: 4, hires: 2 });
  assert.deepEqual(c.get("e2"), { meetings: 1, offers: 1, hires: 0 });
});

const live = (over = false) =>
  buildDriveEmployers({
    came: [came("e1", "Acme Pvt Ltd", "hr@acme.com"), came("e2", "Beta", "x@beta.com"), came("e3", "Gamma", "g@gamma.com")],
    invited: [{ company: "Acme", email: "other@acme.com" }, { company: "Delta", email: "d@delta.com" }],
    counts: new Map([["e1", { meetings: 2, offers: 1, hires: 1 }]]),
    lastSeen: new Map([["e1", minAgo(1)], ["e2", minAgo(180)]]),
    over,
    now: NOW,
  });

test("status: online within the window, last seen after, not seen without a heartbeat", () => {
  const d = live();
  assert.deepEqual(d.rows.slice(0, 3).map((r) => r.status), [{ kind: "online" }, { kind: "seen", label: "Last seen 3 h ago" }, { kind: "never" }]);
  assert.equal(d.online, 1);
});

test("invited flag by email or name; the invited company that never came is a row with no employer", () => {
  const d = live();
  assert.deepEqual(d.rows.map((r) => [r.company, r.invited, r.employerId]), [["Acme Pvt Ltd", true, "e1"], ["Beta", false, "e2"], ["Gamma", false, "e3"], ["Delta", true, null]]);
  assert.deepEqual(d.rows[3].status, { kind: "absent" });
  assert.deepEqual([d.rows[0].meetings, d.rows[0].offers, d.rows[0].hires], [2, 1, 1]);
  assert.deepEqual([d.rows[1].meetings, d.rows[1].offers, d.rows[1].hires], [0, 0, 0]);
});

test("a finished drive says who came, never who is online", () => {
  const d = live(true);
  assert.deepEqual(d.rows[0].status, { kind: "completed" });
  assert.equal(d.online, 0);
  assert.equal(employersLine(d, true), "3 in the drive · 1 invited company didn't come");
});

test("the line and the link", () => {
  assert.equal(employersLine(live(), false), "3 in the drive · 1 online now · 1 invited company didn't come");
  assert.equal(employerHref("d1", "e1"), "/college/drives/d1?employer=e1#board");
});

test("26 Nov PDF: a company that left early reads Withdrawn, live or over; one that stayed reads Completed once it ends", () => {
  const run = (over: boolean) =>
    buildDriveEmployers({ came: [{ ...came("e1", "Acme", "hr@acme.com"), exited: true }, came("e2", "Beta", "x@beta.com")], invited: [], counts: new Map(), lastSeen: new Map(), over, now: NOW });
  assert.deepEqual(run(false).rows.map((r) => r.status.kind), ["withdrawn", "never"]);
  assert.deepEqual(run(true).rows.map((r) => r.status.kind), ["withdrawn", "completed"]);
});

test("each company row carries what the past drive shows: joined, online time and shortlisted; time is null until online time is recorded", () => {
  const args = { came: [{ ...came("e1", "Acme", "hr@acme.com"), shortlisted: 3 }, came("e2", "Beta", "x@beta.com")], invited: [{ company: "Delta", email: "d@delta.com" }], counts: new Map(), lastSeen: new Map(), over: false, now: NOW };
  const tracked = buildDriveEmployers({ ...args, minutes: new Map([["e1", 95]]) });
  assert.deepEqual(tracked.rows.map((r) => [r.company, r.shortlisted, r.minutes, r.joinedAt !== null]), [["Acme", 3, 95, true], ["Beta", 0, 0, true], ["Delta", 0, null, false]]);
  assert.deepEqual(buildDriveEmployers({ ...args, minutes: null }).rows.map((r) => r.minutes), [null, null, null]);
});
