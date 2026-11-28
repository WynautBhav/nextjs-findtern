import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_FOLLOW_UP, historyText, callChangeError, callsByTarget, callsOf, followUpOf, followUpText, statusOf, type CallMark, type FollowUp } from "./follow-ups.ts";
import {
  EMPLOYER_FILTERS,
  COLLEGE_KPIS,
  COLLEGE_FILTERS,
  KPIS,
  NO_MEETS,
  NO_NUDGES,
  NO_OFFERS,
  STUDENT_COLUMNS,
  VIEWS,
  STUDENT_FILTERS,
  applyFilters,
  countWhere,
  meetTally,
  nudgeBreakdown,
  nudgeTallies,
  offerTally,
  rowsCsv,
  searchText,
  sortRows,
  stageOf,
  type EmployerRow,
  type StudentRow,
} from "./master-data-pure.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const mark = (d: number, note: string | null = null): CallMark => ({ at: daysAgo(d), by: "Priya", note });
const fu = (p: Partial<FollowUp> = {}): FollowUp => ({ ...NO_FOLLOW_UP, ...p });

test("nudges: TPO and Findtern add up per target, latest wins", () => {
  const m = nudgeTallies([
    { targetId: "a", source: "tpo", n: 3, last: "2026-11-20T00:00:00Z" },
    { targetId: "a", source: "findtern", n: 1, last: "2026-11-25T00:00:00Z" },
    { targetId: "b", source: "findtern", n: 2, last: null },
  ]);
  assert.deepEqual(m.get("a"), { tpo: 3, findtern: 1, last: "2026-11-25T00:00:00.000Z", lastFindtern: "2026-11-25T00:00:00.000Z" });
  // A TPO nudge alone never sets the admin-nudge date (the Nudge mark).
  assert.equal(nudgeTallies([{ targetId: "t", source: "tpo", n: 2, last: "2026-11-27T00:00:00Z" }]).get("t")?.lastFindtern, null);
  assert.equal(nudgeBreakdown(m.get("a")!), "TPO 3 · Findtern 1");
  assert.equal(nudgeBreakdown(m.get("b")!), "Findtern 2");
  assert.equal(nudgeBreakdown(NO_NUDGES), "None");
});

test("offer and meeting tallies add up to their totals", () => {
  const o = offerTally([
    { bucket: "pending", pay: null }, { bucket: "accepted", pay: "unpaid" }, { bucket: "accepted", pay: "processing" },
    { bucket: "hired", pay: null }, { bucket: "rejected", pay: null }, { bucket: "expired", pay: null }, { bucket: "withdrawn", pay: null },
  ]);
  assert.deepEqual(o, { sent: 7, pending: 1, accepted: 2, unpaid: 1, processing: 1, hired: 1, rejected: 1, withdrawn: 1, expired: 1 });
  assert.equal(o.pending + o.accepted + o.hired + o.rejected + o.expired + o.withdrawn, o.sent);
  assert.equal(o.unpaid + o.processing, o.accepted); // payment under way is not unpaid
  const m = meetTally(["sent", "accepted", "completed", "completed", "expired", "withdrawn"]);
  assert.equal(m.sent + m.accepted + m.completed + m.expired + m.withdrawn, m.total);
  assert.equal(m.completed, 2);
  assert.equal("declined" in m, false);
});

test("stage is the furthest step reached", () => {
  assert.equal(stageOf({ hired: true, offers: 1, aiStatus: "completed", profileComplete: true }), "hired");
  assert.equal(stageOf({ hired: false, offers: 1, aiStatus: "not_applied", profileComplete: false }), "offer");
  assert.equal(stageOf({ hired: false, offers: 0, aiStatus: "completed", profileComplete: false }), "interviewed");
  assert.equal(stageOf({ hired: false, offers: 0, aiStatus: "applied", profileComplete: true }), "profile");
  assert.equal(stageOf({ hired: false, offers: 0, aiStatus: "applied", profileComplete: false }), "signup");
});

const student = (id: string, p: Partial<StudentRow> = {}): StudentRow => ({
  id, name: `Student ${id}`, email: `${id}@x.edu`, phone: null, college: null, city: null,
  accountType: null, profileComplete: false, profilePct: 20, aiStatus: "not_applied", score: null, track: null, openToWork: true,
  offers: NO_OFFERS, meetings: NO_MEETS, hired: { internship: false, fullTime: false, ppo: false },
  lastSeenAt: null, activityHidden: false, online: false, createdAt: daysAgo(5), stage: "signup", nudges: NO_NUDGES, followUp: NO_FOLLOW_UP, ...p,
});
const rows = [
  student("a"),
  student("b", { followUp: fu({ nudge: { at: daysAgo(1) } }) }),
  student("c", { followUp: fu({ call1: mark(3), call2: mark(1) }) }),
  student("d", { followUp: fu({ call1: mark(2) }), accountType: "college", college: "JKLU", hired: { internship: true, fullTime: false, ppo: true }, track: "tech" }),
  student("e", { accountType: "individual", city: "Jaipur", track: "non_tech" }),
];

