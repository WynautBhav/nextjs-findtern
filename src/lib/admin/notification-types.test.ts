import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanNotificationType, isSafeNotificationLink, normaliseAudience } from "./notification-types.ts";

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

test("notification links: on-site paths only, no protocol-relative or backslash tricks", () => {
  for (const ok of ["/intern/proposals", "/employer/orders?x=1#top", "/a"]) assert.equal(isSafeNotificationLink(ok), true, ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/ /x", "/", "", "https://evil.com", "javascript:alert(1)", "/\n/evil.com", "/\t/evil.com", "intern/x", 5, null, undefined]) {
    assert.equal(isSafeNotificationLink(bad), false, String(bad));
  }
});

test("semester, CGPA, expiry and subscription notification types: unique slugs, a label and an audience each", async () => {
  const { SEM_NOTIFICATION_TYPES } = await import("./notification-types.ts");
  assert.deepEqual(
    SEM_NOTIFICATION_TYPES.map((t) => t.type),
    ["cgpa_verification_requested", "cgpa_verified", "cgpa_incorrect", "proposal_expired_unpaid", "proposal_expired_no_reply", "subscription_started"],
  );
  for (const t of SEM_NOTIFICATION_TYPES) {
    assert.equal(cleanNotificationType(t.type), t.type, `${t.type} is a clean slug`);
    assert.ok(t.label.length > 0 && t.audience.length > 0, t.type);
    for (const a of t.audience) assert.ok(a === "intern" || a === "employer", `${t.type}: ${a}`);
  }
});

test("those notification types can never be switched off: verification and money mail is required", async () => {
  const { SEM_NOTIFICATION_TYPES } = await import("./notification-types.ts");
  const { categoryOf, isSuppressible } = await import("../notify-prefs.ts");
  for (const t of SEM_NOTIFICATION_TYPES) assert.equal(isSuppressible(categoryOf(t.type)), false, t.type);
});

test("they are events people act on, not the machine's daily nudges, so staff still see them in the history", async () => {
  const { SEM_NOTIFICATION_TYPES, AUTO_NOTIFICATION_TYPES } = await import("./notification-types.ts");
  for (const t of SEM_NOTIFICATION_TYPES) assert.ok(!AUTO_NOTIFICATION_TYPES.includes(t.type), t.type);
});
