import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanNotificationType, normaliseAudience } from "./notification-types.ts";

test("picked ids: trimmed, blanks and duplicates dropped (ADP-26)", () => {
  const a = normaliseAudience({ recipientType: "intern", recipientIds: [" a ", "a", "", "  ", "b"] });
  assert.deepEqual(a, { intern: { all: false, ids: ["a", "b"] }, employer: null });
});

test("nothing left after cleaning means no audience", () => {
  assert.deepEqual(normaliseAudience({ recipientType: "employer", recipientIds: ["", " "] }), { intern: null, employer: null });
});

test("legacy 'both' without per-side picks is everyone on both sides", () => {
  assert.deepEqual(normaliseAudience({ recipientType: "both" }), {
    intern: { all: true, ids: [] },
    employer: { all: true, ids: [] },
  });
});

test("'both' with picked people per side (ADP-10)", () => {
  const a = normaliseAudience({
    recipientType: "both",
    interns: { all: false, ids: ["i1", "i1"] },
    employers: { all: true, ids: ["ignored"] },
  });
  assert.deepEqual(a, { intern: { all: false, ids: ["i1"] }, employer: { all: true, ids: [] } });
});

test("type is a short slug, defaulting to custom", () => {
  assert.equal(cleanNotificationType("  Promo Offer! "), "promo_offer");
  assert.equal(cleanNotificationType(""), "custom");
  assert.equal(cleanNotificationType("update"), "update");
});
