import assert from "node:assert/strict";
import { test } from "node:test";

import { emailDomain, websiteDomainError, websiteHost, websiteMatchesEmailDomain } from "./company-domain.ts";

test("websiteHost strips protocol, www, port, path and case", () => {
  assert.equal(websiteHost("acme.com"), "acme.com");
  assert.equal(websiteHost("https://www.Acme.com/careers?x=1"), "acme.com");
  assert.equal(websiteHost("http://careers.acme.com:8080/"), "careers.acme.com");
  assert.equal(websiteHost("WWW.ACME.COM."), "acme.com");
  assert.equal(websiteHost(""), null);
  assert.equal(websiteHost("acme"), null);
  assert.equal(websiteHost("ftp://acme.com"), null);
  assert.equal(websiteHost("not a url"), null);
});

test("emailDomain takes the part after the last @", () => {
  assert.equal(emailDomain("Owner@Acme.com "), "acme.com");
  assert.equal(emailDomain("nope"), "");
});

test("website must be the email domain or a subdomain of it", () => {
  const email = "owner@acme.com";
  for (const ok of ["acme.com", "https://acme.com", "www.acme.com", "https://www.acme.com/about", "careers.acme.com", "a.b.acme.com"]) {
    assert.equal(websiteMatchesEmailDomain(ok, email), true, ok);
    assert.equal(websiteDomainError(ok, email), null, ok);
  }
  for (const bad of ["acme.io", "notacme.com", "acme.com.evil.io", "evilacme.com"]) {
    assert.equal(websiteMatchesEmailDomain(bad, email), false, bad);
    assert.match(websiteDomainError(bad, email) ?? "", /acme\.com/, bad);
  }
});

test("a parent domain does not satisfy a subdomain email", () => {
  assert.equal(websiteMatchesEmailDomain("acme.com", "hr@mail.acme.com"), false);
  assert.equal(websiteMatchesEmailDomain("mail.acme.com", "hr@mail.acme.com"), true);
});

test("websiteDomainError: malformed websites and the skip switch", () => {
  assert.match(websiteDomainError("acme", "owner@acme.com") ?? "", /does not look like a website/);
  assert.equal(websiteDomainError("anything.io", "someone@gmail.com", { skipDomainCheck: true }), null);
});
