import { test } from "node:test";
import assert from "node:assert/strict";

import { allows, BANK_EXPORT_PERMISSIONS, EXPORT_PERMISSIONS, requiredPermissions } from "./permissions.ts";

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

test("full bank account numbers in the Candidates export need transactions:write", () => {
  assert.equal(allows(["*"], BANK_EXPORT_PERMISSIONS), true);
  assert.equal(allows(["interns:read", "transactions:write"], BANK_EXPORT_PERMISSIONS), true);
  assert.equal(allows(["interns:read"], BANK_EXPORT_PERMISSIONS), false);
});
