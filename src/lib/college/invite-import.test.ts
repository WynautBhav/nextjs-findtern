import assert from "node:assert/strict";
import { test } from "node:test";

import { driveInput } from "./drive-input.ts";
import { prepareInvited, withUnsent } from "./drive-invite.ts";
import { MAX_INVITES, inviteRowProblem, invitePhone, joinInvitePhone, mergeInvites, parseInviteSheet, splitInvitePhone, toApiRow } from "./invite-import.ts";

const row = (o: Partial<{ name: string; company: string; email: string; phone: string }> = {}) => ({ name: "", company: "Acme", email: "hr@acme.com", phone: "", ...o });

test("a CSV with the four columns is read, headers matched loosely", () => {
  const csv = ["Contact Name,Company Name,E-mail ID,Mobile", "Priya Rao,Acme Ltd,HR@Acme.com,+91 98111 22334", 'Sam,"Beta, Inc",jobs@beta.io,'].join("\r\n");
  const { rows, errors } = parseInviteSheet(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows, [
    { name: "Priya Rao", company: "Acme Ltd", email: "hr@acme.com", phone: "+91 98111 22334" },
    { name: "Sam", company: "Beta, Inc", email: "jobs@beta.io", phone: "" },
  ]);
});

test("Company name is the company, not the person's name, whatever the column order", () => {
  const { rows } = parseInviteSheet("Email,Company name,Name,Phone\na@x.com,Xco,Asha,9811122334");
  assert.deepEqual(rows, [{ name: "Asha", company: "Xco", email: "a@x.com", phone: "9811122334" }]);
});

test("Name and Phone columns are optional; Email and Company are not", () => {
  assert.equal(parseInviteSheet("Company,Email\nAcme,a@acme.com").rows.length, 1);
  assert.match(parseInviteSheet("Company,Phone\nAcme,9811122334").errors[0], /Email/);
  assert.match(parseInviteSheet("Email,Name\na@acme.com,Asha").errors[0], /company/i);
  assert.match(parseInviteSheet("Company,Email").errors[0], /at least one employer/);
});

test("bad rows are skipped with their line number; a bad phone only loses the phone; duplicates keep the first", () => {
  const csv = ["Name,Company,Email,Phone", "A,Acme,a@acme.com,12345", "B,,b@beta.io,", "C,Gamma,not-an-email,", "D,Delta,a@acme.com,9811122334", ",,,", "E,Eps,e@eps.io,9811122334"].join("\n");
  const { rows, errors } = parseInviteSheet(csv);
  assert.deepEqual(rows.map((r) => [r.company, r.phone]), [["Acme", ""], ["Eps", "9811122334"]]);
  assert.equal(errors.length, 4);
  assert.match(errors[0], /^Row 2: .*not a valid 10-digit mobile/);
  assert.match(errors[1], /^Row 3: no company name; skipped/);
  assert.match(errors[2], /^Row 4: "not-an-email" is not an email address; skipped/);
  assert.match(errors[3], /^Row 5: a@acme.com appears twice/);
});

test("hidden characters, quotes and a spreadsheet's semicolons do not break the read", () => {
  const { rows } = parseInviteSheet("﻿Name;Company;Email\nAsha​;Acme;a@acme.com");
  assert.deepEqual(rows, [{ name: "Asha", company: "Acme", email: "a@acme.com", phone: "" }]);
});

test("a huge sheet is refused rather than read", () => {
  const csv = "Company,Email\n" + Array.from({ length: 1200 }, (_, i) => `C${i},c${i}@x.io`).join("\n");
  assert.match(parseInviteSheet(csv).errors[0], /more than 1000 rows/);
});

test("phones: common Indian shapes become 10 digits, junk and foreign numbers are refused", () => {
  for (const ok of ["9811122334", "+91 98111 22334", "098111-22334", "(+91) 98111 22334"]) assert.equal(invitePhone(ok).phone, "9811122334", ok);
  assert.deepEqual(invitePhone("  "), { phone: null, error: null });
  for (const bad of ["12345", "5876543210", "+44 79", "9999999999", "1234567890", "98765 4321a"]) assert.ok(invitePhone(bad).error, bad);
});

