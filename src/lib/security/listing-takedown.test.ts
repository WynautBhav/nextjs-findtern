import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(import.meta.dirname, "../../app");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

// No DB route harness here, so these pin the wiring the review found missing.

test("proposals route reads takenDownAt and answers 409 for a taken-down listing", () => {
  const src = read("api/employer/[id]/proposals/route.ts");
  assert.match(src, /takenDownAt: schema\.projects\.takenDownAt/);
  assert.match(src, /isProjectOpen\(project\.status, project\.takenDownAt\)/);
  assert.match(src, /Findtern took this listing down\. Pick another project\./);
  const at = src.indexOf("Findtern took this listing down");
  assert.match(src.slice(at, at + 120), /status: 409/);
});

test("pages that offer open projects to an employer skip taken-down ones", () => {
  assert.match(read("employer/send-proposal/page.tsx"), /isProjectOpen\(row\.status, row\.takenDownAt\)/);
  assert.match(read("employer/send-proposal/page.tsx"), /takenDownAt: schema\.projects\.takenDownAt/);
  assert.match(read("employer/dashboard/page.tsx"), /isProjectOpen\(p\.status, p\.takenDownAt\)/);
  for (const p of ["employer/candidates/_query.ts", "employer/compare/page.tsx"]) {
    assert.match(read(p), /isOpenProject\(p\.status, p\.takenDownAt\)/, p);
  }
  assert.match(read("employer/intern/[id]/page.tsx"), /isOpenProject\(row\.status, row\.takenDownAt\)/);
});

test("keep-one-active rule does not count a taken-down listing as live", () => {
  assert.match(read("api/employer/projects/[id]/route.ts"), /isNull\(schema\.projects\.takenDownAt\)/);
});

test("employer projects page never sends takenDownBy to the browser", () => {
  const src = read("employer/projects/page.tsx");
  assert.match(src, /takenDownBy: _adminId/);
  assert.doesNotMatch(src, /\.select\(\)\s*\.from\(schema\.projects\)/);
});
