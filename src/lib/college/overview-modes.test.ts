import { test } from "node:test";
import assert from "node:assert/strict";

import type { MasterRow } from "./master-row.ts";
import { marksOf, overviewModes } from "./overview-modes.ts";
import { matchesOutcome } from "./master-row.ts";

let n = 0;
const row = (over: Partial<MasterRow>): MasterRow => ({
  userId: `u${n++}`, verified: true, name: "A B", email: "a@x.test", phone: null, emergencyContact: null, degree: "BBA", branch: null,
  startYear: null, endYear: null, year: 3, semester: null, linkedin: null, city: null, cgpa: null, professionalCourse: null,
  professionalStatus: null, professionalLevel: null, certifications: null, experience: null, workMode: null, preferredLocations: [],
  laptop: null, lastSeenAt: null, skills: [], hasReport: false, hasRecording: false, english: null, coding: null, aptitude: null,
  aiInterview: null, score: null, offers: 0, offersAccepted: 0, offersRejected: 0, offersOpen: 0, marks10: null, hired: false, ppo: false,
  earningsMinor: 0, meetings: { total: 0, done: 0, notAccepted: 0, upcoming: 0, waiting: 0 }, openToWork: true, ...over,
});

const rows = [
  row({ degree: "B.Tech", score: 8.4, marks10: 9.1, offers: 3, offersAccepted: 1, offersRejected: 1, offersOpen: 0, hired: true, ppo: true }),
  row({ degree: "B.Tech", score: 6.0, marks10: 6.0, offers: 1, offersOpen: 1 }),
  row({ degree: "BBA", score: 5.9, marks10: 3.9, year: 2 }),
  row({ degree: "BBA", score: null, marks10: null }),
  row({ verified: false, degree: "BBA", score: 9, offers: 5 }),
];

test("bands follow the published cut-offs: 6.0 is Cappuccino, 8.0 Latte; marks 4, 6 and 8 start a band", () => {
  const { categories } = overviewModes(rows);
  assert.deepEqual(categories.coffee.map((b) => [b.name, b.students]), [["Espresso", 1], ["Cappuccino", 1], ["Latte", 1]]);
  assert.deepEqual([marksOf(3.99), marksOf(4), marksOf(6), marksOf(8)], ["foundation", "rising", "strong", "top"]);
});

test("every part adds up to its whole, and unverified students are left out", () => {
  const { categories, placement } = overviewModes(rows);
  assert.equal(categories.students, 4);
  assert.equal(categories.interviewed, 3);
  assert.equal(categories.degrees.reduce((t, d) => t + d.students, 0), categories.students);
  assert.equal(categories.years.reduce((t, y) => t + y.students, 0), categories.students);
  assert.equal(categories.coffee.reduce((t, b) => t + b.students, 0), categories.interviewed);
  assert.equal(categories.marks.reduce((t, b) => t + b.students, 0) + categories.marksMissing, categories.students);
  const o = placement.offers;
  assert.equal(o.received, 4);
  assert.equal(o.accepted + o.rejected + o.notAnswered + o.withdrawn, o.received);
  assert.equal(o.withdrawn, 1);
  assert.deepEqual([placement.withOffer, placement.internships, placement.ppo], [2, 1, 1]);
  assert.equal(placement.coffee.find((b) => b.key === "latte")?.hired, 1);
});

test("meetings: every part adds up to the total, unverified students are left out", () => {
  const m = overviewModes([
    row({ meetings: { total: 5, done: 2, notAccepted: 1, upcoming: 1, waiting: 0 } }),
    row({ meetings: { total: 2, done: 0, notAccepted: 2, upcoming: 0, waiting: 0 } }),
    row({ verified: false, meetings: { total: 9, done: 9, notAccepted: 0, upcoming: 0, waiting: 0 } }),
  ]).placement.meetings;
  assert.deepEqual(m, { total: 7, done: 2, notAccepted: 3, upcoming: 1, waiting: 0, other: 1, students: 2 });
  assert.equal(m.done + m.notAccepted + m.upcoming + m.waiting + m.other, m.total);
});

test("outcome filters pick the students behind each Sankey block and meeting part", () => {
  const a = row({ score: 7, offers: 3, offersAccepted: 1, offersRejected: 1, offersOpen: 0, meetings: { total: 1, done: 1, notAccepted: 0, upcoming: 0, waiting: 0 } });
  const b = row({ score: 7, offers: 0, meetings: { total: 1, done: 0, notAccepted: 1, upcoming: 0, waiting: 0 } });
  const c = row({ score: null, offers: 0 });
  const pick = (k: Parameters<typeof matchesOutcome>[1]) => [a, b, c].filter((r) => matchesOutcome(r, k)).map((r) => r.userId);
  assert.deepEqual(pick("accepted"), [a.userId]);
  assert.deepEqual(pick("rejected"), [a.userId]);
  assert.deepEqual(pick("withdrawn"), [a.userId]);
  assert.deepEqual(pick("open"), []);
  assert.deepEqual(pick("no-offer"), [b.userId]);
  assert.deepEqual(pick("met"), [a.userId]);
  assert.deepEqual(pick("not-accepted"), [b.userId]);
  assert.deepEqual(pick(""), [a.userId, b.userId, c.userId]);
});
