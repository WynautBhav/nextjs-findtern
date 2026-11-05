import test from "node:test";
import assert from "node:assert/strict";

import { diffFields } from "./audit.ts";
import { auditActionLabel, describeAudit, describeTarget, emptyNames } from "./audit-details.ts";

const names = emptyNames();
names.intern.set("i1", "Sana Kapoor");
names.company.set("c1", "Acme Pvt Ltd");
names.college.set("col1", "Manipal University");
names.role.set("fb2_viewer", "Viewer");
names.role.set("exec_sales", "Sales");
names.admin.set("a1", "Priya Nair");
names.promo.set("pr1", "FB1INT10");

test("diffFields keeps only what changed; dates compare as instants, undefined is skipped", () => {
  const d = new Date("2026-11-05T00:00:00.000Z");
  assert.deepEqual(
    diffFields({ description: "a", isActive: true, validFrom: d, note: null }, { description: "b", isActive: true, validFrom: new Date(d), note: undefined, extra: 1 }),
    { description: { from: "a", to: "b" }, extra: { from: null, to: 1 } },
  );
  assert.deepEqual(diffFields({ tags: ["a"] }, { tags: ["a"] }), {});
});

test("an edit shows only the changed fields as field: old → new", () => {
  const out = describeAudit("promo.update", { code: "FB1INT10", discountType: "fixed", changes: { description: { from: "Old", to: "New" }, discountValue: { from: 100000, to: 150000 }, isActive: { from: true, to: false } } });
  assert.equal(out, "Description: Old → New · Discount: ₹1,000 → ₹1,500 · Active: yes → no");
  assert.equal(describeAudit("promo.update", { code: "X", changes: {} }), "No fields changed");
  assert.equal(describeAudit("promo.update", { discountType: "percentage", changes: { discountValue: { from: 10, to: 15 } } }), "Discount: 10% → 15%");
});

test("older rows without a diff list the field names", () => {
  assert.equal(describeAudit("promo.update", { code: "X", fields: ["description", "maxUsages"] }), "Changed: description, max uses");
});

test("role keys show the role's display name, money is ₹ with Indian commas", () => {
  assert.equal(describeAudit("staff.update", { role: { from: "fb2_viewer", to: "exec_sales" } }, names), "Role: Viewer → Sales");
  assert.equal(describeAudit("staff.create", { name: "Asha", role: "exec_sales" }, names), "Name: Asha · Role: Sales");
  assert.equal(describeAudit("staff.update", { credentialsReset: true }), "Password reset: yes");
  assert.equal(describeAudit("payout.mark_paid", { internId: "i1", amountMinor: 300000, referenceId: "UTR-1" }, names), "Candidate: Sana Kapoor · Amount: ₹3,000 · Reference: UTR-1");
  assert.equal(describeAudit("intern.marked_completed", { proposalId: "09a0510b-1111-2222-3333-444455556666", bonusMinor: 1234567 }), "Proposal: 09a0510b · Bonus: ₹12,345.67");
  assert.equal(describeAudit("settings.update", { value: { from: 49900, to: 59900 } }), "Value: ₹499 → ₹599");
  assert.equal(describeAudit("college.password_reset", { collegeId: "col1", email: "t@x.in" }, names), "College: Manipal University · Email: t@x.in");
  assert.equal(describeAudit("x.y", { employerId: "gone-id" }, names), "Company: gone-id");
});

test("list edits show what was added and removed", () => {
  assert.equal(describeAudit("role.update", { changes: { permissions: { from: ["a", "b"], to: ["b", "c"] } } }), "Permissions: added c; removed a");
  assert.equal(describeAudit("role.update", { changes: { permissions: { from: ["a"], to: ["a"] } } }), "No fields changed");
});

test("exports read as 'Exported N rows of <type>', never the filters", () => {
  assert.equal(describeAudit("export.interns", { rows: 153, columns: ["name"], filters: { q: "x" }, fullAccountNumbers: false }), "Exported 153 rows of candidates");
  assert.equal(describeAudit("export.interns", { rows: 1, fullAccountNumbers: true }), "Exported 1 row of candidates · full account numbers included");
  assert.equal(describeAudit("export.payouts", { view: "dues", rows: 4 }), "Exported 4 rows of employer dues");
  assert.equal(describeAudit("export.payouts", { view: "payouts", rows: 9 }), "Exported 9 rows of payouts");
  assert.equal(describeAudit("export.users", { rows: 2 }), "Exported 2 rows of registered users");
  assert.equal(describeAudit("export.hired", { rows: 3 }), "Exported 3 rows of hired candidates");
});

test("an older payout export logged as a candidates export is labelled by its type", () => {
  const meta = { rows: 152, filters: { entity: "payouts" }, fullAccountNumbers: false };
  assert.equal(auditActionLabel("export.interns", meta), "Exported payouts");
  assert.equal(describeAudit("export.interns", meta), "Exported 152 rows of payouts");
  assert.deepEqual(describeTarget("export.interns", "intern", null, meta, names), { name: "Payouts", href: "/admin/payouts" });
  assert.equal(auditActionLabel("export.interns", { rows: 3, filters: { type: "interns" } }), "Exported candidates");
  assert.equal(auditActionLabel("export.interns", { rows: 3, filters: { kind: "fulltime" } }), "Exported candidates");
  assert.equal(auditActionLabel("promo.update", {}), "Edited a promo code");
});

test("redaction still applies to the readable line", () => {
  const out = describeAudit("x.y", { changes: { password: { from: "old-secret", to: "new-secret" }, note: { from: "a/c 123456789012", to: "ok" } } });
  assert.ok(!out.includes("secret") && !out.includes("123456789012"), out);
  assert.ok(out.includes("[hidden]") && out.includes("••••9012"));
});

test("a promo target shows its code, even after the promo was deleted", () => {
  assert.deepEqual(describeTarget("promo.update", "promo_code", "pr1", { code: "OLD" }, names), { name: "FB1INT10", href: "/admin/promo-codes" });
  assert.deepEqual(describeTarget("promo.delete", "promo_code", "gone", { code: "GONE10" }, names), { name: "GONE10", href: "/admin/promo-codes" });
});

test("targets: staff and role rows link to the staff page, exports to their list", () => {
  assert.deepEqual(describeTarget("staff.update", "admin", "a1", {}, names), { name: "Priya Nair", href: "/admin/roles" });
  assert.deepEqual(describeTarget("staff.delete", "admin", "gone", { name: "Old Hand", email: "o@x.in" }, names), { name: "Old Hand", href: "/admin/roles" });
  assert.deepEqual(describeTarget("export.interns", "intern", null, {}, names), { name: "Candidates", href: "/admin/interns" });
  assert.deepEqual(describeTarget("intern.ratings_update", "intern", "i1", {}, names), { name: "Sana Kapoor", href: "/admin/interns/i1" });
  assert.deepEqual(describeTarget("payout.mark_paid", "payout", "p1", { internId: "i1" }, names), { name: "Payout to Sana Kapoor", href: "/admin/interns/i1" });
});