test("row problems name the field; a fully blank row is not a problem", () => {
  assert.equal(inviteRowProblem(row()), null);
  assert.equal(inviteRowProblem({ name: "", company: "", email: "", phone: "" }), null);
  assert.equal(inviteRowProblem(row({ company: "  " }))?.field, "company");
  assert.equal(inviteRowProblem(row({ email: "nope" }))?.field, "email");
  assert.equal(inviteRowProblem(row({ phone: "123" }))?.field, "phone");
  assert.deepEqual(toApiRow(row({ name: " Asha  Rao ", email: " HR@Acme.com ", phone: "+91 98111 22334" })), { company: "Acme", email: "hr@acme.com", name: "Asha Rao", phone: "9811122334" });
});

test("importing merges into the typed list: typed rows win, no duplicates, never past the cap", () => {
  const typed = [row({ company: "Typed", email: "a@x.com" }), row({ company: "", email: "", name: "" })];
  const m = mergeInvites(typed, [row({ company: "Imported", email: "a@x.com" }), row({ company: "New", email: "n@x.com" })]);
  assert.deepEqual(m.rows.map((r) => r.company), ["Typed", "New"]);
  assert.deepEqual([m.added, m.duplicates, m.overflow], [1, 1, 0]);
  const full = Array.from({ length: MAX_INVITES - 1 }, (_, i) => row({ email: `c${i}@x.io` }));
  const over = mergeInvites(full, [row({ email: "p@x.io" }), row({ email: "q@x.io" }), row({ email: "r@x.io" })]);
  assert.equal(over.rows.length, MAX_INVITES);
  assert.deepEqual([over.added, over.overflow], [1, 2]);
});

// ── The API's rules ─────────────────────────────────────────────────────────────────
const NOW = Date.now();
const drive = (extra: Record<string, unknown> = {}) => ({
  title: "Summer drive",
  startsAt: new Date(NOW + 3_600_000).toISOString(),
  endsAt: new Date(NOW + 3 * 86_400_000).toISOString(),
  ...extra,
});

test("zod: audience is tech, non_tech or any; anything else is refused; leaving it out is allowed (an edit keeps the saved one)", () => {
  for (const a of ["tech", "non_tech", "any"]) assert.equal(driveInput.safeParse(drive({ audience: a })).data?.audience, a);
  assert.equal(driveInput.safeParse(drive()).data?.audience, undefined);
  for (const bad of ["", "Tech", "nontech", 1, null]) assert.equal(driveInput.safeParse(drive({ audience: bad })).success, false, String(bad));
});

test("zod: an invited employer keeps name and phone, normalised; the phone is optional", () => {
  const r = driveInput.safeParse(drive({ invitedEmployers: [{ company: " Acme ", email: "HR@Acme.com", name: " Priya  Rao ", phone: "+91 98111 22334" }, { company: "Beta", email: "b@beta.io" }] }));
  assert.ok(r.success);
  assert.deepEqual(r.data.invitedEmployers, [
    { company: "Acme", email: "hr@acme.com", name: "Priya Rao", phone: "9811122334" },
    { company: "Beta", email: "b@beta.io" },
  ]);
});

test("zod: a bad phone, a bad email, a missing company, a long name and more than 50 rows are all refused", () => {
  const bad = (e: Record<string, unknown>) => driveInput.safeParse(drive({ invitedEmployers: [{ company: "Acme", email: "a@acme.com", ...e }] }));
  assert.equal(bad({ phone: "12345" }).success, false);
  assert.equal(bad({ phone: "+44 79" }).success, false);
  assert.equal(bad({ email: "nope" }).success, false);
  assert.equal(bad({ company: "   " }).success, false);
  assert.equal(bad({ name: "x".repeat(121) }).success, false);
  assert.equal(bad({ phone: 9811122334 }).success, false);
  const many = Array.from({ length: 51 }, (_, i) => ({ company: `C${i}`, email: `c${i}@x.io` }));
  assert.equal(driveInput.safeParse(drive({ invitedEmployers: many })).success, false);
  assert.equal(driveInput.safeParse(drive({ invitedEmployers: many.slice(0, 50) })).success, true);
});

