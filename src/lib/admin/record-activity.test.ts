import { test } from "node:test";
import assert from "node:assert/strict";

import {
  companyPaymentEntry,
  companySignupEntry,
  documentEntry,
  documentLabels,
  formatAmount,
  hireEntry,
  internPaymentEntry,
  internSignupEntry,
  interviewEntry,
  isoOrNull,
  mergeActivity,
  payoutEntry,
  projectEntry,
  proposalEntry,
  proposalOutcomeEntry,
  reviewEntry,
  timesheetEntries,
  type InterviewRow,
  type ProposalRow,
  type TimesheetRow,
} from "./record-activity-pure.ts";
import type { ActivityEntry } from "./record-activity.types.ts";

const entry = (id: string, at: string): ActivityEntry => ({ id, at, kind: "proposal", actor: null, verb: "did" });

test("mergeActivity sorts newest first and breaks ties by id", () => {
  const out = mergeActivity([
    [entry("b", "2026-11-01T10:00:00Z"), entry("a", "2026-11-01T10:00:00Z")],
    [entry("c", "2026-11-02T10:00:00Z"), entry("z", "2026-10-01T10:00:00Z")],
  ]);
  assert.deepEqual(out.map((e) => e.id), ["c", "a", "b", "z"]);
});

test("mergeActivity drops invalid dates, dedupes by id, and applies the limit", () => {
  const out = mergeActivity(
    [
      [entry("x", "not a date"), entry("y", "2026-11-01T10:00:00Z"), entry("y", "2026-11-02T10:00:00Z")],
      [entry("p", "2026-11-03T10:00:00Z"), entry("q", "2026-11-04T10:00:00Z")],
    ],
    2,
  );
  assert.deepEqual(out.map((e) => e.id), ["q", "p"]);
  assert.deepEqual(mergeActivity([[entry("y", "2026-11-01T10:00:00Z"), entry("y", "2026-11-02T10:00:00Z")]]).map((e) => e.at), ["2026-11-01T10:00:00Z"]);
  assert.deepEqual(mergeActivity([]), []);
  assert.deepEqual(mergeActivity([[entry("a", "2026-11-01T10:00:00Z")]], 0), []);
});

test("isoOrNull and formatAmount", () => {
  assert.equal(isoOrNull(null), null);
  assert.equal(isoOrNull("nope"), null);
  assert.equal(isoOrNull(new Date("2026-11-01T10:00:00Z")), "2026-11-01T10:00:00.000Z");
  assert.ok(formatAmount(500000, "INR").includes("5,000"));
  assert.equal(formatAmount(null, "INR"), "");
  assert.equal(formatAmount(224910, "INR"), "₹2,249.10"); // paise keep both digits
  assert.equal(formatAmount(100040, "USD"), "$1,000.40");
});

const proposal = (extra: Partial<ProposalRow> = {}): ProposalRow => ({
  id: "p1",
  status: "sent",
  internId: "i1",
  internName: "Ira Zug",
  employerId: "e1",
  companyName: "Heavy Data Co",
  projectName: "Data pipeline",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  hiredAt: null,
  ...extra,
});

test("proposalEntry words it by whose page it is, and skips drafts", () => {
  const onIntern = proposalEntry(proposal(), "intern")!;
  assert.equal(onIntern.verb, "received an offer from");
  assert.equal(onIntern.kind, "offer");
  assert.deepEqual(onIntern.actor, { name: "Ira Zug", id: "i1" });
  assert.equal(onIntern.object, "Heavy Data Co");
  assert.equal(onIntern.detail, "Data pipeline");
  assert.equal(onIntern.href, "/admin/companies/e1");
  const onCompany = proposalEntry(proposal(), "company")!;
  assert.equal(onCompany.verb, "sent a proposal to");
  assert.equal(onCompany.kind, "proposal");
  assert.deepEqual(onCompany.actor, { name: "Heavy Data Co", id: "e1" });
  assert.equal(onCompany.object, "Ira Zug");
  assert.equal(proposalEntry(proposal({ status: "draft" }), "intern"), null);
  assert.equal(proposalEntry(proposal({ createdAt: null }), "intern"), null);
});

