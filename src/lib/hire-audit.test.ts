import { test } from "node:test";
import assert from "node:assert/strict";

import { hireAuditEntry } from "./hire-audit.ts";

test("hire audit row: actor is the paying employer, target is the proposal, meta names the order and intern", () => {
  const e = hireAuditEntry({ employerId: "emp-1", orderId: "order_X", paymentRowId: "row-1" }, { id: "prop-1", internId: "int-1" });
  assert.equal(e.action, "proposal.hired");
  assert.equal(e.adminId, "emp-1");
  assert.equal(e.targetType, "proposal");
  assert.equal(e.targetId, "prop-1");
  assert.deepEqual(e.meta, { proposalId: "prop-1", employerId: "emp-1", internId: "int-1", orderId: "order_X", paymentRowId: "row-1" });
});
