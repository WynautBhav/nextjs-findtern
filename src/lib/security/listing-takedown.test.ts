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
  // The refusal carries the shared takedown message and code, twice: the early check and the re-check under the project lock.
  assert.match(src, /takedownBlock\(project, "send"\)/);
  assert.match(src, /takedownBlock\(live, "send"\)/);
  assert.match(src, /listing_taken_down/);
  const at = src.indexOf('takedownBlock(project, "send")');
  assert.match(src.slice(at, at + 200), /status: 409/);
});

test("both offer routes re-check the takedown under a shared project lock before inserting", () => {
  for (const p of ["api/employer/[id]/proposals/route.ts", "api/employer/[id]/full-time-offer/route.ts"]) {
    const src = read(p);
    assert.match(src, /\.for\("share"\)/, p);
    assert.ok(src.indexOf('.for("share")') < src.indexOf(".insert(schema.proposals)"), `${p}: lock before insert`);
    assert.match(src, /listing_taken_down/, p);
  }
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

// ── Taken-down listing also freezes existing offers ──────────────────────

test("proposal status route: only an intern accepting is blocked, before any write, and decline stays open", () => {
  const src = read("api/proposals/[id]/status/route.ts");
  const at = src.indexOf('takedownBlock(project, "accept")');
  assert.ok(at > 0, "guard present");
  assert.ok(at < src.indexOf("db.transaction("), "guard runs before the transaction");
  const guardStart = src.lastIndexOf("if (recordTerms", at);
  assert.ok(guardStart > 0, "guard is keyed on the intern accepting (recordTerms), so decline/withdraw never reach it");
  assert.match(src.slice(at, at + 160), /status: 409/);
  assert.match(src, /const recordTerms = session\.role === "intern" && status === "accepted"/);
  // The same check repeats inside the transaction under a shared row lock, so a takedown committing
  // between the early read and the write cannot slip through (e2e "accept race" shows it).
  const tx = src.slice(src.indexOf("db.transaction("));
  const lock = tx.indexOf('.for("share")');
  assert.ok(lock > 0, "project re-read under FOR SHARE inside the transaction");
  assert.ok(lock < tx.indexOf(".update(schema.proposals)"), "re-read happens before the status write");
  assert.match(tx.slice(lock, lock + 250), /takedownBlock\(live, "accept"\)/);
});

test("interview slot booking and new-hire checkout refuse for a taken-down listing; due months do not", () => {
  const slot = read("api/interviews/[id]/select-slot/route.ts");
  assert.match(slot, /takedownBlock\(project, "schedule"\)/);
  assert.ok(slot.indexOf('takedownBlock(project, "schedule")') < slot.indexOf("createMeetEvent("), "refused before a Meet event is created");
  const order = read("api/employer/[id]/payment/razorpay/order/route.ts");
  // Which lines are checked is behaviour: see takedownCheckedLineIds in projects/takedown.test.ts.
  assert.match(order, /takedownCheckedLineIds\(paying\)/);
  assert.match(order, /isNotNull\(schema\.projects\.takenDownAt\)/);
  assert.ok(order.indexOf("TAKEDOWN_BLOCKS.pay") < order.indexOf("await openOrder("), "refused before an order is opened");
});

test("intern offer screens mark Accept unavailable with the reason; decline button is not gated", () => {
  const dec = readFileSync(join(APP, "../components/app/offer-decision.tsx"), "utf8");
  // Unavailable Accept stays focusable (aria-disabled, not `disabled`) and its click does nothing.
  assert.match(dec, /aria-disabled=\{acceptBlocked \? true : undefined\}/);
  assert.match(dec, /if \(!acceptBlocked\) setAcceptOpen\(true\)/);
  assert.doesNotMatch(dec, /(?<!aria-)disabled=\{[^}]*acceptBlocked/);
  assert.match(dec, /onClick=\{\(\) => setDeclineOpen\(true\)\}\s+disabled=\{busy !== null\}/);
  assert.match(read("intern/proposals/page.tsx"), /acceptBlocked=\{takenDown \? TAKEDOWN_BLOCKS\.accept : null\}/);
  assert.match(read("intern/proposals/[id]/page.tsx"), /acceptBlocked=\{takedownBlock\(project\.row, "accept"\)\}/);
});

// ── Revision 3 (wiring pins; the behaviour is in e2e/listing-takedown.e2e.mjs) ──

test("openOrder re-checks the takedown under a shared project lock, inside the employer lock, before the order insert", () => {
  const src = read("api/employer/[id]/payment/razorpay/order/route.ts");
  const open = src.slice(src.indexOf("async function openOrder("), src.indexOf("export async function POST("));
  const share = open.indexOf('.for("share", { of: schema.projects })');
  assert.ok(share > 0, "FOR SHARE on the project rows only");
  assert.ok(open.indexOf("takedownCheckedLineIds(paying)") < share, "same line rule as the early check");
  assert.ok(share < open.indexOf(".insert(schema.employerPayments)"), "lock before the insert");
  assert.match(open, /\.orderBy\(schema\.projects\.id\)/, "projects locked in id order");
  assert.match(open, /listing_taken_down/);
  assert.doesNotMatch(open, /\.for\("update"\)/, "never locks proposals here");
});

test("offer rows are locked in id order by accept and by a multi-offer settlement (the takedown locks in id order too)", () => {
  assert.match(read("api/proposals/[id]/status/route.ts"), /\.where\(eq\(schema\.proposals\.internId, proposal\.internId\)\)\.orderBy\(schema\.proposals\.id\)\.for\("update"\)/);
  const pay = readFileSync(join(APP, "../lib/payments.ts"), "utf8");
  assert.match(pay, /\.orderBy\(schema\.proposals\.id\)\s+\.for\("update"\)/);
  assert.ok(pay.indexOf('.orderBy(schema.proposals.id)') < pay.indexOf('status: "hired"'), "locked before the hire update");
});

test("editing an accepted offer is refused on a taken-down listing, before anything is written", () => {
  const src = read("api/proposals/[id]/route.ts");
  const at = src.indexOf('takedownBlock(project, "send")');
  assert.ok(at > 0 && at < src.indexOf(".update(schema.proposals)"));
  assert.match(src.slice(at - 400, at + 250), /proposal\.status === "accepted"[\s\S]*listing_taken_down[\s\S]*status: 409/);
});
