import test from "node:test";
import assert from "node:assert/strict";
import { sortRoles } from "./role-order.ts";

const rows = [
  { id: "a", createdAt: "2026-11-01", matched: 1, offered: false },
  { id: "b", createdAt: "2026-10-01", matched: 3, offered: false },
  { id: "c", createdAt: "2026-09-01", matched: 0, offered: true },
  { id: "d", createdAt: "2026-11-05", matched: 1, offered: false },
];

test("sortRoles match: offers, match, newest", () => {
  assert.deepEqual(sortRoles(rows).map((r) => r.id), ["c", "b", "d", "a"]);
});
test("sortRoles newest: offers then date; input untouched", () => {
  assert.deepEqual(sortRoles(rows, "newest").map((r) => r.id), ["c", "d", "a", "b"]);
  assert.equal(rows[0].id, "a");
});
