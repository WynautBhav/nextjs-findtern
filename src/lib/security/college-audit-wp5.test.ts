import assert from "node:assert/strict";
import test from "node:test";

import { decodeRosterBytes, parseRoster, readPhone } from "../college/roster.ts";
import { codeUnusableSql } from "../drives/code-eligibility.ts";

/** WP5 (college audit): roster reading, mail eligibility. Pure: no DB. */

test("WP5-U1 an invisible character inside an email is not part of the address", () => {
  const { rows } = parseRoster("Name,Email\nA B,a\u200bb@x.in\nC D,c.d@x.in\u200b");
  assert.deepEqual(rows.map((r) => r.email), ["ab@x.in", "c.d@x.in"]);
});

test("WP5-U2 a parent's email or phone column never stands in for the student's", () => {
  const { rows } = parseRoster("Student Name,Parent Email,Student Email,Parent Mobile,Student Mobile\nAsha Rao,dad@gmail.com,asha@x.in,9811111111,9822222222");
  assert.equal(rows[0].email, "asha@x.in");
  assert.equal(rows[0].phone, "9822222222");
  const only = parseRoster("Name,Guardian Email\nAsha Rao,dad@gmail.com");
  assert.equal(only.rows.length, 0);
  const father = parseRoster("Name,Email,Father's Contact No,Mobile\nAsha Rao,asha@x.in,9811111111,9822222222");
  assert.equal(father.rows[0].phone, "9822222222");
});

test("WP5-U3 a phone is an Indian mobile or it is not saved: nothing is cut down to its last ten digits", () => {
  const ok = ["9876543210", "+91 98765-43210", "919876543210", "09876543210", "+91-9876543210", "0091 98765 43210", "9876543210.0", "'9876543210"];
  for (const p of ok) assert.equal(readPhone(p), "9876543210", p);
  const no = ["+44 9876543210", "449876543210", "98765432101", "19876543210", "5876543210", "987654321", "9.8765E9", "", "abc"];
  for (const p of no) assert.equal(readPhone(p), null, p);
  const r = parseRoster("Name,Email,Phone\nA,a@x.in,+44 9876543210");
  assert.equal(r.rows[0].phone, null);
  assert.match(r.errors[0], /not a 10-digit mobile/);
});

test("WP5-U4 a file saved in Windows-1252 or UTF-16 is read, not turned into replacement characters", () => {
  assert.equal(decodeRosterBytes(Buffer.from("Name,Email\nJosé,j@x.in\n", "utf8")), "Name,Email\nJosé,j@x.in\n");
  assert.equal(decodeRosterBytes(Buffer.from("Name,Email\nJos\xe9,j@x.in\n", "latin1")), "Name,Email\nJosé,j@x.in\n");
  assert.equal(decodeRosterBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Name\tEmail\nA\ta@x.in\n", "utf16le")])), "Name\tEmail\nA\ta@x.in\n");
  assert.equal(decodeRosterBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Name,Email\n", "utf8")])), "Name,Email\n");
});

test("WP5-L4 the 'college paid' / code mail skips a student the college cannot let in", () => {
  const sql = codeUnusableSql("e", "o.college_id");
  assert.match(sql, /college_denials/);
  assert.match(sql, /intern_payments/);
  assert.match(sql, /college_memberships/);
  assert.match(sql, /mem\.college_id <> o\.college_id/);
  assert.match(sql, /e\.intern_id/);
});

import { normaliseEmail, normaliseName, normalisePhoneE164 } from "../drives/import/normalize.ts";

test("WP5-U5 drive sheet: invisible characters never reach a name, an email or a phone", () => {
  assert.equal(normaliseName("Zero\u200bWidth  Name\ufeff"), "ZeroWidth Name");
  assert.equal(normaliseEmail("mail\u200bzw@x.in"), "mailzw@x.in");
  assert.equal(normaliseEmail("\ufeffA@X.IN\u200b"), "a@x.in");
  assert.equal(normalisePhoneE164("+91\u200b 98765-43210"), "+919876543210");
});

test("INT-08 a sheet row whose account was NOT linked (denied / other college: WP4 leaves intern_id empty) is still skipped by its verified email", () => {
  const sql = codeUnusableSql("e", "o.college_id");
  assert.match(sql, /lower\(u\.email\) = e\.college_email_norm/);
  assert.match(sql, /u\.email_verified/);
  assert.doesNotMatch(sql, /e\.intern_id = /, "all arms must use the matched account, not only the linked one");
});
