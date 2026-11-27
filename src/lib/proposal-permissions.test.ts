import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { employerMay, proposalActionRefusal, type ProposalActor, type ProposalAction } from "./proposal-permissions.ts";
import { offerState } from "../components/employer/proposal-state.ts";
import { fullTimeTermsProblem, offerLetterKeyProblem } from "./full-time-offer-terms.ts";

const STATES = ["draft", "sent", "interview_scheduled", "accepted", "processing", "rejected", "withdrawn", "expired", "hired"] as const;
const row = (status: string, over: Record<string, unknown> = {}) => ({ status, hiredAt: status === "hired" ? "2026-11-01" : null, fullTime: false, ...over });
const may = (a: ProposalAction, who: ProposalActor, status: string, over: Record<string, unknown> = {}) => proposalActionRefusal(a, who, row(status, over)) === null;

// 27 Nov (second word from Vaibhav): the employer may withdraw until the hire is paid, even after the candidate accepted
// (internship or full-time). Editing still closes once the candidate answers.
const TABLE: Record<(typeof STATES)[number], [edit: [boolean, boolean], withdraw: [boolean, boolean]]> = {
  //                     edit [employer, admin]   withdraw [employer, admin]
  draft: [[true, true], [true, true]],
  sent: [[true, true], [true, true]],
  interview_scheduled: [[true, true], [true, true]],
  accepted: [[false, true], [true, true]],
  processing: [[false, false], [false, true]],
  rejected: [[false, false], [false, false]],
  withdrawn: [[false, false], [false, false]],
  expired: [[false, false], [false, false]],
  hired: [[false, false], [false, false]],
};

for (const status of STATES) {
  test(`state table: ${status}`, () => {
    const [edit, wd] = TABLE[status];
    assert.deepEqual([may("edit", "employer", status), may("edit", "admin", status)], edit, "edit employer/admin");
    assert.deepEqual([may("withdraw", "employer", status), may("withdraw", "admin", status)], wd, "withdraw employer/admin");
  });
}

test("a full-time offer: editable until the answer, withdrawable until the fee is paid", () => {
  for (const s of ["draft", "sent", "interview_scheduled"]) {
    assert.ok(may("edit", "employer", s, { fullTime: true }), s);
    assert.ok(may("withdraw", "employer", s, { fullTime: true }), s);
  }
  for (const who of ["employer", "admin"] as const) {
    assert.ok(may("withdraw", who, "accepted", { fullTime: true }), `withdraw ${who} accepted, unpaid`);
    assert.ok(!may("withdraw", who, "accepted", { fullTime: true, hiredAt: "2026-11-01" }), `withdraw ${who} accepted, paid`);
    for (const s of ["accepted", "processing", "hired"]) assert.ok(!may("edit", who, s, { fullTime: true }), `edit ${who} ${s}`);
    for (const s of ["processing", "hired"]) assert.ok(!may("withdraw", who, s, { fullTime: true }), `withdraw ${who} ${s}`);
  }
});

test("an expired offer (computed, still stored as sent) is refused with the expiry words", () => {
  assert.match(proposalActionRefusal("edit", "employer", row("sent", { expired: true })) ?? "", /expired/);
  assert.match(proposalActionRefusal("withdraw", "admin", row("sent", { expired: true })) ?? "", /expired/);
});

test("the words for editing an accepted offer tell the employer why and what is still possible", () => {
  assert.match(proposalActionRefusal("edit", "employer", row("accepted")) ?? "", /candidate accepted.*withdraw/);
  assert.equal(proposalActionRefusal("withdraw", "employer", row("accepted")), null);
});

