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
  // The page maps the row to named fields for the browser; takenDownBy is not one of them.
  const src = read("employer/projects/page.tsx");
  assert.doesNotMatch(src, /takenDownBy/);
  assert.match(src, /rows = found\.map\(\(p\) => \(\{/);
});

// ── Final review #5 / #19 ────────────────────────────────────────────────

function deleteHandler(): string {
  const src = read("api/employer/projects/[id]/route.ts");
  return src.slice(src.indexOf("export async function DELETE("));
}

test("employer cannot delete a taken-down listing (would undo the takedown)", () => {
  const del = deleteHandler();
  const at = del.indexOf("if (project.takenDownAt)");
  assert.ok(at > 0 && at < del.indexOf("db.delete("), "takedown check runs before any delete");
  assert.match(del.slice(at, at + 200), /Findtern took this listing down\. Contact support\.[\s\S]*status: 409/);
});

test("deleting a project also deletes interns' saves of it", () => {
  assert.match(deleteHandler(), /db\.delete\(schema\.internSavedProjects\)\.where\(eq\(schema\.internSavedProjects\.projectId, id\)\)/);
});

test("closing a taken-down listing is not blocked by the keep-one-active rule", () => {
  assert.match(read("api/employer/projects/[id]/route.ts"), /d\.status !== "active" && isProjectOpen\(project\.status, project\.takenDownAt\)/);
});

test("shortlist and interview invites refuse a closed or taken-down project", () => {
  for (const p of ["api/employer/cart/route.ts", "api/employer/[id]/interviews/route.ts"]) {
    const src = read(p);
    assert.match(src, /takenDownAt: schema\.projects\.takenDownAt/, p);
    const at = src.indexOf("if (!isProjectOpen(project.status, project.takenDownAt))");
    assert.ok(at > 0, p);
    assert.match(src.slice(at, at + 200), /status: 409/, p);
  }
});

test("redactForEmployer drops the onboarding edit time", async () => {
  const { redactForEmployer, toCandidateProfile } = await import("../employer-candidates.ts");
  const user = { id: "u1", firstName: "Asha", lastName: "Rao", email: "a@b.c" } as never;
  const profile = toCandidateProfile(user, { extraData: {}, updatedAt: new Date("2026-11-06T09:13:27Z") } as never);
  assert.ok(profile.updatedAt);
  assert.equal(redactForEmployer(profile, false).updatedAt, null);
  assert.ok(redactForEmployer(profile, true).updatedAt, "a hired candidate keeps it");
});
