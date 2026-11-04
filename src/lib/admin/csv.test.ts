import test from "node:test";
import assert from "node:assert/strict";

import { csvFilename } from "./csv.ts";

test("the download name uses the IST day, not UTC", () => {
  assert.equal(csvFilename("interns", new Date("2026-11-03T20:00:00Z")), "interns-2026-11-04.csv");
  assert.equal(csvFilename("interns", new Date("2026-11-04T10:00:00Z")), "interns-2026-11-04.csv");
});
