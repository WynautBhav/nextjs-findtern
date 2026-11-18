import { test } from "node:test";
import assert from "node:assert/strict";

import { allows, canWrite, BANK_EXPORT_PERMISSIONS, EXPORT_PERMISSIONS, requiredPermissions } from "./permissions.ts";

test("reports:read alone opens all 7 CSV exports; the data's own read permission still does too", () => {
  assert.equal(Object.keys(EXPORT_PERMISSIONS).length, 7);
  for (const type of Object.keys(EXPORT_PERMISSIONS)) assert.equal(allows(["reports:read"], EXPORT_PERMISSIONS[type]), true, type);
  assert.equal(allows(["cms:read"], EXPORT_PERMISSIONS.payments), false);
  assert.deepEqual(EXPORT_PERMISSIONS.payouts, requiredPermissions("/api/admin/payouts/export"));
  assert.equal(allows(["transactions:read"], EXPORT_PERMISSIONS.payouts), true);
  // the rest of /api/admin/payouts stays transactions-only
  assert.equal(allows(["reports:read"], requiredPermissions("/api/admin/payouts")), false);
});

test("reports-only staff never get bank columns; the audit log is roles:write", () => {
  assert.equal(allows(["reports:read"], BANK_EXPORT_PERMISSIONS), false);
  assert.deepEqual(requiredPermissions("/admin/audit-log"), ["roles:write"]);
});

test("the audit-log export API follows the page: roles:write, not super admin only", () => {
  assert.deepEqual(requiredPermissions("/api/admin/audit-log/export"), ["roles:write"]);
  assert.equal(allows(["roles:write"], requiredPermissions("/api/admin/audit-log/export")), true);
  assert.equal(allows(["reports:read", "users:read"], requiredPermissions("/api/admin/audit-log/export")), false);
});

test("full bank account numbers in the Candidates export need transactions:write", () => {
  assert.equal(allows(["*"], BANK_EXPORT_PERMISSIONS), true);
  assert.equal(allows(["interns:read", "transactions:write"], BANK_EXPORT_PERMISSIONS), true);
  assert.equal(allows(["interns:read"], BANK_EXPORT_PERMISSIONS), false);
});

test("canWrite follows the path's write rule", () => {
  assert.equal(canWrite(["interns:read"], "/admin/interns"), false);
  assert.equal(canWrite(["interns:write"], "/admin/interns"), true);
  assert.equal(canWrite(["companies:read"], "/admin/colleges"), false);
  assert.equal(canWrite(["cms:write"], "/admin/promo-codes"), true);
  assert.equal(canWrite(["*"], "/admin/companies"), true);
  assert.equal(canWrite(undefined, "/admin/companies"), false);
});

test("canWrite is false for a path with no write rule, never the read rule", () => {
  assert.equal(canWrite(["cms:read"], "/api/admin/cms"), false);
  assert.equal(canWrite(["cms:write"], "/api/admin/cms"), true);
  // Page paths that only have a read rule: the read permission must not unlock writes.
  assert.equal(canWrite(["cms:read"], "/admin/cms"), false);
  assert.equal(canWrite(["cms:write"], "/admin/cms"), false);
  assert.equal(canWrite(["*"], "/admin/cms"), true);
  assert.equal(canWrite(["*"], "/no/such/path"), true);
  assert.equal(canWrite(["cms:write"], "/no/such/path"), false);
});

test("every page that gates controls with canWrite keeps the right answer", () => {
  const callers: [string, string, string][] = [
    ["/admin/interns", "interns:read", "interns:write"],
    ["/admin/companies", "companies:read", "companies:write"],
    ["/admin/colleges", "companies:read", "companies:write"],
    ["/admin/promo-codes", "transactions:read", "transactions:write"],
    ["/api/admin/cms", "cms:read", "cms:write"],
    ["/api/admin/pricing", "cms:read", "cms:write"],
    ["/api/admin/ai-reports", "interns:read", "interns:write"],
  ];
  for (const [path, read, write] of callers) {
    assert.equal(canWrite([read], path), false, `${path} read-only`);
    assert.equal(canWrite([write], path), true, `${path} writer`);
    assert.equal(canWrite(["*"], path), true, `${path} super admin`);
    assert.equal(canWrite(undefined, path), false, `${path} no session`);
  }
});


