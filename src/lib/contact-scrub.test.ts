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

test("handles, and platform names followed by a handle (a bare platform word reveals nothing)", () => {
  for (const s of ["@handle", "ping me @asha_rao", "my insta id: asha_22", "telegram @asha_22", "whatsapp 9876543210"]) {
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

test("review probes: separators caught, ranges/ISBN/own domain/platform words left alone", () => {
  for (const s of ["98765,43210", "98765/43210", "98765_43210", "9 8 7 6 5 4 3 2 1 0", "+91 98765 43210", "098765-43210", "+1 415 555 0132",
    "instagram: john_doe", "insta id is john_99", "whatsapp 9876543210", "telegram @abc", "https://evil.com", "evil.in", "findtern.in.evil.com"]) {
    assert.equal(scrubContact(s).redacted, true, s);
  }
  for (const s of ["20000-25000", "60000 / 90000", "ISBN 978-0-306-40615-7", "1234 5678 9012", "3 months", "Python 3.11", "2023-2024", "₹2,40,000",
    "findtern.in", "https://findtern.in/jobs", "www.findtern.in", "ASP.NET", "signal processing", "discord bot", "snap judgement", "IG reels", "the fb page", "my linkedin"]) {
    assert.equal(scrubContact(s).redacted, false, s);
    assert.deepEqual(findContact(s).kinds, [], s);
  }
});
