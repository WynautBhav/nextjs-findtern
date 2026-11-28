import assert from "node:assert/strict";
import { test } from "node:test";

import { latestFollowUps, noteForNewRow, type FollowUp } from "./follow-ups.ts";
import {
  EMPLOYER_FILTERS,
  KPIS,
  NO_MEETS,
  NO_NUDGES,
  NO_OFFERS,
  STUDENT_COLUMNS,
  STUDENT_FILTERS,
  applyFilters,
  collegeHeat,
  countWhere,
  employerHeat,
  levelOf,
  meetTally,
  nudgeBreakdown,
  nudgeTallies,
  offerTally,
  rowsCsv,
  searchText,
  sortRows,
  stageOf,
  studentHeat,
  type EmployerRow,
  type StudentRow,
} from "./master-data-pure.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const fu = (status: FollowUp["status"], d: number): FollowUp => ({ status, note: null, at: daysAgo(d), by: null });

const S0 = { unpaid: 0, offersPending: 0, meetingsUpcoming: 0, meetingsWaiting: 0, hired: false, aiStatus: "not_applied", profileComplete: false, lastMoveAt: daysAgo(0), followUp: null };

test("student heat: importance ladder, first match wins", () => {
  assert.equal(studentHeat({ ...S0, unpaid: 1, offersPending: 2 }, NOW).score, 70);
  assert.match(studentHeat({ ...S0, unpaid: 1 }, NOW).why, /^Accepted an offer, not paid yet/);
  assert.equal(studentHeat({ ...S0, offersPending: 1 }, NOW).score, 60);
  assert.equal(studentHeat({ ...S0, meetingsUpcoming: 1 }, NOW).score, 50);
  assert.equal(studentHeat({ ...S0, meetingsWaiting: 1 }, NOW).score, 45);
  assert.equal(studentHeat({ ...S0, hired: true }, NOW).score, 35);
  assert.equal(studentHeat({ ...S0, aiStatus: "scheduled" }, NOW).score, 35);
  assert.equal(studentHeat({ ...S0, aiStatus: "completed" }, NOW).score, 32);
  assert.equal(studentHeat({ ...S0, profileComplete: true }, NOW).score, 30);
  const signup = studentHeat(S0, NOW);
  assert.deepEqual([signup.score, signup.level, signup.why], [10, "calm", "Signed up only"]);
});

test("heat aging scales with the stake and caps at 30 days", () => {
  // 70 + round(10 * 70 / 70) = 80; signup only idle 60 days: 10 + round(30 * 10 / 70) = 14.
  const hot = studentHeat({ ...S0, unpaid: 1, lastMoveAt: daysAgo(10) }, NOW);
  assert.deepEqual([hot.score, hot.level], [80, "hot"]);
  assert.match(hot.why, /quiet 10 days/);
  assert.equal(studentHeat({ ...S0, lastMoveAt: daysAgo(60) }, NOW).score, 14);
  assert.equal(studentHeat({ ...S0, unpaid: 1, lastMoveAt: daysAgo(400) }, NOW).score, 100);
  // Nothing known counts as 30 days.
  assert.equal(studentHeat({ ...S0, offersPending: 1, lastMoveAt: null }, NOW).score, 60 + Math.round((30 * 60) / 70));
});

test("follow-up: escalated raises, a recent reply lowers, an old reply does nothing", () => {
  const base = { ...S0, meetingsWaiting: 1 }; // 45
  assert.equal(studentHeat({ ...base, followUp: fu("escalated", 20) }, NOW).score, 65);
  assert.equal(studentHeat({ ...base, followUp: fu("responded", 2) }, NOW).score, 25);
  assert.equal(studentHeat({ ...base, followUp: fu("responded", 9) }, NOW).score, 45);
  assert.equal(studentHeat({ ...base, followUp: fu("followed_up", 1) }, NOW).score, 35);
  assert.equal(studentHeat({ ...base, followUp: fu("followed_up", 5) }, NOW).score, 45);
  assert.equal(studentHeat({ ...S0, followUp: fu("responded", 1) }, NOW).score, 0); // clamped
  assert.match(studentHeat({ ...base, followUp: fu("escalated", 1) }, NOW).why, /escalated$/);
});

test("levels: hot at 70, warm at 40", () => {
  assert.deepEqual([levelOf(70), levelOf(69), levelOf(40), levelOf(39)], ["hot", "warm", "warm", "calm"]);
});

const E0 = { active: true, frozen: false, unpaid: 0, offersPending: 0, meetingsUpcoming: 0, openProjects: 0, offersSent: 0, hires: 0, onboarded: false, lastMoveAt: daysAgo(0), followUp: null };
test("employer heat ladder", () => {
  assert.equal(employerHeat({ ...E0, frozen: true, unpaid: 3 }, NOW).score, 5);
  assert.equal(employerHeat({ ...E0, active: false }, NOW).why, "Account switched off");
  assert.equal(employerHeat({ ...E0, unpaid: 2 }, NOW).why, "2 accepted offers waiting on payment");
  assert.equal(employerHeat({ ...E0, offersPending: 1 }, NOW).why, "1 offer waiting for a reply");
  assert.equal(employerHeat({ ...E0, meetingsUpcoming: 1 }, NOW).score, 45);
  assert.equal(employerHeat({ ...E0, openProjects: 2 }, NOW).score, 40);
  assert.equal(employerHeat({ ...E0, openProjects: 2, offersSent: 1, hires: 1 }, NOW).score, 30);
  assert.equal(employerHeat({ ...E0, onboarded: true }, NOW).score, 20);
  assert.equal(employerHeat(E0, NOW).score, 10);
});

