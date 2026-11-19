import test from "node:test";
import assert from "node:assert/strict";

import { FREE_EMAIL_DOMAIN_COUNT, isFreeEmailDomain } from "./free-email-domains.ts";

test("the vendored list is a few hundred domains", () => {
  assert.ok(FREE_EMAIL_DOMAIN_COUNT >= 250, String(FREE_EMAIL_DOMAIN_COUNT));
});

test("big providers and their regional variants are free mail", () => {
  for (const d of [
    "gmail.com", "googlemail.com", "msn.com", "live.com", "live.nl", "outlook.com", "outlook.de", "outlook.com.au",
    "hotmail.com", "hotmail.co.uk", "yahoo.com", "yahoo.co.in", "yahoo.co.jp", "ymail.com", "icloud.com", "me.com",
    "mac.com", "proton.me", "protonmail.com", "protonmail.ch", "pm.me", "aol.com", "gmx.com", "gmx.de", "gmx.net",
    "mail.com", "yandex.com", "yandex.ru", "zoho.com", "zohomail.in", "rediffmail.com",
  ]) {
    assert.equal(isFreeEmailDomain(d), true, d);
  }
});

test("subdomains of a free provider count", () => {
  for (const d of ["mail.yahoo.co.in", "a.b.gmail.com", "x.outlook.de", "smtp.proton.me"]) {
    assert.equal(isFreeEmailDomain(d), true, d);
  }
});

test("company and college domains are not free mail", () => {
  for (const d of ["acme.in", "acme.ac.in", "acme.com", "iitb.ac.in", "mit.edu", "gmail.acme.com", "notgmail.com", "yahoo-corp.com", "outlook.acme.in"]) {
    assert.equal(isFreeEmailDomain(d), false, d);
  }
});

test("matching is case-insensitive and tolerant of a trailing dot; malformed input is not free", () => {
  assert.equal(isFreeEmailDomain("GMail.COM"), true);
  assert.equal(isFreeEmailDomain("gmail.com."), true);
  for (const d of ["", "com", "in", "gmail", "a..com"]) assert.equal(isFreeEmailDomain(d), false, d);
});
