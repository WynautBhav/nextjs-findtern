import { test } from "node:test";
import assert from "node:assert/strict";

import { filterHires } from "./orders-filter.ts";

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
