import { test } from "node:test";
import assert from "node:assert/strict";

import { HIDDEN_MESSAGE, contactFieldError, findContact, normalizeForDetection, scrubContact } from "./contact-scrub.ts";

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
  for (const s of ["@handle", "ping me @asha_rao", "my insta id: asha_22", "telegram @asha_22", "insta rahulsharma"]) {
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

test("scrub hides the whole message when it carries any contact detail", () => {
  const { text, redacted } = scrubContact("Hi! call 98765 43210 or mail a@b.co, insta: asha_22. Thanks for 3 months");
  assert.equal(redacted, true);
  assert.equal(text, HIDDEN_MESSAGE);
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

test("final review bypasses are all caught", () => {
  for (const s of [
    "९८७६५ ४३२१०", // Devanagari digits
    "９８７６５４３２１０", // fullwidth digits
    "98765\u200b43210", // zero-width space
    "98765 -- // 43210",
    "9-8-7-6-5-4-3-2-1-0",
    "nine eight seven six five four three two one zero",
    "nau aath saat chhe paanch chaar teen do ek shunya",
    "double nine eight seven six five four three two one",
    "rahul＠gmail．com",
    "rahul.s99 at gmail",
    "rahul @ yahoo",
    "evil . com",
    "wa . me/919876543210",
    "ig - rahul_x",
    "insta rahulsharma",
    "WhatsApp 98765 43210",
    "insta id is john_99",
  ]) {
    assert.ok(findContact(s).kinds.length > 0, s);
    assert.equal(scrubContact(s).text, HIDDEN_MESSAGE, s);
  }
});

test("ordinary sentences with number words or dots stay text", () => {
  for (const s of [
    "Do the work in one month, then two more weeks of review",
    "We need one or two interns for three months",
    "Python dev. In 2024 we shipped a lot",
    "Send me the deck at 5 pm",
    "Meet at the office at 10",
    "The intern will work on IG reels and the fb page",
    "Stipend range 20000 - 25000 per month",
    "Phase one, phase two",
  ]) {
    assert.deepEqual(findContact(s).kinds, [], s);
  }
});

test("normalisation maps script digits and spelled digits", () => {
  assert.equal(normalizeForDetection("९८७"), "987");
  assert.equal(normalizeForDetection("one two three four"), "1234");
  assert.equal(normalizeForDetection("one month"), "one month");
});

test("contactFieldError checks every field and arrays", () => {
  assert.equal(contactFieldError({ a: "Robotics intern", b: ["Jaipur", "Pune"] }, "the listing"), null);
  assert.match(contactFieldError({ a: "Robotics intern", b: ["Jaipur", "call 9876543210"] }, "the listing") ?? "", /the listing/);
  assert.match(contactFieldError({ title: "Intern - insta rahulsharma" }, "the proposal") ?? "", /the proposal/);
});

test("attack probes (wave 2): every dodge is refused", () => {
  for (const s of [
    "r a h u l @ g m a i l . c o m", // letters spaced
    "r a h u l at g m a i l dot c o m",
    "rahul [at] gmail [dot] com",
    "rahul {at} gmail {dot} com",
    "rahul at the rate gmail dot com",
    "rahul at the rate gmail",
    "98765 then 43210", // number split by words
    "first half 98765 second half 43210",
    "my number starts 987 then 654 and ends 3210",
    "9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣1️⃣0️⃣", // keycap emoji
    "nine 8 seven 6 five 4 three 2 one 0", // words and digits mixed
    "my number is in my bio",
    "my contact details are on my profile",
    "search me on insta same name",
    "r4hul@gm4il.c0m", // leet
    "rahul@gm4il",
    "cmFodWxAZ21haWwuY29t", // base64 of rahul@gmail.com
    "wa me 919876543210", // link without the dot
    "t me rahul_x",
    "mail me rahul gmail com",
  ]) {
    assert.ok(findContact(s).kinds.length > 0, s);
  }
});

test("attack probes (wave 2): ordinary text still passes", () => {
  for (const s of [
    "Budget 75000 to 90000 per month",
    "CGPA 9.2, 12th 95%, 10th 96%",
    "Batch of 2025, 3 months, 40 hours a week, 2 interns",
    "Interview at 11 am on 12 Dec, then 2 pm on 14 Dec",
    "I am a B Tech student, grade A in DSA",
    "Let me know, don't me worry",
    "We use Gmail and Slack internally",
    "Base64 encoding and REST APIs",
    "Stipend 15000 per month and 60000 total bonus",
    "Worked at Infosys for 2 years",
    "Rate: 500@hour",
  ]) {
    assert.deepEqual(findContact(s).kinds, [], s);
  }
});

test("detection stays fast on long hostile input", () => {
  const t = Date.now();
  for (const s of ["a".repeat(2000), "a.".repeat(1000), "1 ".repeat(1000), "aGVsbG8gd29ybGQ".repeat(130), "a@".repeat(1000)]) findContact(s);
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms`);
});