test("proposalOutcomeEntry words each answer and never invents a from", () => {
  const later = "2026-11-02T10:00:00Z";
  const accepted = proposalOutcomeEntry(proposal({ status: "accepted", updatedAt: later }), "intern")!;
  assert.equal(accepted.verb, "accepted the offer at");
  assert.equal(accepted.object, "Heavy Data Co");
  assert.equal(accepted.change ?? null, null);
  const onCompany = proposalOutcomeEntry(proposal({ status: "accepted", updatedAt: later }), "company")!;
  assert.equal(onCompany.verb, "accepted the proposal for");
  assert.equal(onCompany.object, "Data pipeline");
  assert.equal(onCompany.detail, undefined);
  assert.equal(proposalOutcomeEntry(proposal({ status: "rejected", updatedAt: later }), "intern")!.verb, "declined the offer from");
  const withdrawn = proposalOutcomeEntry(proposal({ status: "withdrawn", updatedAt: later }), "intern")!;
  assert.equal(withdrawn.verb, "withdrew the offer to");
  assert.equal(withdrawn.actor?.name, "Heavy Data Co");
  assert.equal(withdrawn.object, "Ira Zug");
  assert.equal(proposalOutcomeEntry(proposal({ status: "expired", updatedAt: later }), "intern")!.verb, "had an offer expire from");
  // still open, or untouched since it was sent: nothing to say
  assert.equal(proposalOutcomeEntry(proposal({ status: "sent", updatedAt: later }), "intern"), null);
  assert.equal(proposalOutcomeEntry(proposal({ status: "accepted" }), "intern"), null);
});

test("hireEntry needs hiredAt", () => {
  assert.equal(hireEntry(proposal(), "intern"), null);
  const row = proposal({ status: "hired", hiredAt: "2026-11-03T10:00:00Z" });
  const a = hireEntry(row, "intern")!;
  assert.equal(a.verb, "was hired by");
  assert.equal(a.kind, "hire");
  assert.equal(a.object, "Heavy Data Co");
  const b = hireEntry(row, "company")!;
  assert.equal(b.verb, "hired");
  assert.equal(b.actor?.name, "Heavy Data Co");
  assert.equal(b.object, "Ira Zug");
});

const interview = (status: string): InterviewRow => ({
  id: "v1",
  status,
  internId: "i1",
  internName: "Ira Zug",
  employerId: "e1",
  companyName: "Heavy Data Co",
  projectName: null,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-02T10:00:00Z",
});

test("interviewEntry words each status and skips the unknown", () => {
  assert.equal(interviewEntry(interview("pending"), "intern")!.verb, "was invited to interview by");
  assert.equal(interviewEntry(interview("pending"), "intern")!.at, "2026-11-01T10:00:00.000Z");
  assert.equal(interviewEntry(interview("pending"), "company")!.verb, "asked for an interview with");
  assert.equal(interviewEntry(interview("scheduled"), "intern")!.verb, "scheduled an interview with");
  assert.equal(interviewEntry(interview("scheduled"), "intern")!.at, "2026-11-02T10:00:00.000Z");
  assert.equal(interviewEntry(interview("completed"), "intern")!.verb, "completed an interview with");
  const missed = interviewEntry(interview("missed"), "company")!;
  assert.equal(missed.verb, "missed an interview for");
  assert.equal(missed.actor?.name, "Ira Zug");
  assert.equal(missed.object, "a project");
  assert.equal(interviewEntry(interview("admin"), "intern"), null);
});

const sheet = (extra: Partial<TimesheetRow> = {}): TimesheetRow => ({
  id: "t1",
  internId: "i1",
  internName: "Ira Zug",
  employerId: "e1",
  companyName: "Heavy Data Co",
  projectName: "Data pipeline",
  periodStart: "2026-10-01T00:00:00Z",
  periodEnd: "2026-10-31T00:00:00Z",
  submittedAt: "2026-11-01T10:00:00Z",
  approvedAt: null,
  rejectedAt: null,
  ...extra,
});

test("timesheetEntries: submitted, then approved with a real change", () => {
  const [submitted] = timesheetEntries(sheet(), "intern");
  assert.equal(submitted.verb, "submitted a timesheet for");
  assert.equal(submitted.object, "Heavy Data Co");
  assert.equal(submitted.detail, "Data pipeline · 2026-10-01 to 2026-10-31");
  assert.equal(submitted.change ?? null, null);

  const both = timesheetEntries(sheet({ approvedAt: "2026-11-02T10:00:00Z" }), "intern");
  assert.equal(both.length, 2);
  assert.equal(both[1].verb, "had a timesheet approved by");
  assert.deepEqual(both[1].change, { from: "Submitted", to: "Approved" });

  const company = timesheetEntries(sheet({ approvedAt: "2026-11-02T10:00:00Z" }), "company");
  assert.equal(company[0].object, "Data pipeline");
  assert.equal(company[1].verb, "approved a timesheet from");
  assert.equal(company[1].actor?.name, "Heavy Data Co");

  // approved without a recorded submission: no invented "from"
  const noSubmit = timesheetEntries(sheet({ submittedAt: null, approvedAt: "2026-11-02T10:00:00Z" }), "intern");
  assert.equal(noSubmit.length, 1);
  assert.equal(noSubmit[0].change ?? null, null);

  const rejected = timesheetEntries(sheet({ rejectedAt: "2026-11-02T10:00:00Z" }), "intern")[1];
  assert.deepEqual(rejected.change, { from: "Submitted", to: "Rejected" });
  assert.equal(timesheetEntries(sheet({ submittedAt: null }), "intern").length, 0);
});

