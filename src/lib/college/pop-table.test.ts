import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "../admin/csv.ts";
import {
  EMPLOYER_COLUMNS,
  NO_EMPLOYER_FILTERS,
  NO_STUDENT_FILTERS,
  STUDENT_COLUMNS,
  buildPeople,
  csvColumnsFor,
  filterEmployers,
  filterStudents,
  nextSort,
  slugify,
  sortRows,
  toStudentTableRow,
  type EmployerTableRow,
  type StudentColKey,
  type StudentTableRow,
} from "./pop-table.ts";

const band = (s: number) => (s >= 8 ? { key: "latte", name: "Latte" } : s >= 6 ? { key: "cappuccino", name: "Cappuccino" } : { key: "espresso", name: "Espresso" });
const people = buildPeople({
  students: [
    { userId: "a", email: "asha@x.edu", cgpa: 8.2, score: 8.4 },
    { userId: "b", email: "=cmd@x.edu", cgpa: null, score: null },
    { userId: "c", email: null, cgpa: 6.5, score: 5.1 },
  ],
  minutes: new Map([["a", 95]]),
  offers: [
    { userId: "a", company: "Acme" },
    { userId: "a", company: " Beta " },
  ],
  meets: [
    { userId: "a", company: "Acme" },
    { userId: "c", company: null },
  ],
  hiredIds: ["a"],
});
const item = (userId: string, name: string, extra: Partial<StudentTableRow> = {}) => ({ userId, name, rollNo: `R-${userId}`, year: 3, branch: "CSE", phone: "98 7654 3210", detail: "", ...extra });
const rows = [item("a", "Asha"), item("b", "=Bhavna", { branch: "ECE", year: 2, openToWork: false, phone: null }), item("c", "Chirag", { year: null, branch: null })].map((r) => toStudentTableRow(r, people[r.userId], band));

test("buildPeople: offers counted one by one, companies deduped and trimmed, minutes null when not recorded", () => {
  assert.deepEqual(people.a, { email: "asha@x.edu", cgpa: 8.2, score: 8.4, minutes: 95, offers: 2, hired: true, companies: ["Acme", "Beta"], offerType: "Internship" });
  assert.equal(people.b.minutes, 0);
  assert.equal(people.c.offers, 0);
  assert.deepEqual(people.c.companies, []);
  const none = buildPeople({ students: [{ userId: "a", email: null, cgpa: null, score: null }], minutes: null, offers: [], meets: [], hiredIds: [] });
  assert.equal(none.a.minutes, null);
  assert.equal(none.a.email, null);
});

test("a student the pop-up knows nothing about reads as missing, not zero", () => {
  const r = toStudentTableRow(item("z", "Zed"), undefined, band);
  assert.equal(r.cgpa, null);
  assert.equal(r.band, null);
  assert.equal(r.minutes, null);
  assert.equal(r.hired, false);
});

test("filters: search over name, phone digits and email (never the roll no); branch, year, band, company, open, hired", () => {
  const ids = (f: Partial<typeof NO_STUDENT_FILTERS>) => filterStudents(rows, { ...NO_STUDENT_FILTERS, ...f }).map((r) => r.userId);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ q: "asha" }), ["a"]);
  // Roll numbers are not a Findtern field: search does not match them.
  assert.deepEqual(ids({ q: "r-c" }), []);
  assert.deepEqual(ids({ q: "9876543210" }), ["a", "c"]);
  assert.deepEqual(ids({ q: "cmd@x" }), ["b"]);
  assert.deepEqual(ids({ branch: "CSE" }), ["a"]);
  assert.deepEqual(ids({ year: "2" }), ["b"]);
  assert.deepEqual(ids({ band: "latte" }), ["a"]);
  assert.deepEqual(ids({ band: "none" }), ["b"]);
  assert.deepEqual(ids({ company: "Beta" }), ["a"]);
  assert.deepEqual(ids({ open: "no" }), ["b"]);
  assert.deepEqual(ids({ open: "yes" }), ["a", "c"]);
  assert.deepEqual(ids({ hired: "yes" }), ["a"]);
  assert.deepEqual(ids({ hired: "no", band: "espresso" }), ["c"]);
});

test("sort: asc, desc, then the pop-up's own order; missing values last either way", () => {
  assert.equal(nextSort<StudentColKey>(null, "cgpa")?.dir, "asc");
  assert.equal(nextSort<StudentColKey>({ key: "cgpa", dir: "asc" }, "cgpa")?.dir, "desc");
  assert.equal(nextSort<StudentColKey>({ key: "cgpa", dir: "desc" }, "cgpa"), null);
  assert.equal(nextSort<StudentColKey>({ key: "cgpa", dir: "desc" }, "name")?.dir, "asc");
  const order = (dir: "asc" | "desc") => sortRows(rows, STUDENT_COLUMNS, { key: "cgpa", dir }).map((r) => r.userId);
  assert.deepEqual(order("asc"), ["c", "a", "b"]);
  assert.deepEqual(order("desc"), ["a", "c", "b"]);
  assert.deepEqual(sortRows(rows, STUDENT_COLUMNS, null).map((r) => r.userId), ["a", "b", "c"]);
});

