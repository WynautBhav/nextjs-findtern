import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, dollarsToMinor, formProblem, formTotalMinor, issueBody, type FormLine } from "./payroll-form.ts";

const line = (over: Partial<FormLine> = {}): FormLine => ({ key: "salary", label: "Salary", detail: "", amount: "5000", ...over });

test("dollars become whole cents, nothing else is accepted", () => {
  assert.equal(dollarsToMinor("5,000"), 500_000);
  assert.equal(dollarsToMinor("$12.5"), 1250);
  assert.equal(dollarsToMinor("0.07"), 7);
  assert.equal(dollarsToMinor("0"), 0);
  for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5"]) assert.equal(dollarsToMinor(bad), null, bad);
});

test("the total is the sum, with no float drift", () => {
  assert.equal(formTotalMinor([{ amount: "0.10" }, { amount: "0.20" }, { amount: "4,000" }]), 400_030);
});

test("problems are named in words", () => {
  assert.match(formProblem([], "2026-12-07", "2026-11-30") ?? "", /at least one line/);
  assert.match(formProblem([line({ label: " " })], "2026-12-07", "2026-11-30") ?? "", /label/);
  assert.match(formProblem([line({ amount: "x" })], "2026-12-07", "2026-11-30") ?? "", /Salary.*amount/);
  assert.match(formProblem([line({ amount: "0" })], "2026-12-07", "2026-11-30") ?? "", /above \$0/);
  assert.match(formProblem([line()], "2026-11-29", "2026-11-30") ?? "", /before today/);
  assert.equal(formProblem([line()], "2026-12-07", "2026-11-30"), null);
});

test("the due date defaults a week out, across month and year ends", () => {
  assert.equal(addDays("2026-11-30", 7), "2026-12-07");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
});

test("the request body is what the issue route takes", () => {
  const body = issueBody({
    proposalId: "p1", period: { start: "2026-11-01", end: "2026-11-30" }, dueOn: "2026-12-07", note: " ",
    lines: [line({ detail: " 3 h " }), line({ key: "extra", label: " Bonus ", amount: "250.00" })],
  });
  assert.deepEqual(body.lines, [
    { key: "salary", label: "Salary", detail: "3 h", amountMinor: 500_000 },
    { key: "extra", label: "Bonus", amountMinor: 25_000 },
  ]);
  assert.equal("note" in body, false);
});