test("payments and payouts need paidAt and carry no identifiers beyond the invoice", () => {
  const row = { id: "x1", amountMinor: 500000, currency: "INR", invoiceNumber: "021126-124", paidAt: "2026-11-02T10:00:00Z" };
  const who = { internId: "i1", internName: "Ira Zug" };
  const payout = payoutEntry(row, who)!;
  assert.equal(payout.verb, "was paid");
  assert.equal(payout.kind, "payout");
  assert.ok(payout.object?.includes("5,000"));
  assert.equal(payout.detail, "Stipend payout");
  assert.equal(payoutEntry({ ...row, paidAt: null }, who), null);
  const fee = internPaymentEntry(row, who)!;
  assert.equal(fee.verb, "paid the platform fee");
  assert.equal(fee.detail, "Invoice 021126-124");
  const order = companyPaymentEntry(row, { employerId: "e1", companyName: "Heavy Data Co" })!;
  assert.equal(order.verb, "paid");
  assert.deepEqual(order.actor, { name: "Heavy Data Co", id: "e1" });
  assert.equal(order.detail, "Invoice 021126-124");
  assert.equal(companyPaymentEntry({ ...row, invoiceNumber: null }, { employerId: "e1", companyName: null })!.detail, undefined);
  assert.equal(companyPaymentEntry({ ...row, invoiceNumber: null }, { employerId: "e1", companyName: null })!.actor?.name, "Company");
});

test("documentEntry lists kinds, never file names, and skips when there are none", () => {
  const row = { id: "d1", hasPhoto: true, hasVideo: false, hasIdentity: true, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-05T10:00:00Z" };
  assert.deepEqual(documentLabels(row), ["profile photo", "identity documents"]);
  const e = documentEntry(row, { internId: "i1", internName: "Ira Zug" })!;
  assert.equal(e.verb, "uploaded");
  assert.equal(e.object, "profile photo, identity documents");
  assert.equal(e.at, "2026-10-05T10:00:00.000Z");
  assert.equal(documentEntry({ ...row, hasPhoto: false, hasIdentity: false }, { internId: "i1", internName: null }), null);
});

test("reviewEntry only when approved and dated; null actor name falls back", () => {
  const base = { internId: "i1", internName: null, status: "Approved", approvedAt: "2026-11-01T10:00:00Z", approvedBy: "auto:score" };
  const e = reviewEntry(base)!;
  assert.equal(e.verb, "was approved");
  assert.equal(e.actor?.name, "Candidate");
  assert.ok(e.detail?.startsWith("Automatically"));
  assert.equal(reviewEntry({ ...base, status: "Rejected" }), null);
  assert.equal(reviewEntry({ ...base, approvedAt: null }), null);
  assert.equal(reviewEntry({ ...base, approvedBy: null })!.detail, undefined);
});

test("signup and project entries", () => {
  assert.equal(internSignupEntry({ id: "i1", name: "Ira Zug", createdAt: "2026-10-01T00:00:00Z" })!.verb, "signed up");
  assert.equal(internSignupEntry({ id: "i1", name: "Ira Zug", createdAt: null }), null);
  assert.equal(companySignupEntry({ id: "e1", companyName: "Heavy Data Co", createdAt: "2026-10-01T00:00:00Z" })!.kind, "signup");
  const p = projectEntry({ id: "pr1", projectName: "Data pipeline", employerId: "e1", companyName: "Heavy Data Co", createdAt: "2026-10-02T00:00:00Z" })!;
  assert.equal(p.verb, "posted a project");
  assert.equal(p.object, "Data pipeline");
  assert.equal(p.kind, "project");
  assert.equal(projectEntry({ id: "pr1", projectName: "x", employerId: "e1", companyName: null, createdAt: "bad" }), null);
});