test("college money routes need transactions:write: Accounts may pay, Sales may not", () => {
  const accounts = ["transactions:read", "transactions:write"];
  const sales = ["companies:read", "companies:write"];
  for (const path of ["/api/admin/colleges/c1/seat-batches", "/api/admin/colleges/c1/seat-batches/b1", "/api/admin/colleges/c1/payouts/p1", "/api/admin/colleges/c1/bank", "/api/admin/colleges/c1/promo-code"]) {
    assert.equal(allows(accounts, requiredPermissions(path, "POST")), true, `accounts ${path}`);
    assert.equal(allows(sales, requiredPermissions(path, "POST")), false, `sales ${path}`);
    assert.equal(allows(sales, requiredPermissions(path, "GET")), true, `sales read ${path}`);
    assert.equal(allows(["transactions:read"], requiredPermissions(path, "GET")), true, `accounts read ${path}`);
  }
});

test("college billing and admin logins stay a company write; Accounts can open the college page", () => {
  assert.equal(allows(["transactions:write"], requiredPermissions("/api/admin/colleges/c1/admins", "POST")), false);
  assert.equal(allows(["companies:write"], requiredPermissions("/api/admin/colleges/c1/admins", "POST")), true);
  assert.equal(allows(["transactions:read"], requiredPermissions("/admin/colleges/c1", "GET")), true);
  assert.equal(allows(["transactions:read"], requiredPermissions("/admin/colleges", "GET")), false);
});

test("Accounts records an offline activation fee; Operations (interns:write only) can't", () => {
  const accounts = ["reports:read", "transactions:read", "transactions:write", "interns:read"];
  assert.equal(allows(accounts, requiredPermissions("/api/admin/interns/i1/mark-paid", "POST")), true);
  assert.equal(allows(["interns:read", "interns:write"], requiredPermissions("/api/admin/interns/i1/mark-paid", "POST")), false);
  // the rest of the intern record stays an intern write
  assert.equal(allows(accounts, requiredPermissions("/api/admin/interns/i1", "PATCH")), false);
  assert.equal(allows(accounts, requiredPermissions("/admin/interns/i1")), true);
});

test("drive order, import, identity-review, refund and project APIs follow the colleges pair", () => {
  for (const base of ["/api/admin/drive-orders/x/imports", "/api/admin/imports/x/confirm", "/api/admin/identity-reviews/x", "/api/admin/projects/x"]) {
    assert.deepEqual(requiredPermissions(base, "GET"), ["companies:read"], base);
    assert.deepEqual(requiredPermissions(base, "POST"), ["companies:write"], base);
  }
  assert.equal(allows(["interns:write"], requiredPermissions("/api/admin/imports/x/confirm", "POST")), false);
});

test("refunds are money: transactions permissions, not companies", () => {
  assert.deepEqual(requiredPermissions("/api/admin/refunds", "GET"), ["transactions:read"]);
  assert.deepEqual(requiredPermissions("/api/admin/refunds/x/initiate", "POST"), ["transactions:write"]);
  assert.equal(allows(["companies:write"], requiredPermissions("/api/admin/refunds/x/initiate", "POST")), false);
  assert.deepEqual(requiredPermissions("/admin/refunds"), ["transactions:read"]);
});

test("marking a drive order paid needs transactions:write", () => {
  assert.deepEqual(requiredPermissions("/api/admin/drive-orders/x/payment", "POST"), ["transactions:write"]);
  assert.equal(allows(["companies:write"], requiredPermissions("/api/admin/drive-orders/x/payment", "POST")), false);
  assert.equal(allows(["transactions:read"], requiredPermissions("/api/admin/drive-orders/x/payment", "GET")), true);
});

