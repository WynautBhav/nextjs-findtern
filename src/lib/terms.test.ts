import assert from "node:assert/strict";
import test from "node:test";

import { acceptanceTableFor, acceptanceValues, CURRENT_TERMS_VERSION, shouldShowTermsPrompt, termsHrefFor } from "./terms.ts";

test("the version is an ISO date, so a later one always sorts after it", () => {
  assert.match(CURRENT_TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("never accepted: show the prompt", () => {
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: null }), true);
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: undefined }), true);
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: "" }), true);
});

test("an older version: show the prompt again", () => {
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: "2026-10-18" }), true);
});

test("the current version: never show it again", () => {
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: CURRENT_TERMS_VERSION }), false);
});

test("an admin viewing as someone is never shown (or able to answer) their prompt", () => {
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: null, impersonating: true }), false);
});

test("each role is sent to its own terms page", () => {
  assert.equal(termsHrefFor("intern"), "/intern-terms-and-conditions");
  assert.equal(termsHrefFor("employer"), "/employer-terms-and-conditions");
  assert.equal(termsHrefFor("college"), "/terms-and-conditions");
});

test("acceptance is written to the table that holds that role's account", () => {
  assert.equal(acceptanceTableFor("intern"), "users");
  assert.equal(acceptanceTableFor("employer"), "employers");
  assert.equal(acceptanceTableFor("college"), "collegeAdmins");
});

test("acceptance stamps the server's version and the given time, so signup and the API agree", () => {
  const at = new Date("2026-11-04T10:00:00.000Z");
  assert.deepEqual(acceptanceValues(at), { termsAcceptedVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: at });
  assert.equal(shouldShowTermsPrompt({ acceptedVersion: acceptanceValues(at).termsAcceptedVersion }), false);
});

import { termsBlocksRequest } from "./terms.ts";

test("terms enforcement: accepted users are never blocked", () => {
  for (const role of ["intern", "employer", "college"]) assert.equal(termsBlocksRequest({ role, method: "POST", accepted: true }), false);
});

test("terms enforcement: a user behind is blocked on writes only", () => {
  for (const role of ["intern", "employer", "college"]) {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(termsBlocksRequest({ role, method, accepted: false }), true);
    for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(termsBlocksRequest({ role, method, accepted: false }), false);
  }
});

test("terms enforcement: admin staff and View-as sessions are never blocked", () => {
  assert.equal(termsBlocksRequest({ role: "admin", method: "POST", accepted: false }), false);
  assert.equal(termsBlocksRequest({ role: "intern", method: "POST", impersonating: true, accepted: false }), false);
});
