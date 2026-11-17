import test from "node:test";
import assert from "node:assert/strict";

import { NAME_MASK, denyTermsFor, hasDeniedName, scrubOutgoing } from "../contact-scrub.ts";

// Sheet row 9: "I am able to share company name and it shouldn't happen". Company "Qorvex Labs Pvt Ltd".
const terms = denyTermsFor({
  company: "Qorvex Labs Pvt Ltd",
  employerNames: ["Meera Kapoor"],
  internFirst: "Rahul",
  internLast: "Sharma",
  companyWebsite: "https://www.qorvexhq.in/about",
  companyEmail: "meera@qorvexhq.in",
});
const clean = (s: string) => scrubOutgoing(s, terms);
const leaks = (s: string) => hasDeniedName(s, terms);

test("positive control: the spellings the old filter already caught are still masked", () => {
  for (const s of ["I work at Qorvex Labs.", "QORVEX LABS", "ask for qorvex", "Qörvex Labs", "Qorvex_Labs", "Q.O.R.V.E.X", "Qorvex's team"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!/qorvex/i.test(r.text), `${s} -> ${r.text}`);
  }
});

test("name glued to another word, a number or a legal suffix is masked", () => {
  for (const s of ["QorvexLabs is hiring", "we are Qorvexlabs", "qorvex2026 careers", "QorvexHR", "Qorvexpvtltd", "Qorvex123"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!/qorvex/i.test(r.text), `${s} -> ${r.text}`);
    assert.ok(r.text.includes(NAME_MASK), `${s} -> ${r.text}`);
  }
});

test("leet, look-alike letters and invisible characters are masked", () => {
  for (const s of ["Q0rvex Labs", "Qorv3x", "we are Q0rv3x", "Qоrvex", "Qοrvex", "Qor\u200bvex", "Ｑｏｒｖｅｘ", "Q0rv3x_L4bs"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(leaks(s), s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
    assert.ok(!/q.{0,3}rv.{0,3}x/i.test(r.text), `${s} -> ${r.text}`);
  }
});

test("letters spaced out with mixed separators are masked", () => {
  for (const s of ["Q o r v e x", "Q-o-r-v-e-x", "q.0.r.v.3.x", "Qor vex"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!leaks(r.text), `${s} -> ${r.text}`);
  }
});

test("the company's website and email domain name count as the company name", () => {
  assert.ok(terms.includes("qorvexhq"), "website host label is a deny term");
  for (const s of ["I am from QorvexHQ", "qorvexhq", "Qorv3xHQ"]) {
    const r = clean(s);
    assert.ok(r.changed, s);
    assert.ok(!/hq/i.test(r.text), `${s} -> ${r.text}`);
  }
  // A free mail host is not a company name.
  const t = denyTermsFor({ company: "Zenith Works", companyEmail: "owner@gmail.com", companyWebsite: null });
  assert.ok(!t.includes("gmail"));
  assert.equal(scrubOutgoing("send it on gmail", t).changed, false);
});

test("negative control: ordinary words and look-alikes of other words are left alone", () => {
  for (const s of [
    "Hi! Can you start on Monday? It is a 3 month internship, 40 hours a week.",
    "Our labs are open on weekdays.",
    "The sharmaji bakery is closed",
    "We pay 2026 rupees, 123 hours, 4 weeks",
    "Qorvexion is a different thing",
    "I like the Quorum app",
  ]) {
    const r = clean(s);
    assert.equal(r.changed, false, `${s} -> ${r.text}`);
    assert.equal(r.text, s);
  }
});

test("both directions use the same filter: employer slip and intern guess give the same result", () => {
  // The send route calls scrubOutgoing(body, thread terms) whatever the sender's role.
  for (const s of ["Join Qorvex", "do you work at QorvexLabs?", "Q0rvex Labs right?"]) {
    assert.ok(clean(s).changed, s);
  }
});

test("scrubbed text is stable and nothing of the name remains", () => {
  for (const s of ["QorvexLabs and Q0rvex and Q o r v e x", "Qorvex2026!", "Qоrvex Labs Pvt Ltd"]) {
    const once = clean(s);
    assert.ok(once.changed, s);
    assert.ok(!leaks(once.text), `${s} -> ${once.text}`);
    assert.equal(clean(once.text).text, once.text, s);
  }
});

test("a common-word company name: the word is masked wherever it appears (documented tradeoff)", () => {
  const t = denyTermsFor({ company: "Blue Sky Studio", internFirst: "Asha", internLast: "Rao" });
  for (const s of ["I work at BlueSky", "Blu3 Sky Studio", "BlueSkyStudio"]) assert.ok(scrubOutgoing(s, t).changed, s);
  // Its distinctive first word is masked even in plain use; the generic words never are.
  assert.ok(scrubOutgoing("the sky is blue", t).changed);
  assert.equal(scrubOutgoing("We run a design studio.", t).changed, false);
});
