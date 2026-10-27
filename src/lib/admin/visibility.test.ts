import assert from "node:assert/strict";
import { test } from "node:test";

import { adminVisibilityExtra } from "./visibility.ts";

test("DB-11: admin hide switches legacy openToWork off and marks it", () => {
  assert.deepEqual(adminVisibilityExtra({ a: 1 }, "hidden"), { a: 1, openToWork: false, hiddenByAdmin: true });
  assert.deepEqual(adminVisibilityExtra(null, "hidden"), { openToWork: false, hiddenByAdmin: true });
  // Already hidden by admin: no write.
  assert.equal(adminVisibilityExtra({ openToWork: false, hiddenByAdmin: true }, "hidden"), null);
});

test("DB-11: admin show restores only an admin hide", () => {
  assert.deepEqual(adminVisibilityExtra({ openToWork: false, hiddenByAdmin: true, a: 1 }, "live"), { openToWork: true, a: 1 });
  // The intern hid themselves: admin show/hide never touches their switch.
  assert.equal(adminVisibilityExtra({ openToWork: false, hiddenAt: "x" }, "live"), null);
  assert.equal(adminVisibilityExtra({ openToWork: false, hiddenAt: "x" }, "hidden"), null);
  assert.equal(adminVisibilityExtra({ openToWork: true }, "live"), null);
});
