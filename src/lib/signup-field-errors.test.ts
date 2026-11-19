import test from "node:test";
import assert from "node:assert/strict";

import { employerSignupErrors, internSignupErrors, passwordFieldError, phoneFieldError } from "./signup-field-errors.ts";

const GOOD_INTERN = { firstName: "Asha", lastName: "Rao", email: "asha@gmail.com", countryCode: "+91", phoneNumber: "9812345670", password: "Abcdef1!", agreedToTerms: true };
const GOOD_EMPLOYER = { name: "Asha Rao", companyName: "Acme", email: "hiring@acme.in", countryCode: "+91", phoneNumber: "9812345670", password: "Abcdef1!", agreedToTerms: true };

test("a complete intern form has no errors; a college or personal address is fine", () => {
  assert.deepEqual(internSignupErrors(GOOD_INTERN), {});
  assert.deepEqual(internSignupErrors({ ...GOOD_INTERN, email: "a@iitb.ac.in" }), {});
});

test("intern form names the bad email, weak password and short phone", () => {
  const e = internSignupErrors({ ...GOOD_INTERN, email: "not-an-email", password: "abc", phoneNumber: "98765" });
  assert.match(e.email!, /valid email/);
  assert.match(e.password!, /at least 8 characters.*an uppercase letter.*a number.*special character/);
  assert.match(e.phoneNumber!, /10 digits/);
});

test("empty fields say what to enter", () => {
  const e = internSignupErrors({ ...GOOD_INTERN, email: "", password: "", phoneNumber: "", firstName: "", agreedToTerms: false });
  for (const k of ["email", "password", "phoneNumber", "firstName", "agreedToTerms"] as const) assert.ok(e[k], k);
});

test("employer form refuses free-mail addresses with a reason, accepts a company domain", () => {
  assert.deepEqual(employerSignupErrors(GOOD_EMPLOYER), {});
  assert.match(employerSignupErrors({ ...GOOD_EMPLOYER, email: "a@outlook.de" }).email!, /company email/);
  assert.match(employerSignupErrors({ ...GOOD_EMPLOYER, email: "a@mail.yahoo.co.in" }).email!, /company email/);
  assert.deepEqual(employerSignupErrors({ ...GOOD_EMPLOYER, email: "a@acme.ac.in" }), {});
});

test("password and phone helpers", () => {
  assert.equal(passwordFieldError("Abcdef1!"), null);
  assert.match(passwordFieldError("abcdefgh")!, /uppercase/);
  assert.equal(phoneFieldError("+91", "9812345670"), null);
  assert.equal(phoneFieldError("+91", "  "), "Enter your phone number.");
});
