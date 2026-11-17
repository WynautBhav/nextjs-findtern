import assert from "node:assert/strict";
import test from "node:test";

import type { Candidate } from "../skill-match.ts";
import { studentsForSkill } from "../skill-match.ts";
import { withLiveCounts as withCounts } from "./featured-counts.ts";

const live = (p: Candidate[], title: string) => studentsForSkill(p, title).length;
const withLiveCounts = <T extends { title: string; resourceCount: number }>(r: T[], p: Candidate[] | null, count = live) => withCounts(r, p, count);

const cand = (skills: string[]): Candidate => ({
  id: "", initials: "AB", shortName: "Candidate AB", score: 7, band: "Cappuccino",
  college: "", degree: "", city: "", state: "", skills, ratings: {}, available: true,
});
const pool = [cand(["Sales", "Cold Calling"]), cand(["Salesforce"]), cand(["React"])];
const rows = [
  { title: "Sales", resourceCount: 73 },
  { title: "Healthcare", resourceCount: 2 },
];

test("the stored hand-typed count is replaced by the live bench size", () => {
  assert.deepEqual(withLiveCounts(rows, pool).map((r) => r.resourceCount), [2, 0]);
});

test("the input rows are left as they were", () => {
  withLiveCounts(rows, pool);
  assert.deepEqual(rows.map((r) => r.resourceCount), [73, 2]);
});

test("no candidate data (query failed): every row keeps its stored number", () => {
  assert.deepEqual(withLiveCounts(rows, null).map((r) => r.resourceCount), [73, 2]);
});

test("one row that cannot be counted keeps its stored number; the rest stay live", () => {
  const out = withLiveCounts(rows, pool, (p, title) => {
    if (title === "Sales") throw new Error("bad skill name");
    return 5;
  });
  assert.deepEqual(out.map((r) => r.resourceCount), [73, 5]);
});
