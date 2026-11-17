import assert from "node:assert/strict";
import { test } from "node:test";

import { allows, requiredPermissions } from "./permissions.ts";

const WRITE = ["POST", "PUT", "PATCH", "DELETE"];

test("every money mutation under /api/admin/orders, /transactions and /refunds needs transactions:write", () => {
  for (const path of ["/api/admin/orders/order_1/received", "/api/admin/orders/order_1/resend-invoice", "/api/admin/transactions", "/api/admin/refunds", "/api/admin/refunds/r1/initiate"]) {
    for (const m of WRITE) assert.deepEqual(requiredPermissions(path, m), ["transactions:write"], `${m} ${path}`);
  }
});

test("reading orders, transactions, refunds and the payments export needs transactions:read", () => {
  for (const path of ["/admin/orders", "/admin/transactions", "/admin/refunds", "/api/admin/orders", "/api/admin/refunds"]) {
    assert.deepEqual(requiredPermissions(path, "GET"), ["transactions:read"], path);
  }
});

test("a read-only finance role can look but not resend an invoice or initiate a refund", () => {
  const readOnly = ["transactions:read", "dashboard:read"] as never;
  assert.equal(allows(readOnly, requiredPermissions("/api/admin/orders/o/resend-invoice", "POST")), false);
  assert.equal(allows(readOnly, requiredPermissions("/api/admin/refunds/r/initiate", "POST")), false);
  assert.equal(allows(readOnly, requiredPermissions("/admin/orders", "GET")), true);
});

test("a role with no money permission cannot open the money pages", () => {
  const none = ["interns:read"] as never;
  for (const path of ["/admin/orders", "/admin/transactions", "/admin/refunds"]) assert.equal(allows(none, requiredPermissions(path, "GET")), false, path);
});
