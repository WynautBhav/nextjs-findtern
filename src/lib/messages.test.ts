import assert from "node:assert/strict";
import test from "node:test";

import { bodyToStore, emailDue, isParticipant, MessageError, messageErrorResponse } from "./messages.ts";

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

test("a MessageError becomes { error } with its status; anything else is rethrown", async () => {
  const res = messageErrorResponse(new MessageError(403, "Messaging opens once a proposal is sent."));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Messaging opens once a proposal is sent." });
  assert.throws(() => messageErrorResponse(new Error("boom")), /boom/);
});
