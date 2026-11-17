import { test } from "node:test";
import assert from "node:assert/strict";

import { TAKEN_DOWN_EXPLAIN, disabledProps } from "./takedown-ui.ts";

test("a taken-down control is really disabled, out of the tab order, aria-disabled and explained", () => {
  assert.deepEqual(disabledProps(true), { disabled: true, "aria-disabled": true, title: TAKEN_DOWN_EXPLAIN, tabIndex: -1 });
});
test("a control for a project that is not taken down gets no props at all", () => {
  assert.deepEqual(disabledProps(false), {});
});
