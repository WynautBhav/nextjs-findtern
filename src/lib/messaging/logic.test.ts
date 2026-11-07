import test from "node:test";
import assert from "node:assert/strict";

import { canStartThread, isOnline, isParticipant, otherParticipant, sanitizeBody, unreadCount } from "./logic.ts";

const t = { employerId: "e1", internId: "i1" };

test("participant check", () => {
  assert.ok(isParticipant(t, "e1"));
  assert.ok(isParticipant(t, "i1"));
  assert.ok(!isParticipant(t, "x"));
  assert.ok(!isParticipant(null, "e1"));
  assert.equal(otherParticipant(t, "e1"), "i1");
  assert.equal(otherParticipant(t, "x"), null);
});
test("unread counts only the other side's unread", () => {
  const m = [
    { senderId: "i1", readAt: null },
    { senderId: "i1", readAt: new Date() },
    { senderId: "e1", readAt: null },
  ];
  assert.equal(unreadCount(m, "e1"), 1);
  assert.equal(unreadCount(m, "i1"), 1);
});
test("presence expires after 90 s", () => {
  const now = 1_000_000_000;
  assert.ok(isOnline(new Date(now - 89_000), now));
  assert.ok(!isOnline(new Date(now - 91_000), now));
  assert.ok(!isOnline(null, now));
  assert.ok(!isOnline("garbage", now));
});
test("sanitising strips tags, control chars, caps length", () => {
  assert.equal(sanitizeBody("  hi <script>x</script> there\u0000\u0007 "), "hi x there");
  assert.equal(sanitizeBody("a\nb"), "a\nb");
  assert.equal(sanitizeBody("<b></b>  "), "");
  assert.equal(sanitizeBody("a".repeat(5000)).length, 4000);
});
test("who may start a thread", () => {
  const base = { hasProposal: false, proposalMatchesPair: true, employerAlreadyMessaged: false };
  assert.ok(!canStartThread({ role: "employer", ...base }));
  assert.ok(canStartThread({ role: "employer", ...base, hasProposal: true }));
  assert.ok(!canStartThread({ role: "intern", ...base }));
  assert.ok(canStartThread({ role: "intern", ...base, employerAlreadyMessaged: true }));
  assert.ok(!canStartThread({ role: "employer", ...base, hasProposal: true, proposalMatchesPair: false }));
});
