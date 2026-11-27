import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { classifyTypedCode } from "./identity-match.ts";
import { COLLEGE_CODE_RETIRED, collegeCodeRetiredProblem } from "../promo-rules.ts";

/**
 * Bug sheet 27 Nov, item 8: the college's shared seat code ("legacy code") is retired. A student can no longer join or
 * pay with it; roster (personal drive) codes still work; the TPO no longer sees the code.
 */
const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a college-bound promo row is refused for a student with the plain retirement message", () => {
  assert.equal(collegeCodeRetiredProblem("college-1", "intern"), COLLEGE_CODE_RETIRED);
  assert.match(COLLEGE_CODE_RETIRED, /no longer used.*personal code/i);
});

test("an ordinary promo (no college) is not affected", () => {
  assert.equal(collegeCodeRetiredProblem(null, "intern"), null);
  assert.equal(collegeCodeRetiredProblem(undefined, "intern"), null);
  assert.equal(collegeCodeRetiredProblem(null, "employer"), null);
});

test("roster codes still classify as drive codes, so they take the unchanged redeem path", () => {
  assert.deepEqual(classifyTypedCode("abcd-efgh-jkmn"), { kind: "drive", code: "ABCD-EFGH-JKMN" });
  // The legacy seat code is an 8-character promo shape: it reaches the promo branch, which now refuses it.
  assert.equal(classifyTypedCode("NMQA8N3C")?.kind, "promo");
});

test("every way to redeem a promo goes through quotePromo, which refuses the college code before any seat is taken", () => {
  const promo = strip(read("lib/promo.ts"));
  const q = promo.slice(promo.indexOf("export async function quotePromo("));
  assert.ok(q.includes("collegeCodeRetiredProblem(row.collegeId, audience)"), "quotePromo asks the retirement rule");
  assert.ok(q.indexOf("collegeCodeRetiredProblem(") < q.indexOf("promoProblem(row"), "before the cap and discount maths");
});

test("the student's code field shows the retirement message, not the one generic failure", () => {
  const lib = strip(read("lib/college/promo-redeem.ts"));
  const promoBranch = lib.slice(lib.indexOf("const fee = await getInternActivationFeeMinor()"));
  assert.ok(promoBranch.includes("COLLEGE_CODE_RETIRED"));
  assert.ok(promoBranch.indexOf("COLLEGE_CODE_RETIRED") < promoBranch.indexOf("openOrder("), "refused before any order or seat");
  // The roster-code branch is untouched.
  assert.ok(lib.includes("redeemForStudent({"));
});

test("the placement office no longer sees the legacy code on the Dashboard or Seats", () => {
  for (const p of ["app/college/page.tsx", "app/college/seats/page.tsx"]) {
    const src = read(p);
    assert.ok(!/Legacy code/i.test(src), `${p} still prints the legacy code block`);
    assert.ok(!/seat\.code/.test(src), `${p} still reads the seat code`);
    assert.ok(!/schema\.promoCodes\.code/.test(src), `${p} still selects the code`);
  }
});