test("zod: line breaks and control characters cannot get into a company or name (they would break the invite email)", () => {
  const r = driveInput.safeParse(drive({ invitedEmployers: [{ company: "Acme\r\nBcc: x@evil.io", email: "a@acme.com", name: "A\u0000sha" }] }));
  assert.ok(r.success);
  assert.equal(r.data.invitedEmployers?.[0].company, "Acme Bcc: x@evil.io");
  assert.equal(r.data.invitedEmployers?.[0].name, "A sha");
});

test("saving keeps contact details: a row with neither key keeps what is saved, a cleared one is dropped, the unsent flag survives", () => {
  const saved = [{ company: "Acme", email: "hr@acme.com", name: "Priya", phone: "9811122334" }];
  assert.deepEqual(prepareInvited([{ company: "Acme Ltd", email: "HR@acme.com" }], saved), [{ company: "Acme Ltd", email: "HR@acme.com", name: "Priya", phone: "9811122334" }]);
  assert.deepEqual(prepareInvited([{ company: "Acme", email: "hr@acme.com", name: "", phone: "" }], saved), [{ company: "Acme", email: "hr@acme.com" }]);
  assert.deepEqual(prepareInvited([{ company: "Acme", email: "hr@acme.com", name: "Sam" }], saved), [{ company: "Acme", email: "hr@acme.com", name: "Sam" }]);
  assert.deepEqual(prepareInvited([{ company: "New", email: "n@x.io" }], null), [{ company: "New", email: "n@x.io" }]);
  const flagged = withUnsent([{ company: "Acme", email: "hr@acme.com", name: "Priya", phone: "9811122334" }, { company: "B", email: "b@b.io", unsent: true }], ["hr@acme.com"]);
  assert.deepEqual(flagged, [{ company: "Acme", email: "hr@acme.com", name: "Priya", phone: "9811122334", unsent: true }, { company: "B", email: "b@b.io" }]);
});

// Bug sheet 25 Nov: the company phone takes a country code. India stays 10 digits (as stored before); others "+CC digits".
test("invitePhone: a non-Indian number with its country code is kept as '+CC digits'; India still stores 10 digits", () => {
  assert.deepEqual(invitePhone("+44 7700 900123"), { phone: "+44 7700900123", error: null });
  assert.deepEqual(invitePhone("+1 (415) 555-0134"), { phone: "+1 4155550134", error: null });
  assert.deepEqual(invitePhone("+971501234567"), { phone: "+971 501234567", error: null });
  assert.deepEqual(invitePhone("+91 98111 22334"), { phone: "9811122334", error: null });
  assert.deepEqual(invitePhone("98111 22334"), { phone: "9811122334", error: null });
  assert.equal(invitePhone("+44 12").error, "Phone number must be 6 to 15 digits");
  assert.notEqual(invitePhone("+999 1234567").error, null);
  assert.deepEqual(invitePhone(""), { phone: null, error: null });
});

test("splitInvitePhone: the builder's code + number pair, defaulting to +91", () => {
  assert.deepEqual(splitInvitePhone(""), { code: "+91", number: "" });
  assert.deepEqual(splitInvitePhone("9876543210"), { code: "+91", number: "9876543210" });
  assert.deepEqual(splitInvitePhone("+44 7700900123"), { code: "+44", number: "7700900123" });
  assert.equal(joinInvitePhone("+44", "7700 900123"), "+44 7700 900123");
  assert.equal(joinInvitePhone("+91", "98765 43210"), "98765 43210");
  assert.equal(joinInvitePhone("+91", " "), "");
  // A code picked before the number is kept, and counts as no phone until digits follow.
  assert.equal(joinInvitePhone("+44", ""), "+44 ");
  assert.deepEqual(splitInvitePhone("+44 "), { code: "+44", number: "" });
  assert.deepEqual(invitePhone("+44 "), { phone: null, error: null });
  assert.equal(inviteRowProblem(row({ phone: "+44 " })), null);
  assert.equal(inviteRowProblem({ name: "", company: "", email: "", phone: "+44 " }), null);
});
