import { test } from "node:test";
import assert from "node:assert/strict";

const { setupStepFrom } = await import("./employer-setup-step.ts");
const { REQUIRED_COMPANY_FIELDS } = await import("./employer-onboarding.ts");

const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: "fulfilled", value });
const failed: PromiseRejectedResult = { status: "rejected", reason: new Error("projects read failed") };

const complete = Object.fromEntries(REQUIRED_COMPANY_FIELDS.map(([key]) => [key, "filled"]));
const incomplete = { ...complete, [REQUIRED_COMPANY_FIELDS[0][0]]: "" };

test("an incomplete company profile still goes to onboarding when the projects read failed", () => {
  assert.equal(setupStepFrom(ok([incomplete]), failed), "company");
});

test("a missing employer row goes to onboarding when the projects read failed", () => {
  assert.equal(setupStepFrom(ok([]), failed), "company");
});

test("a complete company with a failed projects read is an error, not a verdict", () => {
  assert.throws(() => setupStepFrom(ok([complete]), failed), /projects read failed/);
});

test("a failed company read is an error, not a verdict", () => {
  assert.throws(() => setupStepFrom({ status: "rejected", reason: new Error("employers read failed") }, ok([{ id: "p1" }])), /employers read failed/);
});

test("complete company, no project: the project step", () => {
  assert.equal(setupStepFrom(ok([complete]), ok([])), "project");
});

test("complete company and a project: set up", () => {
  assert.equal(setupStepFrom(ok([complete]), ok([{ id: "p1" }])), null);
});
