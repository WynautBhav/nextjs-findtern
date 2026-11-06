import assert from "node:assert/strict";
import test from "node:test";

import { bodyToShow, bodyToStore, effectivePresence, emailDue, isParticipant, seenFrom, MessageError, messageErrorResponse } from "./messages.ts";

const thread = { employerId: "e1", internId: "i1" };

test("participant check: exactly the two sides of the pair, each only in their own role", () => {
  assert.equal(isParticipant(thread, { role: "employer", id: "e1" }), true);
  assert.equal(isParticipant(thread, { role: "intern", id: "i1" }), true);
  assert.equal(isParticipant(thread, { role: "employer", id: "e2" }), false, "another employer");
  assert.equal(isParticipant(thread, { role: "intern", id: "i2" }), false, "another intern");
  // An id from the other table must not pass in the wrong role.
  assert.equal(isParticipant(thread, { role: "intern", id: "e1" }), false);
  assert.equal(isParticipant(thread, { role: "employer", id: "i1" }), false);
});

test("scrub gating: contact details are hidden until the hire is paid, then stored as written", () => {
  const body = "call me on 98765 43210 or mail a@b.co";
  const locked = bodyToStore(body, false);
  assert.equal(locked.redacted, true);
  assert.doesNotMatch(locked.text, /98765|a@b\.co/);
  assert.match(locked.text, /\[hidden until hire\]/);

  const open = bodyToStore(body, true);
  assert.deepEqual(open, { text: body, redacted: false });
});

test("scrub gating: ordinary text is stored untouched and not flagged", () => {
  const r = bodyToStore("Can you start in 3 months? Python 3.11 is fine.", false);
  assert.equal(r.redacted, false);
  assert.equal(r.text, "Can you start in 3 months? Python 3.11 is fine.");
});

test("burst email: never while the recipient is online", () => {
  assert.equal(emailDue({ recipientPresence: "Online now", emailedAt: null, lastReadAt: null }), false);
});

test("burst email: the first unread message mails, the rest of the burst does not", () => {
  const sent = new Date("2026-11-06T10:00:00Z");
  assert.equal(emailDue({ recipientPresence: "Active today", emailedAt: null, lastReadAt: null }), true);
  assert.equal(emailDue({ recipientPresence: null, emailedAt: sent, lastReadAt: null }), false, "mailed, never read since");
  assert.equal(emailDue({ recipientPresence: null, emailedAt: sent, lastReadAt: new Date("2026-11-06T09:00:00Z") }), false, "read before the mail");
});

test("burst email: a read ends the burst, so the next message mails again", () => {
  assert.equal(
    emailDue({ recipientPresence: "Active this week", emailedAt: new Date("2026-11-06T10:00:00Z"), lastReadAt: new Date("2026-11-06T10:05:00Z") }),
    true,
  );
});

const NOW = new Date("2026-11-06T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("burst email: a recipient who read the thread 30 s ago is in the conversation, so no email", () => {
  const presence = effectivePresence(null, ago(30_000), NOW);
  assert.equal(presence, "Online now");
  assert.equal(emailDue({ recipientPresence: presence, emailedAt: null, lastReadAt: ago(30_000), now: NOW }), false);
  // Read 3 minutes ago: no longer counted as in the conversation.
  assert.equal(effectivePresence(null, ago(180_000), NOW), null);
  assert.equal(effectivePresence("Active today", null, NOW), "Active today");
});

test("burst email: emailed 5 min ago and read since still does not mail (15 min gap per thread)", () => {
  const o = { recipientPresence: null, emailedAt: ago(5 * 60_000), lastReadAt: ago(60_000), now: NOW };
  assert.equal(emailDue(o), false);
  assert.equal(emailDue({ ...o, emailedAt: ago(16 * 60_000), lastReadAt: ago(10 * 60_000) }), true, "gap passed and a read ended the burst");
  assert.equal(emailDue({ ...o, emailedAt: ago(16 * 60_000), lastReadAt: ago(20 * 60_000) }), false, "gap passed but no read since");
});

test("read-time scrub: a locked thread hides contact details stored earlier, an unlocked one shows them", () => {
  const stored = "reach me at 98765 43210 or a@b.co";
  const locked = bodyToShow(stored, false, false);
  assert.doesNotMatch(locked.body, /98765|a@b\.co/);
  assert.equal(locked.redacted, true);
  assert.deepEqual(bodyToShow(stored, false, true), { body: stored, redacted: false });
  // Already scrubbed text is stable and keeps its flag.
  const once = bodyToShow(stored, true, false);
  assert.deepEqual(bodyToShow(once.body, true, false), once);
  // Ordinary text is untouched.
  assert.deepEqual(bodyToShow("See you in 3 months", false, false), { body: "See you in 3 months", redacted: false });
});

test("a MessageError becomes { error } with its status; anything else is rethrown", async () => {
  const res = messageErrorResponse(new MessageError(403, "Messaging opens once a proposal is sent."));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Messaging opens once a proposal is sent." });
  assert.throws(() => messageErrorResponse(new Error("boom")), /boom/);
});

test("seenFrom: a boolean only, and never while the reader hides presence (review #3)", () => {
  const sent = new Date("2026-11-06T10:00:00Z");
  const later = new Date("2026-11-06T10:01:00Z");
  assert.equal(seenFrom(later, sent, false), true);
  assert.equal(seenFrom(sent, later, false), false, "read before my last message");
  assert.equal(seenFrom(later, sent, true), false, "presence hidden");
  assert.equal(seenFrom(null, sent, false), false);
  assert.equal(seenFrom(later, null, false), false, "nothing of mine to see");
});
