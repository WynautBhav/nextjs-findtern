import assert from "node:assert/strict";
import { test } from "node:test";

import { ago, coverMessage, initialsOf, membershipLabel, rosterOnlyFacts, tpoStatus, tpoStatusLabel } from "./labels.ts";

test("claimed student on the roster is not told they are missing from it", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: true }), "On your roster, not verified yet. Share your student code");
});

test("claimed student not on the roster", () => {
  assert.equal(membershipLabel({ status: "claimed", onRoster: false }), "Claimed, not verified. Share your student code");
});

test("verified student", () => {
  assert.equal(membershipLabel({ status: "verified", onRoster: false }), "Verified");
});

test("tpoStatus is the furthest step reached", () => {
  const f = { registered: false, onboardingDone: false, codeUsed: false, aiDone: false };
  assert.equal(tpoStatus(f), "on_roster");
  assert.equal(tpoStatus({ ...f, registered: true }), "registered");
  assert.equal(tpoStatus({ ...f, registered: true, onboardingDone: true }), "onboarded");
  assert.equal(tpoStatus({ ...f, registered: true, onboardingDone: true, codeUsed: true }), "code_used");
  assert.equal(tpoStatus({ registered: true, onboardingDone: true, codeUsed: true, aiDone: true }), "ai_done");
  assert.equal(tpoStatus({ ...f, registered: true, codeUsed: true }), "code_used"); // code used before onboarding is finished
  assert.equal(tpoStatusLabel("onboarded"), "Onboarding done");
});

test("coverMessage: covered, switched off, no seats, and nothing for a non-partner", () => {
  const base = { collegeName: "JKLU", isPartner: true, isActive: true, seatsLeft: 12 };
  assert.deepEqual(coverMessage(base), { tone: "covered", text: "Your college covers this interview. Enter the code from your placement officer." });
  assert.equal(coverMessage({ ...base, isActive: false })?.tone, "unavailable");
  assert.match(coverMessage({ ...base, seatsLeft: 0 })?.text ?? "", /no seats left/);
  assert.equal(coverMessage({ ...base, isPartner: false }), null);
  assert.equal(coverMessage({ ...base, seatsLeft: null }), null);
  assert.equal(coverMessage(null), null);
});

test("roster-only rows never show onboarding or interview progress", () => {
  // On college A's roster, matched to nobody in A (verified at college B, AI interview done): just "On roster".
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: null, codeUsed: true })), "on_roster");
  // A claimed member of this college: at most "Registered", or "Code used" once they entered the code.
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: "u1", codeUsed: false })), "registered");
  assert.equal(tpoStatus(rosterOnlyFacts({ memberUserId: "u1", codeUsed: true })), "code_used");
  for (const memberUserId of [null, "u1"]) {
    const f = rosterOnlyFacts({ memberUserId, codeUsed: true });
    assert.equal(f.aiDone, false);
    assert.equal(f.onboardingDone, false);
  }
});

// WP6-T1: "ago" is read by people who think in India calendar days and whole units (nothing says "60 min" or "24 h").
test("ago: never rounds a unit up to the next one (59.5 min is not '60 min', 23.6 h is not '24 h')", () => {
  const now = Date.parse("2026-11-23T10:00:00Z");
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  assert.equal(ago(at(30), now), "just now");
  assert.equal(ago(at(59 * 60 + 40), now), "59 min ago");
  assert.equal(ago(at(23 * 3600 + 50 * 60), now), "23 h ago");
  assert.equal(ago(null, now), "Never");
});

test("ago: 'yesterday' and 'N days ago' count India calendar days, not 24-hour blocks", () => {
  // Now is Mon 23 Nov 23:00 IST. 07:00 on Sun 22 Nov IST is 40 h ago: that is yesterday on the calendar.
  const now = Date.parse("2026-11-23T17:30:00Z");
  assert.equal(ago("2026-11-22T01:30:00Z", now), "yesterday");
  // 00:10 IST today seen from 23:50 IST today is hours ago, 23:50 IST on Sat 21 Nov is 2 days ago.
  assert.equal(ago("2026-11-21T18:20:00Z", now), "2 days ago");
  // 25 hours ago but the day before yesterday in IST: now is 00:30 IST Mon 23 Nov (Sun 22 Nov 19:00Z), seen 23:30 IST Sat 21 Nov.
  const early = Date.parse("2026-11-22T19:00:00Z");
  assert.equal(ago("2026-11-21T18:00:00Z", early), "2 days ago");
  assert.equal(ago("2026-11-22T10:00:00Z", early), "9 h ago");
});

// WP6-E1: names are not ASCII. w[0] split an emoji in half (a broken glyph in the avatar) and dropped a Devanagari vowel sign.
test("initialsOf takes whole characters, not UTF-16 halves", () => {
  assert.equal(initialsOf("Aarav Sharma"), "AS");
  assert.equal(initialsOf("  priya   nair  extra "), "PN");
  assert.equal(initialsOf("Zoë 🙂 Ørsted"), "Z🙂");
  assert.equal(initialsOf("सुरेश कुमार शर्मा"), "सुकु"); // whole grapheme: the vowel sign stays with its consonant
  assert.equal(initialsOf("Madonna"), "M");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf("   "), "?");
  for (const name of ["Zoë 🙂 Ørsted", "🙂🙂 🙂", "𝒜𝓁𝒾𝒸ℯ 𝒷𝑜𝒷"]) assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(initialsOf(name)), name);
});

test("initialsOf does not depend on the reader's locale (R3-07): Turkish i / ı / İ give the same letters everywhere", () => {
  // A locale-aware upper-case would turn "i" into "İ" in a tr-TR browser and hydrate differently from the server.
  if ("i".toLocaleUpperCase("tr-TR") === "İ") assert.notEqual("i".toLocaleUpperCase("tr-TR"), "i".toUpperCase(), "the trap is real on this runtime");
  assert.equal(initialsOf("ismail ince"), "II");
  assert.equal(initialsOf("ışıl ığdır"), "II");
  assert.equal(initialsOf("İlker İpek"), "İİ");
  assert.equal(initialsOf("istanbul"), "I");
});
