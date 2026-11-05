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

