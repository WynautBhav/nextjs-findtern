import { test } from "node:test";
import assert from "node:assert/strict";

import { stepsReached, stuckAt } from "./placement-track.ts";

const none = { interviewed: false, seen: false, offers: 0, hired: 0 };

test("a new student is stuck at the AI interview", () => {
  assert.equal(stepsReached(none), 1);
  assert.equal(stuckAt(none), "interview");
});

test("the first gap decides", () => {
  assert.equal(stuckAt({ ...none, seen: true }), "interview");
  assert.equal(stuckAt({ ...none, interviewed: true }), "seen");
  assert.equal(stuckAt({ ...none, interviewed: true, seen: true }), "offer");
  assert.equal(stuckAt({ interviewed: true, seen: true, offers: 2, hired: 0 }), "hired");
});

test("hired is done, even with the profile hidden since; an offer counts as seen", () => {
  assert.equal(stuckAt({ interviewed: true, seen: false, offers: 1, hired: 1 }), "done");
  assert.equal(stepsReached({ interviewed: true, seen: false, offers: 0, hired: 1 }), 5);
  assert.equal(stuckAt({ interviewed: true, seen: false, offers: 1, hired: 0 }), "hired");
});
