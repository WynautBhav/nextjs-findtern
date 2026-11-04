import { test } from "node:test";
import assert from "node:assert/strict";

import { allows, EXPORT_PERMISSIONS, requiredPermissions } from "./permissions.ts";

test("reports:read alone opens no CSV export, and each export needs what its page needs", () => {
  for (const type of Object.keys(EXPORT_PERMISSIONS)) assert.equal(allows(["reports:read"], EXPORT_PERMISSIONS[type]), false, type);
  assert.deepEqual(EXPORT_PERMISSIONS.payouts, requiredPermissions("/api/admin/payouts/export"));
  assert.equal(allows(["transactions:read"], EXPORT_PERMISSIONS.payouts), true);
});