test("promo codes: the redemptions list reads with a read permission, every change needs a write permission", () => {
  const read = requiredPermissions("/api/admin/promo-codes/p1/redemptions", "GET");
  assert.deepEqual(read, ["transactions:read", "cms:read"]);
  assert.equal(allows(["cms:read"], read), true);
  assert.equal(allows(["interns:read"], read), false, "a role with no money or content access can't read who used a code");
  for (const m of ["POST", "PUT", "DELETE"]) {
    const need = requiredPermissions("/api/admin/promo-codes/p1", m);
    assert.deepEqual(need, ["transactions:write", "cms:write"]);
    assert.equal(allows(["transactions:read", "cms:read"], need), false, `${m}: read-only roles can't change a code`);
    assert.equal(allows(["cms:write"], need), true);
  }
  assert.equal(canWrite(["transactions:read"], "/admin/promo-codes"), false);
});

test("CGPA verification: candidates' permissions (interns), page and API", () => {
  for (const path of ["/admin/cgpa-verifications", "/admin/cgpa-verifications/i1", "/api/admin/cgpa-verifications", "/api/admin/cgpa-verifications/i1/verify"]) {
    assert.deepEqual(requiredPermissions(path, "GET"), ["interns:read"], path);
    assert.deepEqual(requiredPermissions(path, "POST"), ["interns:write"], path);
  }
  assert.equal(allows(["interns:read"], requiredPermissions("/api/admin/cgpa-verifications/i1/verify", "POST")), false, "read-only roles cannot verify");
  assert.equal(allows(["interns:write"], requiredPermissions("/api/admin/cgpa-verifications/i1/verify", "POST")), true);
  assert.equal(allows(["companies:write", "transactions:write"], requiredPermissions("/api/admin/cgpa-verifications/i1/verify", "POST")), false);
  assert.equal(canWrite(["interns:read"], "/admin/cgpa-verifications"), false);
  assert.equal(canWrite(["interns:write"], "/admin/cgpa-verifications"), true);
});

test("employer subscriptions are money: transactions permissions, page and API", () => {
  for (const path of ["/admin/subscriptions", "/api/admin/subscriptions", "/api/admin/subscriptions/e1/grant", "/api/admin/subscriptions/e1/revoke"]) {
    assert.deepEqual(requiredPermissions(path, "GET"), ["transactions:read"], path);
    assert.deepEqual(requiredPermissions(path, "POST"), ["transactions:write"], path);
  }
  assert.equal(allows(["interns:write", "companies:write"], requiredPermissions("/api/admin/subscriptions/e1/grant", "POST")), false);
  assert.equal(allows(["transactions:read"], requiredPermissions("/api/admin/subscriptions/e1/grant", "POST")), false);
  assert.equal(allows(["transactions:write"], requiredPermissions("/api/admin/subscriptions/e1/grant", "POST")), true);
  assert.equal(canWrite(["transactions:read"], "/admin/subscriptions"), false);
  assert.equal(canWrite(["transactions:write"], "/admin/subscriptions"), true);
});

test("the expired-offers CSV needs interns:read and nothing else gets it", () => {
  assert.deepEqual(requiredPermissions("/api/admin/expired", "GET"), ["interns:read"]);
  assert.equal(allows(["interns:read"], requiredPermissions("/api/admin/expired", "GET")), true);
  assert.equal(allows(["transactions:read", "companies:read"], requiredPermissions("/api/admin/expired", "GET")), false);
});

test("editing a candidate's education needs interns:write (the proxy and requireMutation read the same rule)", () => {
  const path = "/api/admin/interns/i1/academics";
  assert.deepEqual(requiredPermissions(path, "PUT"), ["interns:write"]);
  assert.equal(allows(["interns:read", "interns:write"], requiredPermissions(path, "PUT")), true);
  assert.equal(allows(["*"], requiredPermissions(path, "PUT")), true);
  assert.equal(allows(["interns:read"], requiredPermissions(path, "PUT")), false);
  assert.equal(allows(["transactions:read", "reports:read"], requiredPermissions(path, "PUT")), false);
});
