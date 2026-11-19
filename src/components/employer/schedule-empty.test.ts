import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyScheduleCopy } from "./schedule-empty.ts";

test("empty shortlist: shortlist someone first", () => {
  const c = emptyScheduleCopy(0);
  assert.match(c.who, /shortlist someone first/);
  assert.equal(c.next.href, "/employer/candidates");
});

test("a shortlist that has people (even if all already proposed) never says to shortlist first", () => {
  for (const n of [1, 3]) {
    const c = emptyScheduleCopy(n);
    assert.doesNotMatch(c.who, /shortlist someone first/);
    assert.doesNotMatch(c.body, /^Shortlist a candidate/);
    assert.equal(c.next.href, "/employer/cart");
  }
  assert.match(emptyScheduleCopy(1).body, /1 candidate on your shortlist/);
  assert.match(emptyScheduleCopy(2).body, /2 candidates on your shortlist/);
});
