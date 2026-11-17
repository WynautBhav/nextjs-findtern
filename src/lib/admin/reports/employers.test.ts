import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPANY_PAGE_SIZE, companyProposalBuckets, demandSupplyGap, lifecycleCounts, normSkill, parseCompanyFilter } from "./employers.ts";

test("lifecycleCounts: legacy 'active' and a blank status are published; inactive is paused; archived is closed", () => {
  const c = lifecycleCounts([
    { status: "published", n: 3 },
    { status: "active", n: 4 },
    { status: null, n: 1 },
    { status: "", n: 1 },
    { status: "paused", n: 2 },
    { status: "inactive", n: 1 },
    { status: "draft", n: 5 },
    { status: "pending_review", n: 1 },
    { status: "rejected", n: 1 },
    { status: "closed", n: 2 },
    { status: "archived", n: 1 },
  ]);
  assert.deepEqual(c, { total: 22, published: 9, paused: 3, draft: 5, pending_review: 1, rejected: 1, closed: 3, other: 0 });
});

test("lifecycleCounts: an unknown status is 'other', never dropped; no rows is all zero", () => {
  assert.equal(lifecycleCounts([{ status: "weird", n: 2 }]).other, 2);
  assert.equal(lifecycleCounts([{ status: "weird", n: 2 }]).total, 2);
  assert.deepEqual(lifecycleCounts([]), { total: 0, published: 0, paused: 0, draft: 0, pending_review: 0, rejected: 0, closed: 0, other: 0 });
});

test("lifecycleCounts: status case and spacing do not matter", () => {
  assert.equal(lifecycleCounts([{ status: " Published ", n: 2 }]).published, 2);
});

test("companyProposalBuckets: sent excludes drafts; accepted includes hired; pending is sent + interview; expired and withdrawn are apart", () => {
  const b = companyProposalBuckets([
    { status: "draft", n: 9 },
    { status: "sent", n: 4 },
    { status: "interview_scheduled", n: 2 },
    { status: "accepted", n: 3 },
    { status: "hired", n: 1 },
    { status: "rejected", n: 5 },
    { status: "expired", n: 2 },
    { status: "withdrawn", n: 1 },
  ]);
  assert.deepEqual(b, { sent: 18, accepted: 4, rejected: 5, pending: 6, expired: 2, withdrawn: 1 });
  assert.equal(b.sent, b.accepted + b.rejected + b.pending + b.expired + b.withdrawn);
});

test("companyProposalBuckets: nothing in, nothing out; an unknown status still counts as sent only", () => {
  assert.deepEqual(companyProposalBuckets([]), { sent: 0, accepted: 0, rejected: 0, pending: 0, expired: 0, withdrawn: 0 });
  assert.equal(companyProposalBuckets([{ status: "mystery", n: 1 }]).sent, 1);
});

test("normSkill folds case, spacing and dots, keeps + and #", () => {
  assert.equal(normSkill("JavaScript"), "javascript");
  assert.equal(normSkill("  javascript "), "javascript");
  assert.equal(normSkill("Node.js"), normSkill("nodejs"));
  assert.equal(normSkill("Node JS"), "nodejs");
  assert.equal(normSkill("C++"), "c++");
  assert.equal(normSkill("C#"), "c#");
  assert.notEqual(normSkill("C++"), normSkill("C#"));
  assert.notEqual(normSkill("Java"), normSkill("JavaScript"));
  assert.equal(normSkill(""), "");
});

test("demandSupplyGap: scarce skills first; zero supply is short with a null ratio", () => {
  const rows = demandSupplyGap(
    [
      { key: "javascript", label: "JavaScript", count: 10 },
      { key: "rust", label: "Rust", count: 2 },
      { key: "figma", label: "Figma", count: 1 },
    ],
    [
      { key: "javascript", count: 60 },
      { key: "figma", count: 80 },
    ],
  );
  assert.deepEqual(rows.map((r) => r.skill), ["Rust", "JavaScript", "Figma"]);
  assert.equal(rows[0].supply, 0);
  assert.equal(rows[0].perProject, null);
  assert.equal(rows[0].verdict, "short");
  assert.equal(rows[1].perProject, 6);
  assert.equal(rows[1].verdict, "balanced");
  assert.equal(rows[2].verdict, "surplus");
});

test("demandSupplyGap: a skill nobody asks for is not listed; spelling variants of supply join demand", () => {
  const rows = demandSupplyGap([{ key: normSkill("Node.js"), label: "Node.js", count: 4 }], [{ key: normSkill("nodejs"), count: 3 }, { key: "cobol", count: 9 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].supply, 3);
  assert.equal(rows[0].verdict, "short"); // 0.75 interns per project
});

test("demandSupplyGap: zero demand rows (defensive) are dropped, empty inputs give nothing", () => {
  assert.deepEqual(demandSupplyGap([{ key: "a", label: "A", count: 0 }], [{ key: "a", count: 5 }]), []);
  assert.deepEqual(demandSupplyGap([], []), []);
});

test("parseCompanyFilter validates sort, status and clamps the page", () => {
  assert.deepEqual(parseCompanyFilter({ cq: " Acme ", cstatus: "live", csort: "paid", cdir: "asc", cpage: "2" }), { q: "Acme", status: "live", sort: "paid", dir: "asc", page: 2 });
  const bad = parseCompanyFilter({ csort: "1; drop table employers", cstatus: "zzz", cpage: "-1", cdir: "x" });
  assert.deepEqual(bad, { q: "", status: "", sort: "joined", dir: "desc", page: 1 });
  assert.equal(parseCompanyFilter({ cpage: "999999999" }).page, 10_000);
  assert.equal(parseCompanyFilter({ cq: "y".repeat(300) }).q.length, 80);
  assert.equal(COMPANY_PAGE_SIZE, 25);
});
