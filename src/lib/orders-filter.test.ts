import { test } from "node:test";
import assert from "node:assert/strict";

import { filterHires, matchesQuery } from "./orders-filter.ts";

const hires = [
  { candidateName: "Asha Rao", projectName: "Mobile App" },
  { candidateName: "Ben Carter", projectName: "Brand Refresh" },
  { candidateName: "Asha Menon", projectName: "Brand Refresh" },
];

test("a blank or whitespace query keeps every hire", () => {
  assert.equal(filterHires(hires, "").length, 3);
  assert.equal(filterHires(hires, "   ").length, 3);
});

test("matches candidate name, case-insensitively", () => {
  assert.deepEqual(filterHires(hires, "ASHA").map((h) => h.candidateName), ["Asha Rao", "Asha Menon"]);
});

test("matches project name", () => {
  assert.deepEqual(filterHires(hires, "brand").map((h) => h.candidateName), ["Ben Carter", "Asha Menon"]);
});

test("every word must match, across candidate and project", () => {
  assert.deepEqual(filterHires(hires, "asha brand").map((h) => h.candidateName), ["Asha Menon"]);
  assert.equal(filterHires(hires, "ben mobile").length, 0);
});

test("does not mutate or alias the input", () => {
  const out = filterHires(hires, "");
  assert.notEqual(out, hires);
  assert.equal(hires.length, 3);
});

test("diacritics fold on both sides: 'jose' finds 'José' and vice versa", () => {
  const rows = [{ candidateName: "José Álvarez", projectName: "Web" }];
  assert.equal(filterHires(rows, "jose alvarez").length, 1);
  assert.equal(filterHires([{ candidateName: "Jose", projectName: "Web" }], "JOSÉ").length, 1);
});

test("the 'Project' placeholder is not searchable, but roleTitle is", () => {
  const rows = [
    { candidateName: "Asha", projectName: "Project", roleTitle: "Designer" },
    { candidateName: "Ben", projectName: "Real Project", roleTitle: "Engineer" },
  ];
  assert.deepEqual(filterHires(rows, "project").map((h) => h.candidateName), ["Ben"]);
  assert.deepEqual(filterHires(rows, "designer").map((h) => h.candidateName), ["Asha"]);
});

test("matchesQuery needs every word, across fields, ignoring empty fields", () => {
  assert.equal(matchesQuery("inr 2026", ["FT/1", "INR", null, "2026-10-01"]), true);
  assert.equal(matchesQuery("usd 2026", ["FT/1", "INR", "2026-10-01"]), false);
  assert.equal(matchesQuery("  ", []), true);
});
