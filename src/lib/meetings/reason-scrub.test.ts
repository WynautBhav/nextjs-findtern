import assert from "node:assert/strict";
import { test } from "node:test";

import { findContact } from "../contact-scrub.ts";
import { scrubMeetingReason } from "./reason-scrub.ts";

const pair = { company: "Northwind Labs Pvt Ltd", employerNames: ["Arjun Mehta"], internFirst: "Ishaan", internLast: "Nair", companyWebsite: "https://northwind.dev", companyEmail: "hiring@northwind.dev" };

test("before the hire, contact details and names in a cancel reason are removed, the rest stays", () => {
  const out = scrubMeetingReason("Ishaan Nair, call 98290 12345, ishaan.nair53@jklu.edu.in. Exam clash on Monday.", { ...pair, hired: false });
  assert.equal(findContact(out).kinds.length, 0, out);
  assert.doesNotMatch(out, /Ishaan|Nair|98290/);
  assert.match(out, /Exam clash on Monday/);
});

test("before the hire, the company and the employer's name are removed from the employer's reason", () => {
  const out = scrubMeetingReason("Arjun from Northwind Labs here: we hired someone else. Ping me on wa.me/919829012345", { ...pair, hired: false });
  assert.doesNotMatch(out, /Arjun|Northwind|wa\.me/);
  assert.equal(findContact(out).kinds.length, 0, out);
});

test("an ordinary reason is untouched", () => {
  assert.equal(scrubMeetingReason("Exam clash, sorry", { ...pair, hired: false }), "Exam clash, sorry");
});

test("after the hire the reason shows as written", () => {
  const raw = "Call me on 98290 12345";
  assert.equal(scrubMeetingReason(raw, { ...pair, hired: true }), raw);
});
