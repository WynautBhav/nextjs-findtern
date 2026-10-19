import assert from "node:assert/strict";
import { test } from "node:test";

import { icsInvite } from "./emails.ts";

test("an interview invite carries no attendee emails, and a cancel replaces it", () => {
  const start = new Date("2026-10-24T05:30:00Z");
  const end = new Date("2026-10-24T06:00:00Z");
  const invite = icsInvite({ uid: "iv1-intern", start, end, title: "Interview with a company on Findtern", description: "x", sequence: 5 });
  assert.match(invite.content, /METHOD:REQUEST/);
  assert.match(invite.content, /UID:iv1-intern@findtern\.in/);
  assert.doesNotMatch(invite.content, /ATTENDEE|ORGANIZER|@(?!findtern\.in)/);
  const cancel = icsInvite({ uid: "iv1-intern", start, end, title: "t", description: "d", cancel: true, sequence: 6 });
  assert.match(cancel.content, /METHOD:CANCEL/);
  assert.match(cancel.content, /STATUS:CANCELLED/);
  assert.match(cancel.content, /SEQUENCE:6/);
  assert.equal(cancel.filename, "cancel.ics");
});