test("every KPI equals the length of the list its filters open (not 1 of 1)", () => {
  const expect: Record<string, number> = { all: 5, open: 2, call1: 2, call2: 1 };
  for (const k of KPIS) {
    const list = applyFilters(rows, STUDENT_FILTERS, k.filters);
    assert.equal(countWhere(rows, STUDENT_FILTERS, k.filters), list.length, k.key);
    assert.equal(list.length, expect[k.key], k.key);
  }
});

test("student filters: account type, college, hired kinds, tech, city, search", () => {
  const n = (f: Record<string, string>, q = "") => applyFilters(rows, STUDENT_FILTERS, f, q, searchText.students).map((r) => r.id).join("");
  assert.equal(n({ accountType: "unset" }), "abc");
  assert.equal(n({ accountType: "college" }), "d");
  assert.equal(n({ college: "__none" }), "abce");
  assert.equal(n({ hired: "any" }), "d");
  assert.equal(n({ hired: "ppo" }), "d");
  assert.equal(n({ hired: "full_time" }), "");
  assert.equal(n({ hired: "none" }), "abce");
  assert.equal(n({ track: "unknown" }), "abc");
  assert.equal(n({ city: "Jaipur" }), "e");
  assert.equal(n({ followUp: "nothing" }), "ae");
  assert.equal(n({ followUp: "nudged" }), "b");
  assert.equal(n({ followUp: "not-nudged" }), "acde");
  assert.equal(n({ followUp: "call1" }), "cd");
  assert.equal(n({ followUp: "call2" }), "c");
  assert.equal(n({ followUp: "not-called" }), "abe");
  assert.equal(n({}, "student d@x"), "d");
  assert.equal(n({}, "jaipur"), "e");
  assert.equal(n({ unknownKey: "x", college: "" }), "abcde");
});

test("employer filters: unpaid and open project with no offers", () => {
  const emp = (id: string, p: Partial<EmployerRow>): EmployerRow => ({
    id, company: id, contact: null, email: null, phone: null, city: null, emailVerified: true, fte: "none", active: true, frozen: false, strikes: 0,
    pro: "none", viaDrive: false, inDriveNow: false, projectsTotal: 0, projectsOpen: 0, offers: NO_OFFERS, meetings: NO_MEETS,
    lastActiveAt: null, activityHidden: false, createdAt: null, nudges: NO_NUDGES, followUp: NO_FOLLOW_UP, ...p,
  });
  const es = [emp("x", { offers: { ...NO_OFFERS, sent: 2, accepted: 2, unpaid: 1, processing: 1 } }), emp("y", { projectsTotal: 2, projectsOpen: 1 }), emp("z", { frozen: true, strikes: 2 })];
  const ids = (f: Record<string, string>) => applyFilters(es, EMPLOYER_FILTERS, f).map((r) => r.id).join("");
  assert.equal(ids({ offers: "unpaid" }), "x");
  assert.equal(countWhere(es, EMPLOYER_FILTERS, { offers: "waiting" }), 0);
  assert.equal(ids({ projects: "open-no-offer" }), "y");
  assert.equal(ids({ standing: "frozen" }), "z");
  assert.equal(ids({ standing: "strikes" }), "z");
  assert.equal(ids({ standing: "active" }), "xy");
});

test("CSV has exactly the shown columns, in order, formula-safe", () => {
  const cols = ["name", "email", "followUpNote"].map((k) => STUDENT_COLUMNS.find((c) => c.key === k)!);
  const csv = rowsCsv([student("a", { followUp: fu({ call1: mark(0, "=CALL()") }) })], cols);
  const fuCol = STUDENT_COLUMNS.find((c) => c.key === "followUp")!;
  assert.match(fuCol.text(student("a", { followUp: fu({ call1: mark(0) }) })), /^Nudge – · Call 1 ✓ \d+ \w+ · Call 2 –$/);
  assert.equal(csv, '﻿"Name","Email","Call note"\r\n"Student a","a@x.edu","\'=CALL()"\r\n');
});

