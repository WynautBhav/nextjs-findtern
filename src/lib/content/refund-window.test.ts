import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The refund window is 12 months; report range labels ("Last 18 months") are a different thing.
test("no 18-month refund window copy under src/", () => {
  let out = "";
  try {
    out = execFileSync("grep", ["-rniE", "18[ -]month|eighteen month|5,000 ?[–-] ?12,000", "src", "--exclude=*.test.ts"], { encoding: "utf8" });
  } catch {
    /* grep exits 1 with no match */
  }
  const hits = out.split("\n").filter((l) => l && !/Last 18 months|last 18 months|analytics-load/.test(l));
  assert.deepEqual(hits, []);
});
