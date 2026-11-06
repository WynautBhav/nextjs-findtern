import { test } from "node:test";
import assert from "node:assert/strict";

import { HIDDEN_UNTIL_HIRE, findContact, scrubContact } from "./contact-scrub.ts";

const kinds = (s: string) => findContact(s).kinds.sort();

test("phone numbers in the usual shapes", () => {
  for (const s of ["call 9876543210", "98765 43210", "+91-98765-43210", "+91 (98765) 43210", "my no is 98765.43210", "09876543210"]) {
    assert.deepEqual(kinds(s), ["phone"], s);
  }
});

test("emails, plain and spelled out", () => {
  for (const s of ["a@b.co", "write to asha.rao+jobs@gmail.com", "a [at] b dot com", "asha (at) gmail (dot) com", "asha at gmail dot com"]) {
    assert.deepEqual(kinds(s), ["email"], s);
  }
});

test("links and messenger shortcuts", () => {
  for (const s of ["wa.me/919876543210", "https://example.org/x", "see www.mysite.in", "t.me/asha", "portfolio: asha.dev", "bit.ly/abc"]) {
    assert.ok(kinds(s).includes("url"), s);
  }
});

test("handles and platform names", () => {
  for (const s of ["@handle", "ping me @asha_rao", "instagram", "my insta id: asha_22", "DM on Telegram", "whatsapp me"]) {
    assert.ok(kinds(s).includes("handle"), s);
  }
});

test("ordinary text is not flagged", () => {
  for (const s of [
    "3 months",
    "Internship of 6 months, 40 hours a week, starts 2026-12-01",
    "Python 3.11, Node.js and React 19",
    "We need 2 interns for a ₹2,40,000 project",
    "Meet at 10 am",
    "",
  ]) {
    assert.deepEqual(kinds(s), [], s);
  }
});

test("scrub hides each contact and says so", () => {
  const { text, redacted } = scrubContact("Hi! call 98765 43210 or mail a@b.co, insta: asha_22. Thanks for 3 months");
  assert.equal(redacted, true);
  assert.ok(!/98765|a@b\.co|asha_22/.test(text), text);
  assert.ok(text.includes(HIDDEN_UNTIL_HIRE));
  assert.ok(text.startsWith("Hi! call ") && text.endsWith("Thanks for 3 months"), text);
});

test("scrub leaves clean text alone", () => {
  assert.deepEqual(scrubContact("Can you start on Monday? 3 months, remote."), { text: "Can you start on Monday? 3 months, remote.", redacted: false });
});
