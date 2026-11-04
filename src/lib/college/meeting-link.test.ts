import assert from "node:assert/strict";
import { test } from "node:test";

import { manualMeetingLink, pickMeetingLink } from "./meeting-link.ts";

test("manual link: https accepted and trimmed", () => {
  assert.equal(manualMeetingLink(" https://meet.google.com/abc-defg-hij "), "https://meet.google.com/abc-defg-hij");
  assert.equal(manualMeetingLink("https://zoom.us/j/123"), "https://zoom.us/j/123");
});

test("manual link: http, other schemes, relative, spaces, empty, too long are refused", () => {
  for (const v of ["http://x.com/a", "javascript:alert(1)", "data:text/html,x", "/foo", "//x.com", "https://a b", "", "  ", undefined, "https://x.com/" + "a".repeat(500)]) {
    assert.equal(manualMeetingLink(v), null, String(v));
  }
});

test("precedence: manual overrides auto and skips the auto call", async () => {
  let called = false;
  const r = await pickMeetingLink("https://zoom.us/j/1", async () => ((called = true), { link: "https://auto", eventId: "e" }));
  assert.deepEqual(r, { link: "https://zoom.us/j/1", eventId: null });
  assert.equal(called, false);
});

test("precedence: no manual link uses auto", async () => {
  const auto = { link: "https://meet.google.com/auto", eventId: "e" };
  assert.deepEqual(await pickMeetingLink(null, async () => auto), auto);
});