const C0 = { seatsBought: 0, seatsUsed: 0, students: 0, notInterviewed: 0, liveDrive: false, partner: false, placed: 0, lastMoveAt: daysAgo(0), followUp: null };
test("college heat ladder", () => {
  assert.equal(collegeHeat({ ...C0, seatsBought: 100, seatsUsed: 50 }, NOW).why, "50 of 100 seats unused");
  assert.equal(collegeHeat({ ...C0, seatsBought: 100, seatsUsed: 51, students: 10, notInterviewed: 5 }, NOW).why, "5 of 10 students not interviewed");
  assert.equal(collegeHeat({ ...C0, students: 4, notInterviewed: 4, liveDrive: true }, NOW).score, 45);
  assert.equal(collegeHeat({ ...C0, partner: true }, NOW).score, 40);
  assert.equal(collegeHeat({ ...C0, seatsBought: 10, seatsUsed: 10, placed: 2, students: 10 }, NOW).why, "2 students placed");
  assert.equal(collegeHeat({ ...C0, students: 1 }, NOW).score, 20);
  assert.equal(collegeHeat(C0, NOW).score, 10);
});

test("nudges: TPO and Findtern add up per target, latest wins", () => {
  const m = nudgeTallies([
    { targetId: "a", source: "tpo", n: 3, last: "2026-11-20T00:00:00Z" },
    { targetId: "a", source: "findtern", n: 1, last: "2026-11-25T00:00:00Z" },
    { targetId: "b", source: "findtern", n: 2, last: null },
  ]);
  assert.deepEqual(m.get("a"), { tpo: 3, findtern: 1, last: "2026-11-25T00:00:00.000Z" });
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
  const m = meetTally(["sent", "accepted", "completed", "completed", "declined", "expired", "withdrawn"]);
  assert.equal(m.sent + m.accepted + m.completed + m.declined + m.expired + m.withdrawn, m.total);
  assert.equal(m.declined, 1);
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
  lastSeenAt: null, activityHidden: false, online: false, createdAt: daysAgo(5), stage: "signup", nudges: NO_NUDGES, followUp: null,
  heat: { score: 10, level: "calm", why: "Signed up only" }, ...p,
});
const HOT = { score: 80, level: "hot" as const, why: "x" };
const rows = [
  student("a", { heat: HOT }),
  student("b", { heat: HOT, followUp: fu("escalated", 1) }),
  student("c", { heat: HOT }),
  student("d", { followUp: fu("escalated", 2), accountType: "college", college: "JKLU", hired: { internship: true, fullTime: false, ppo: true }, track: "tech" }),
  student("e", { accountType: "individual", city: "Jaipur", track: "non_tech" }),
];

test("every KPI equals the length of the list its filters open (not 1 of 1)", () => {
  const expect: Record<string, number> = { all: 5, hot: 3, "hot-open": 2, escalated: 2 };
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
  assert.equal(n({ heat: "hot", followUp: "none" }), "ac");
  assert.equal(n({}, "student d@x"), "d");
  assert.equal(n({}, "jaipur"), "e");
  assert.equal(n({ unknownKey: "x", college: "" }), "abcde");
});

test("employer filters: unpaid and open project with no offers", () => {
  const emp = (id: string, p: Partial<EmployerRow>): EmployerRow => ({
    id, company: id, contact: null, email: null, phone: null, city: null, emailVerified: true, fte: "none", active: true, frozen: false, strikes: 0,
    pro: "none", viaDrive: false, inDriveNow: false, projectsTotal: 0, projectsOpen: 0, offers: NO_OFFERS, meetings: NO_MEETS,
    lastActiveAt: null, activityHidden: false, createdAt: null, nudges: NO_NUDGES, followUp: null, heat: { score: 10, level: "calm", why: "" }, ...p,
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
  const csv = rowsCsv([student("a", { followUp: { status: "pending", note: "=CALL()", at: daysAgo(0), by: null } })], cols);
  assert.equal(csv, '﻿"Name","Email","Follow-up note"\r\n"Student a","a@x.edu","\'=CALL()"\r\n');
});

test("sort puts missing values last both ways", () => {
  const score = STUDENT_COLUMNS.find((c) => c.key === "score")!;
  const name = STUDENT_COLUMNS[0];
  const rs = [student("a", { score: null }), student("b", { score: 7 }), student("c", { score: 9 })];
  assert.deepEqual(sortRows(rs, score, "desc", name).map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual(sortRows(rs, score, "asc", name).map((r) => r.id), ["b", "c", "a"]);
});

test("latest follow-up per target is the newest row; unknown statuses are skipped", () => {
  const m = latestFollowUps([
    { targetId: "a", status: "pending", note: "first", createdAt: "2026-11-01T00:00:00Z" },
    { targetId: "a", status: "responded", note: "second", createdAt: "2026-11-02T00:00:00Z" },
    { targetId: "a", status: "bogus", note: "x", createdAt: "2026-11-03T00:00:00Z" },
  ]);
  assert.equal(m.get("a")?.status, "responded");
  assert.equal(m.get("a")?.note, "second");
});

test("a status-only change carries the newest note on record, never a stale one", () => {
  // The page loaded with "old"; the drawer then saved "new"; the table's dropdown sends keepNote, the server reads "new".
  assert.equal(noteForNewRow({ keepNote: true }, "new"), "new");
  assert.equal(noteForNewRow({ keepNote: true }, null), null);
  // The drawer sends what it shows: a blank note clears it, a note is trimmed.
  assert.equal(noteForNewRow({ note: "  " }, "new"), null);
  assert.equal(noteForNewRow({ note: " call back " }, "new"), "call back");
});