test("the employer screens read the same table: Withdraw but no Edit once accepted and unpaid, with or without a CGPA check open", () => {
  const AHEAD = { startDate: "2099-01-10", fullTime: null };
  for (const gate of [null, { state: "pending" }, { state: "overdue" }, { state: "incorrect_unacked", correctedFrom: "8.1", correctedTo: "7.4" }]) {
    const s = offerState({ status: "accepted", hiredAt: null, gate: gate as never }, AHEAD);
    assert.deepEqual([s.canEdit, s.canWithdraw], [false, true], JSON.stringify(gate));
    assert.doesNotMatch(s.next, /edit the offer/i, s.next);
  }
  for (const fullTime of [null, {}]) {
    const paid = offerState({ status: "accepted", hiredAt: "2026-11-01" }, { startDate: "2099-01-10", fullTime: fullTime as never });
    assert.deepEqual([paid.canEdit, paid.canWithdraw], [false, false], "paid: nothing");
    const unpaid = offerState({ status: "accepted", hiredAt: null }, { startDate: "2099-01-10", fullTime: fullTime as never });
    assert.equal(unpaid.canWithdraw, true, `unpaid ${fullTime ? "full-time" : "internship"}`);
  }
  for (const status of ["draft", "sent", "interview_scheduled"]) {
    const s = offerState({ status, hiredAt: null }, AHEAD);
    assert.deepEqual([s.canEdit, s.canWithdraw], [employerMay("edit", row(status)), employerMay("withdraw", row(status))]);
    assert.deepEqual([s.canEdit, s.canWithdraw], [true, true]);
  }
  const ft = offerState({ status: "sent", hiredAt: null }, { startDate: null, fullTime: {} as never });
  assert.deepEqual([ft.canEdit, ft.canWithdraw], [true, true], "full-time offers can be edited while unanswered");
});

test("both routes and the screens go through the one table", () => {
  const api = join(import.meta.dirname, "../app/api/proposals/[id]");
  const edit = readFileSync(join(api, "route.ts"), "utf8");
  const status = readFileSync(join(api, "status/route.ts"), "utf8");
  assert.match(edit, /proposalActionRefusal\("edit", session\.role/);
  assert.match(status, /proposalActionRefusal\("withdraw", session\.role/);
  assert.doesNotMatch(edit, /const EDITABLE/);
  // An accepted, unpaid withdrawal (either role) goes through the open-order check before it is allowed.
  assert.match(status, /cancelBeforePayment = \(session\.role === "admin" \|\| session\.role === "employer"\)/);
  assert.match(status, /cancelBeforePayment && \(await hasOpenOrderFor/);
});

test("offer letter key: the employer's own, and a PDF (the key's extension comes from the sniffed bytes)", () => {
  const id = "emp-1234";
  assert.equal(offerLetterKeyProblem(`${id}.abcdefghijklmnopqrstuv.pdf`, id), null);
  assert.match(offerLetterKeyProblem(`${id}.abcdefghijklmnopqrstuv.webp`, id) ?? "", /PDF/);
  assert.match(offerLetterKeyProblem(`${id}.abcdefghijklmnopqrstuv.jpg`, id) ?? "", /PDF/);
  assert.match(offerLetterKeyProblem(`${id}.abcdefghijklmnopqrstuv.PNG`, id) ?? "", /PDF/);
  assert.match(offerLetterKeyProblem("other.abcdefghijklmnopqrstuv.pdf", id) ?? "", /again/);
});

test("full-time terms: a changed date is held to the hiring rule, an unchanged one is not; on-site needs a place", () => {
  const now = new Date("2026-11-27T10:00:00+05:30");
  const base = { jobMode: "remote", jobLocationCity: "", jobLocationState: "" };
  assert.match(fullTimeTermsProblem({ ...base, startDate: "2026-11-27" }, now) ?? "", /earliest/i);
  assert.equal(fullTimeTermsProblem({ ...base, startDate: "2026-11-27" }, now, false), null);
  assert.equal(fullTimeTermsProblem(base, now), null);
  assert.match(fullTimeTermsProblem({ ...base, jobMode: "hybrid" }, now) ?? "", /City and state/);
});
