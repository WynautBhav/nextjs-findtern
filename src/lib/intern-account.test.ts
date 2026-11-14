import assert from "node:assert/strict";
import { test } from "node:test";

import { decideAccountType, getAccountType, isCodeVerifiedMembership } from "./intern-account.ts";

test("getAccountType reads only the two known values; everything else is null", () => {
  assert.equal(getAccountType({ accountType: "individual" }), "individual");
  assert.equal(getAccountType({ accountType: "college" }), "college");
  for (const v of [null, undefined, {}, [], "college", 7, { accountType: "COLLEGE" }, { accountType: "" }, { accountType: true }, { accountType: ["college"] }]) {
    assert.equal(getAccountType(v), null);
  }
});

test("college needs a code-backed membership; individual never does", () => {
  const base = { current: null, paid: false } as const;
  assert.deepEqual(decideAccountType({ ...base, requested: "individual", codeVerified: false }), { ok: true, type: "individual" });
  const noCode = decideAccountType({ ...base, requested: "college", codeVerified: false });
  assert.equal(noCode.ok, false);
  assert.deepEqual(decideAccountType({ ...base, requested: "college", codeVerified: true }), { ok: true, type: "college" });
});

test("a candidate who paid cannot flip into the college view; a college account that paid stays", () => {
  assert.equal(decideAccountType({ requested: "college", current: "individual", codeVerified: true, paid: true }).ok, false);
  assert.equal(decideAccountType({ requested: "college", current: null, codeVerified: true, paid: true }).ok, false);
  assert.deepEqual(decideAccountType({ requested: "college", current: "college", codeVerified: true, paid: true }), { ok: true, type: "college" });
});

test("which memberships can back a college account", () => {
  const m = (verifiedBy: string | null, status = "verified", leftAt: Date | null = null) => ({ status, verifiedBy, leftAt });
  for (const by of ["college_code", "promo", "drive_code", "roster"]) assert.equal(isCodeVerifiedMembership(m(by)), true, by);
  assert.equal(isCodeVerifiedMembership(m("email_domain")), false);
  assert.equal(isCodeVerifiedMembership(m(null)), false);
  assert.equal(isCodeVerifiedMembership(m("college_code", "claimed")), false);
  assert.equal(isCodeVerifiedMembership(m("college_code", "verified", new Date())), false);
  assert.equal(isCodeVerifiedMembership(null), false);
});
