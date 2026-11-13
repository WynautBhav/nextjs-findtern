import test from "node:test";
import assert from "node:assert/strict";

import { isAcademicEmail, isInternEmail } from "./intern-email.ts";

const ACCEPT = [
  "a@gmail.com",
  "a@googlemail.com",
  "A@GMAIL.COM",
  "a@yahoo.in",
  "a@iitb.ac.in",
  "a@srmist.edu.in",
  "a@mit.edu",
  "a@x.edu.au",
  "a@cs.mit.edu",
  " a@IITB.ac.in ",
];
const REJECT = [
  "a@acme.com",
  "a@academy.com",
  "a@education.com",
  "a@notedu.com",
  "a@edu.com",
  "a@ac.in",
  "a@edu.in",
  "a@evil.edu.com",
  "a@mit.edu.evil.com",
  "evil.com@edu",
  "mit.edu@evil.com",
  "a@b@evil.com",
  "a@mit..edu",
  "@mit.edu",
  "a@-mit.edu",
  "",
  "mit.edu",
  "no-at-sign",
];

test("isInternEmail accepts personal and college addresses", () => {
  for (const e of ACCEPT) assert.equal(isInternEmail(e), true, e);
});

test("isInternEmail refuses work and malformed addresses", () => {
  for (const e of REJECT) assert.equal(isInternEmail(e), false, e);
});

test("isAcademicEmail matches whole trailing labels only", () => {
  for (const e of ["a@iitb.ac.in", "a@srmist.edu.in", "a@mit.edu", "a@x.edu.au"]) assert.equal(isAcademicEmail(e), true, e);
  for (const e of ["a@gmail.com", "a@academy.com", "a@education.com", "a@notedu.com", "evil.com@edu", "", "edu"]) {
    assert.equal(isAcademicEmail(e), false, e);
  }
});
