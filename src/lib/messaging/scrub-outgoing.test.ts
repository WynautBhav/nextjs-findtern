import test from "node:test";
import assert from "node:assert/strict";

import { CONTACT_MASK, NAME_MASK, OUTGOING_HIDDEN, denyTermsFor, findContact, hasDeniedName, scrubOutgoing } from "../contact-scrub.ts";

// One pair: company "Qorvex Labs Pvt Ltd" run by Meera Kapoor (escalation: Dev Rathore); intern Rahul Sharma.
const terms = denyTermsFor({
  company: "Qorvex Labs Pvt Ltd",
  employerNames: ["Meera Kapoor", "Dev Rathore", null],
  internFirst: "Rahul",
  internLast: "Sharma",
});
const clean = (s: string) => scrubOutgoing(s, terms);
/** After scrubbing, nothing the detector or the deny list would catch may remain. */
const leaks = (s: string) => findContact(s).kinds.length > 0 || hasDeniedName(s, terms);

test("ordinary work chat passes untouched", () => {
  for (const s of [
    "Hi! Can you start on Monday? It is a 3 month internship, 40 hours a week.",
    "We use Python 3.11 and React 19. Does that suit you?",
    "The stipend discussion is on the proposal page. Meet at 10 am IST?",
    "I will share the repo after you accept.",
    "",
  ]) {
    const r = clean(s);
    assert.equal(r.changed, false, s);
    assert.equal(r.text, s);
  }
});

test("emails are removed: plain, spelled out, and split with spaces", () => {
  for (const s of ["mail me at rahul.s@gmail.com", "reach me: rahul (at) gmail (dot) com", "rahul at gmail dot com", "r a h u l @ g m a i l . c o m"]) {
    const r = clean(`Sure. ${s}`);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
    assert.ok(r.text.startsWith("Sure."), "the clean sentence survives");
  }
});

test("phone numbers: digits, spaced, dotted, +91, words, Hindi words, Devanagari digits", () => {
  for (const s of [
    "call 9876543210",
    "98765 43210",
    "+91 98765-43210",
    "9 8 7 6 5 4 3 2 1 0",
    "nine eight seven six five four three two one zero",
    "double nine eight seven six five four three two one",
    "nau aath saat chhe paanch char teen do ek shunya",
    "९८७६५४३२१०",
    "98765 then 43210",
  ]) {
    const r = clean(`Here you go: ${s}`);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
});

test("links, shortcuts and bare domains are removed", () => {
  for (const s of ["https://linkedin.com/in/rahul", "see www.mysite.in", "wa.me/919876543210", "t me rahul_s", "portfolio: rahul.dev", "bit.ly/abc123", "evil . com"]) {
    const r = clean(`Look: ${s}`);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
});

test("@handles and 'platform + handle' are removed, a bare platform word is not", () => {
  for (const s of ["ping me @rahul_s", "my insta id: rahul_s22", "telegram @rahul", "insta rahulsharma"]) {
    const r = clean(`Add me. ${s}`);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
  assert.equal(clean("We run ads on Instagram and LinkedIn.").changed, false);
});

test("a pointer to details kept elsewhere is removed", () => {
  const r = clean("my number is in my bio");
  assert.ok(r.changed);
  assert.ok(!leaks(r.text));
});

test("company name, both directions: employer slip and intern guess", () => {
  for (const s of ["I work at Qorvex Labs.", "Qorvex Labs Pvt Ltd is hiring", "ask for qorvex", "QORVEX LABS", "we are Qorvex-Labs", "Qörvex Labs"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
    assert.ok(!/qorvex/i.test(r.text), `${s} -> ${r.text}`);
  }
  // A generic word of the name does not trip on its own.
  assert.equal(clean("Our labs are open on weekdays.").changed, false);
});

test("employer person names, both contact names, first and last", () => {
  for (const s of ["I am Meera", "Kapoor here", "meera kapoor", "Dev Rathore will call you", "Rathore sir said ok"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
});

test("intern first and last name, in any case, and with letters spaced out", () => {
  for (const s of ["my name is Rahul Sharma", "Rahul", "SHARMA", "rahul sharma here", "R a h u l S h a r m a", "r.a.h.u.l", "Rāhul"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
});

test("names inside other words are left alone", () => {
  for (const s of ["The sharmaji bakery is closed", "Rahulan joined", "Devastating bug", "metaverse"]) {
    assert.equal(clean(s).changed, false, s);
  }
});

test("only the offending sentence is replaced; the rest of the message stays", () => {
  const r = clean("Happy to start Monday. Call me on 98765 43210. Does 10 am work?");
  assert.equal(r.text, `Happy to start Monday. ${CONTACT_MASK} Does 10 am work?`);
  const n = clean("Thanks Rahul, see you then");
  assert.equal(n.text, `Thanks ${NAME_MASK}, see you then`);
});

test("a number split across sentences replaces the whole message", () => {
  const r = clean("98765. then 43210");
  assert.ok(r.changed);
  assert.ok(!leaks(r.text));
});

test("scrubbed text is stable: scrubbing it again changes nothing", () => {
  for (const s of ["call 98765 43210 or rahul@gmail.com", "I am Rahul from Qorvex", "https://x.com/a and @rahul"]) {
    const once = clean(s).text;
    assert.deepEqual(clean(once).text, once, s);
  }
  assert.ok(OUTGOING_HIDDEN.length > 0);
});

test("no deny terms: only contact details are removed", () => {
  const r = scrubOutgoing("Hi Rahul. Mail a@b.co", []);
  assert.equal(r.text, `Hi Rahul. ${CONTACT_MASK}`);
});

test("deny list: company without its legal suffix, short words skipped, common-word first names skipped", () => {
  const t = denyTermsFor({ company: "Acme Technologies Pvt Ltd", employerNames: ["Al Pi"], internFirst: "Will", internLast: "Ng" });
  assert.ok(t.includes("acme technologies pvt ltd"));
  assert.ok(t.includes("acme technologies"));
  assert.ok(t.includes("acme"));
  assert.ok(!t.includes("technologies"), "generic words are not names");
  assert.ok(!t.includes("will"), "plain English first name would mask ordinary text");
  assert.ok(t.includes("will ng"));
  assert.ok(!t.includes("ng") && !t.includes("al") && !t.includes("pi"), "one- and two-letter parts are skipped");
  assert.equal(scrubOutgoing("I will start Monday", t).changed, false);
});

test("digits in a company name never mask plain numbers in chat", () => {
  const t = denyTermsFor({ company: "Acme 2026 Labs", internFirst: "Asha", internLast: "Rao" });
  assert.ok(t.includes("acme 2026 labs"));
  assert.ok(!t.includes("2026"));
  assert.equal(scrubOutgoing("Start date is 2026-12-01, 3 months", t).changed, false);
  assert.ok(scrubOutgoing("I work at Acme 2026 Labs", t).changed);
});
