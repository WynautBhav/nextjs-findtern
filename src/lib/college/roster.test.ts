import { test } from "node:test";
import assert from "node:assert/strict";

import { detectMapping, normalizeEmails, normalizePhone, parseRoster, parseRosterTable, removalEmails, readYear, splitCsv } from "./roster.ts";

test("loose headers, BOM, quotes and CRLF", () => {
  const csv = '﻿Roll No,Student Name,Email ID,Department,Year\r\n21CS001,"Sharma, Asha",Asha@JKLU.edu.in,CSE,3rd\r\n21CS002,Ravi,ravi@jklu.edu.in,"ECE",IV\r\n';
  const { rows, errors } = parseRoster(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], { email: "asha@jklu.edu.in", name: "Sharma, Asha", rollNo: "21CS001", year: 3, branch: "CSE", phone: null });
  assert.equal(rows[1].year, 4);
});

test("semester column becomes year of study", () => {
  const { rows } = parseRoster("email,semester\na@x.in,5\nb@x.in,2\n");
  assert.deepEqual(rows.map((r) => r.year), [3, 1]);
});

test("bad emails and duplicates are reported, not imported", () => {
  const { rows, errors } = parseRoster("email\na@x.in\nnot-an-email\nA@x.in\n");
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 2);
});

test("no email column is a clear error", () => {
  assert.match(parseRoster("name,roll\nAsha,1\n").errors[0], /No email column/);
});

test("readYear forms", () => {
  assert.equal(readYear("Third year"), 3);
  assert.equal(readYear("final"), 4);
  assert.equal(readYear("9"), null);
  assert.equal(readYear(""), null);
});

test("splitCsv keeps newlines inside quotes", () => {
  assert.deepEqual(splitCsv('a,b\n"x\ny",z\n'), [["a", "b"], ["x\ny", "z"]]);
});

test("semicolon-separated export splits on the header's delimiter", () => {
  const { rows, errors } = parseRoster("Name;Email;Year\nAsha;asha@x.in;3\nRavi, Jr;ravi@x.in;2\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map((r) => [r.name, r.email, r.year]), [["Asha", "asha@x.in", 3], ["Ravi, Jr", "ravi@x.in", 2]]);
});

test("a semicolon or comma can't hide inside an email", () => {
  const { rows, errors } = parseRoster('email\n"a;b@x.in"\n"a,b@x.in"\n');
  assert.equal(rows.length, 0);
  assert.equal(errors.length, 2);
});

test("normalizeEmails lower-cases, de-duplicates and drops junk", () => {
  assert.deepEqual(normalizeEmails([" A@x.in", "a@x.in", "nope", "b@x.in"]), ["a@x.in", "b@x.in"]);
});

test("removalEmails keeps rows the old semicolon bug stored, which are not valid emails", () => {
  assert.deepEqual(removalEmails([" semi;x@qati.edu.in "]), ["semi;x@qati.edu.in"]);
  assert.deepEqual(removalEmails(["Asha@X.in", "", "  "]), ["Asha@X.in", "asha@x.in"]);
  assert.deepEqual(normalizeEmails(["semi;x@qati.edu.in"]), []);
});

test("normalizePhone: +91, spaces, leading 0 and 91 prefix all reduce to 10 digits", () => {
  for (const raw of ["98765 43210", "+91-98765-43210", "09876543210", "919876543210", "+91 98765 43210", "9876543210"]) {
    assert.equal(normalizePhone(raw), "9876543210", raw);
  }
  for (const raw of ["12345 67890", "98765", "987654321012", "abc", ""]) assert.equal(normalizePhone(raw), null, raw);
});

test("header variants: Student Name / Email ID / Mobile", () => {
  const { rows, errors, mapping } = parseRoster("Student Name,Email ID,Mobile\nAsha,asha@x.in,+91 98765 43210\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(mapping, { name: 0, email: 1, phone: 2 });
  assert.equal(rows[0].phone, "9876543210");
  for (const [h, want] of [
    ["E-mail Address", 0],
    ["Phone Number", 0],
    ["Contact No", 0],
    ["Full Name", 0],
  ] as const) {
    const m = detectMapping([h]);
    assert.ok(m.email === want || m.phone === want || m.name === want, h);
  }
});

test("a parent's email or phone column is not the student's", () => {
  const m = detectMapping(["Parent Email", "Student Email", "Father Mobile", "Mobile"]);
  assert.equal(m.email, 1);
  assert.equal(m.phone, 3);
});

test("manual mapping overrides the detected columns", () => {
  const table = [["A", "B", "C"], ["Asha", "asha@x.in", "9876543210"]];
  assert.match(parseRosterTable(table).errors[0], /No email column/);
  const p = parseRosterTable(table, { name: 0, email: 1, phone: 2 });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.rows[0], { email: "asha@x.in", name: "Asha", rollNo: null, year: null, branch: null, phone: "9876543210" });
});

test("every bad row is listed with its line and a sentence reason", () => {
  const p = parseRoster("Name,Email,Phone\nA,a@x.in,98765 43210\nZ,,\nB,not-mail,\nC,c@x.in,12345\nD,A@x.in,\n");
  assert.deepEqual(
    p.results.map((r) => [r.line, r.status, r.reason ?? ""]),
    [
      [2, "valid", ""],
      [3, "invalid", "Missing email"],
      [4, "invalid", "Email is not valid (not-mail)"],
      [5, "invalid", "Phone is not a 10-digit mobile number"],
      [6, "duplicate", "Duplicate of line 2"],
    ],
  );
  assert.equal(p.errors.length, 4);
});

test("more than twenty bad rows are all reported", () => {
  const body = Array.from({ length: 30 }, (_, i) => `bad${i}`).join("\n");
  assert.equal(parseRoster(`email\n${body}\n`).errors.length, 30);
});
