import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The old intern-terms stipend range, in any spacing, dash (en, em, minus, hyphen) or "to", with or without the second ₹.
// Alternation, not a bracket, so it also works when grep runs in a non-UTF-8 locale.
const OLD_RANGE = "5,000[[:space:]]*(–|—|−|-|to)[[:space:]]*(₹)?[[:space:]]*12,000";
// Split props too: <Figure value={18} suffix=" months" /> or months={18}, where the number and the unit sit apart.
const SPLIT_PROPS = "(value|months|window|duration)=\\{18\\}";
const PATTERN = `18[ -]month|eighteen month|${SPLIT_PROPS}|${OLD_RANGE}`;

function grep(args: string[], input?: string): string {
  try {
    return execFileSync("grep", args, { encoding: "utf8", input });
  } catch {
    return ""; // grep exits 1 with no match
  }
}

// The refund window is 12 months; report range labels ("Last 18 months") are a different thing.
test("no 18-month refund window copy under src/", () => {
  const out = grep(["-rniE", PATTERN, "src", "--exclude=*.test.ts"]);
  const hits = out.split("\n").filter((l) => l && !/Last 18 months|last 18 months|analytics-load/.test(l));
  assert.deepEqual(hits, []);
});

test("the guard pattern catches the original stipend range and its spacing and dash variants", () => {
  for (const text of [
    "₹5,000 – ₹12,000",
    "₹5,000–₹12,000",
    "₹5,000 - ₹12,000",
    "₹5,000-12,000",
    "₹5,000 — ₹12,000",
    "₹5,000 − 12,000",
    "5,000 to ₹12,000",
    "₹5,000  –  ₹ 12,000",
    "within 18 months",
    "18-month lock-in",
    '<Figure value={18} suffix=" months" label="Placement window" />',
    "<Plan months={18} />",
  ]) {
    assert.notEqual(grep(["-iE", PATTERN], `${text}\n`), "", `should match: ${text}`);
  }
  for (const text of ["₹5,000 hiring charge", "Last 12 months", "₹12,000 a year", '<Figure value={12} suffix=" months" />']) {
    assert.equal(grep(["-iE", PATTERN], `${text}\n`), "", `should not match: ${text}`);
  }
});