test("CSV: visible columns only, in table order, formula cells neutralised, quotes doubled", () => {
  const csv = toCsv(rows, csvColumnsFor(STUDENT_COLUMNS, new Set<StudentColKey>(["email", "name", "companies", "year", "minutes", "hired"])));
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Name,Year,Email,Time online in the drive (minutes),Companies,Hired");
  assert.equal(lines[1], "Asha,3rd year,asha@x.edu,95,Acme; Beta,Yes");
  assert.equal(lines[2], "'=Bhavna,2nd year,'=cmd@x.edu,0,,No");
  assert.equal(lines[3], "Chirag,,,0,,No");
  const quoted = toCsv([{ ...rows[0], name: 'Asha "AK", Rao' }], csvColumnsFor(STUDENT_COLUMNS, new Set<StudentColKey>(["name"])));
  assert.ok(quoted.includes('"Asha ""AK"", Rao"'));
});

const emp = (key: string, company: string, extra: Partial<EmployerTableRow> = {}): EmployerTableRow => ({
  key,
  employerId: key,
  company,
  contact: "Ria",
  phone: "+91 99999 11111",
  email: `hr@${key}.com`,
  invited: true,
  joinedAt: new Date("2026-11-20T09:35:00Z"),
  status: { kind: "came" },
  meetings: 3,
  offers: 2,
  hires: 1,
  minutes: 40,
  ...extra,
});
const emps = [emp("acme", "Acme"), emp("beta", "Beta", { invited: false }), emp("missing-0", "Gamma", { employerId: null, joinedAt: null, contact: null, phone: null, meetings: 0, offers: 0, hires: 0, minutes: null })];

test("company filters: search, came or not, invited or not", () => {
  const ids = (f: Partial<typeof NO_EMPLOYER_FILTERS>) => filterEmployers(emps, { ...NO_EMPLOYER_FILTERS, ...f }).map((r) => r.key);
  assert.deepEqual(ids({ q: "gamma" }), ["missing-0"]);
  assert.deepEqual(ids({ q: "hr@beta" }), ["beta"]);
  assert.deepEqual(ids({ came: "didnt" }), ["missing-0"]);
  assert.deepEqual(ids({ came: "came", invited: "no" }), ["beta"]);
});

test("company CSV: IST time, dash-free blanks for a company that never came, honest zero for one that did", () => {
  const csv = toCsv(emps, csvColumnsFor(EMPLOYER_COLUMNS, new Set(["company", "came", "joinedAt", "offers"] as const)));
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Company,Came,Joined at (IST),Offers");
  assert.equal(lines[1], "Acme,Came,2026-11-20 15:05,2");
  assert.equal(lines[3], "Gamma,Didn't come,,");
  const sorted = sortRows(emps, EMPLOYER_COLUMNS, { key: "offers", dir: "desc" }).map((r) => r.key);
  assert.deepEqual(sorted, ["acme", "beta", "missing-0"]);
});

test("slugify: title and drive into a safe file name", () => {
  assert.equal(slugify("Hired", "Poornima Buildathon 2026 / Round 1"), "hired-poornima-buildathon-2026-round-1");
  assert.equal(slugify("Offers declined", "Café Drive"), "offers-declined-cafe-drive");
  assert.equal(slugify("../../etc", ""), "etc");
  assert.equal(slugify("", ""), "drive");
  assert.ok(slugify("x".repeat(300)).length <= 80);
});

test("phones keep a readable form in the CSV, without the formula guard's quote", async () => {
  const { phoneCsv } = await import("./pop-table.ts");
  const { csvCell } = await import("../admin/csv.ts");
  assert.equal(phoneCsv("+91 9829000201"), "(+91) 9829000201");
  assert.equal(csvCell(phoneCsv("+91 9829000201")), "(+91) 9829000201");
  assert.equal(phoneCsv(null), null);
  // Not a phone: left alone, so csv.ts still neutralises it.
  assert.equal(csvCell(phoneCsv("+SUM(A1)")), "'+SUM(A1)");
});

test("offer type: full-time, internship or both, and the Offer type filter", async () => {
  const { offerTypeOf } = await import("./pop-table.ts");
  assert.equal(offerTypeOf([]), null);
  assert.equal(offerTypeOf([{ fullTime: true }]), "Full-time / PPO");
  assert.equal(offerTypeOf([{ fullTime: false }, { fullTime: false }]), "Internship");
  assert.equal(offerTypeOf([{ fullTime: true }, { fullTime: false }]), "Both");
  const typed = [item("f", "Full", { offerType: "Full-time / PPO" }), item("i", "Intern", { offerType: "Internship" }), item("x", "Both", { offerType: "Both" }), item("n", "None", { offerType: null })] as StudentTableRow[];
  const ids = (type: "full" | "intern") => filterStudents(typed, { ...NO_STUDENT_FILTERS, type }).map((r) => r.userId);
  assert.deepEqual(ids("full"), ["f", "x"]);
  assert.deepEqual(ids("intern"), ["i", "x"]);
});