test("sort puts missing values last both ways", () => {
  const score = STUDENT_COLUMNS.find((c) => c.key === "score")!;
  const name = STUDENT_COLUMNS[0];
  const rs = [student("a", { score: null }), student("b", { score: 7 }), student("c", { score: 9 })];
  assert.deepEqual(sortRows(rs, score, "desc", name).map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual(sortRows(rs, score, "asc", name).map((r) => r.id), ["b", "c", "a"]);
});

test("calls: the newest row per call wins, an undo clears it, other statuses are ignored", () => {
  const rows = [
    { targetId: "a", status: "call_1", note: "first", createdAt: "2026-11-01T00:00:00Z", by: "Priya" },
    { targetId: "a", status: "call_1_undone", note: null, createdAt: "2026-11-02T00:00:00Z" },
    { targetId: "a", status: "call_1", note: "again", createdAt: "2026-11-03T00:00:00Z", by: "Ravi" },
    { targetId: "a", status: "escalated", note: "old model", createdAt: "2026-11-04T00:00:00Z" },
    { targetId: "b", status: "call_1", note: null, createdAt: "2026-11-01T00:00:00Z" },
    { targetId: "b", status: "call_2", note: "x", createdAt: "2026-11-02T00:00:00Z" },
    { targetId: "b", status: "call_2_undone", note: null, createdAt: "2026-11-03T00:00:00Z" },
  ];
  const m = callsByTarget(rows);
  assert.deepEqual(m.get("a")?.call1, { at: "2026-11-03T00:00:00.000Z", by: "Ravi", note: "again" });
  assert.equal(m.get("a")?.call2, null);
  assert.ok(m.get("b")?.call1);
  assert.equal(m.get("b")?.call2, null);
  assert.deepEqual(callsOf([]), { call1: null, call2: null });
  assert.equal(statusOf(2, false), "call_2_undone");
});

test("call order: Call 2 only after Call 1; undo only what is set; Call 1 stays while Call 2 is set", () => {
  const none = { call1: false, call2: false };
  const one = { call1: true, call2: false };
  const both = { call1: true, call2: true };
  assert.equal(callChangeError(none, { call: 2, done: true }), "Mark Call 1 first.");
  assert.equal(callChangeError(none, { call: 1, done: true }), null);
  assert.equal(callChangeError(one, { call: 2, done: true }), null);
  assert.equal(callChangeError(none, { call: 1, done: false }), "Call 1 isn't marked.");
  assert.equal(callChangeError(one, { call: 2, done: false }), "Call 2 isn't marked.");
  assert.equal(callChangeError(both, { call: 1, done: false }), "Undo Call 2 first.");
  assert.equal(callChangeError(both, { call: 2, done: false }), null);
  assert.equal(callChangeError(one, { call: 1, done: false }), null);
});

test("the nudge mark is derived from the admin-nudge date only, and never for colleges", () => {
  const calls = { call1: mark(1), call2: null };
  assert.deepEqual(followUpOf(calls, "2026-11-27T05:00:00.000Z", true).nudge, { at: "2026-11-27T05:00:00.000Z" });
  assert.equal(followUpOf(calls, null, true).nudge, null);
  assert.equal(followUpOf(undefined, "2026-11-27T05:00:00.000Z", false).nudge, null);
  assert.equal(followUpText(followUpOf({ call1: { at: "2026-11-28T10:40:00.000Z", by: null, note: null }, call2: null }, "2026-11-27T05:00:00.000Z", true)), "Nudge ✓ 27 Nov · Call 1 ✓ 28 Nov · Call 2 –");
  assert.equal(followUpText(followUpOf(undefined, null, false)), "Nudge n/a · Call 1 – · Call 2 –");
});

test("history line names the call, the step, the admin and the India time", () => {
  assert.equal(historyText({ status: "call_1", at: "2026-11-28T10:40:00.000Z", by: "Priya" }), "Call 1 marked by Priya 28 Nov, 4:10 PM");
  assert.equal(historyText({ status: "call_2_undone", at: "2026-11-28T10:40:00.000Z", by: null }), "Call 2 undone 28 Nov, 4:10 PM");
});

test("college cards: Not called replaces Not nudged or called (admins cannot nudge a college); card == rows", () => {
  const c = (id: string, f: Partial<FollowUp>) => ({ id, followUp: fu({ nudgeable: false, ...f }) }) as unknown as import("./master-data-pure.ts").CollegeRow;
  const rows = [c("x", {}), c("y", { call1: mark(1) }), c("z", { call1: mark(2), call2: mark(1) })];
  const expect: Record<string, number> = { all: 3, open: 1, call1: 2, call2: 1 };
  for (const k of COLLEGE_KPIS) assert.equal(countWhere(rows, COLLEGE_FILTERS, k.filters), expect[k.key], k.key);
  assert.equal(COLLEGE_KPIS[1].label, "Not called");
});

test("every view opens newest first, and no column is called heat", () => {
  for (const tab of ["students", "employers", "colleges"] as const) {
    assert.deepEqual(VIEWS[tab][0].sort, { key: "createdAt", dir: "desc" }, tab);
    assert.ok(VIEWS[tab].every((v) => !v.columns.includes("heat")), tab);
  }
  assert.ok(!STUDENT_COLUMNS.some((c) => c.key === "heat"));
});
