import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

import { promoConsentNotice } from "./promo-consent.ts";
import { consentProblem, membershipFromPromo, promoConsentHash } from "./promo-membership.ts";
import { generateTpoCode } from "./code.ts";
import { SEATS_USED_UP, collegeCodeProblem, promoProblem, seatCapProblem, seatFreeWhere } from "../promo-rules.ts";

const row = (usedCount: number, collegeId: string | null = "c1") => ({
  code: "X", discountType: "percentage", discountValue: 100, maxUsages: 300, usedCount,
  minOrderAmountMinor: null, validFrom: null, validUntil: null, isActive: true, collegeId,
});

test("cap edge: seat 300 of 300 is free at 299 used, refused at 300", () => {
  assert.equal(promoProblem(row(299), 249900, "INR"), null);
  assert.equal(promoProblem(row(300), 249900, "INR"), SEATS_USED_UP);
  assert.equal(promoProblem(row(300, null), 249900, "INR"), "Promo code exhausted");
});

test("the seat increment only matches while a seat is free", () => {
  const q = new PgDialect().sqlToQuery(seatFreeWhere("p1"));
  assert.equal(q.sql, "id = $1 AND (max_usages IS NULL OR used_count < max_usages)");
  assert.deepEqual(q.params, ["p1"]);
});

test("admin cap edit: never below the seats used, whole number, at least 1", () => {
  assert.equal(seatCapProblem(212, 212), null);
  assert.match(seatCapProblem(211, 212)!, /212 seats are already used/);
  assert.ok(seatCapProblem(0, 0));
  assert.ok(seatCapProblem(1.5, 0));
});

test("18+ consent is required with a college code", () => {
  assert.equal(consentProblem(true), null);
  for (const v of [false, undefined, "true", 1, null]) assert.ok(consentProblem(v));
});

test("the stored consent hash is of the exact wording shown, with the college name", () => {
  const shown = promoConsentNotice("IIT Example");
  assert.match(shown, /placement office of IIT Example, which pays/);
  assert.equal(promoConsentHash("IIT Example"), createHash("sha256").update(shown).digest("hex"));
  assert.notEqual(promoConsentHash("IIT Example"), promoConsentHash("NIT Other"));
});

test("verification: new, same college, other college", () => {
  assert.deepEqual(membershipFromPromo(null, "c1"), { collegeId: "c1", status: "verified", verifiedBy: "promo", year: null, branch: null, leftAt: null });
  const mine = { collegeId: "c1", status: "claimed", verifiedBy: null, year: 3, branch: "CSE", leftAt: null };
  assert.deepEqual(membershipFromPromo(mine, "c1"), { collegeId: "c1", status: "verified", verifiedBy: "promo", year: 3, branch: "CSE", leftAt: null });
  assert.equal(membershipFromPromo({ ...mine, status: "verified", verifiedBy: "email_domain" }, "c1").verifiedBy, "email_domain");
  const moved = membershipFromPromo(mine, "c2");
  assert.deepEqual([moved.collegeId, moved.year, moved.branch, moved.verifiedBy], ["c2", null, null, "promo"]);
  assert.equal(membershipFromPromo({ ...mine, leftAt: new Date() }, "c1").year, null);
});

test("TPO code: 8 characters from the unambiguous alphabet", () => {
  assert.match(generateTpoCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
});

test("a college code works only while the college is active and a partner", () => {
  assert.equal(collegeCodeProblem({ isActive: true, isPartner: true }), null);
  for (const c of [null, { isActive: false, isPartner: true }, { isActive: true, isPartner: false }]) {
    assert.match(collegeCodeProblem(c)!, /not active/);
  }
});
