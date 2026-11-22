import { test } from "node:test";
import assert from "node:assert/strict";

import type { MasterRow } from "./master-row.ts";
import { marksOf, overviewModes } from "./overview-modes.ts";

let n = 0;
const row = (over: Partial<MasterRow>): MasterRow => ({
  userId: `u${n++}`, verified: true, name: "A B", email: "a@x.test", phone: null, emergencyContact: null, degree: "BBA", branch: null,
  startYear: null, endYear: null, year: 3, semester: null, linkedin: null, city: null, cgpa: null, professionalCourse: null,
  professionalStatus: null, professionalLevel: null, certifications: null, experience: null, workMode: null, preferredLocations: [],
  laptop: null, lastSeenAt: null, skills: [], hasReport: false, hasRecording: false, english: null, coding: null, aptitude: null,
  aiInterview: null, score: null, offers: 0, offersAccepted: 0, offersRejected: 0, offersOpen: 0, marks10: null, hired: false, ppo: false,
  earningsMinor: 0, ...over,
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
