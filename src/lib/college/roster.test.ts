import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeEmails, parseRoster, readPhone, removalEmails, readYear, splitCsv } from "./roster.ts";

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

test("parseRoster reads a phone column and keeps the row when the number is bad", () => {
  const { rows, errors } = parseRoster("Name,Mobile No,Email\nRiya,+91 98765-43210,riya@x.edu\nAman,12345,aman@x.edu\nZoya,,zoya@x.edu");
  assert.deepEqual(rows.map((r) => r.phone), ["9876543210", null, null]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Row 3/);
});

test("readPhone (R2-05): common Indian formats are read, wrong countries, typos and decimals still are not", () => {
  for (const ok of ["(+91) 98765 43210", "+91 0 98765 43210", "+91-098765-43210", "(+91)9876543210", " +91 98765 43210", "098765 43210", "0091 98765 43210", "9876543210.0", "'9876543210"]) assert.equal(readPhone(ok), "9876543210", ok);
  for (const bad of ["+44 98765 43210", "(+44) 7911 123456", "987654321011", "98765432101", "+91 98765 4321", "12345", "91 98765+43210", "++91 98765 43210", "9876543210.5", "call 9876543210"]) assert.equal(readPhone(bad), null, bad);
});

test("parseRoster (R2-05): a guardian's phone column is never the student's number", () => {
  const { rows } = parseRoster("Name,Email,Mobile No,Parent Mobile\nRiya,riya@x.edu,(+91) 98765 43210,9123456789\nAman,aman@x.edu,,9123456789");
  assert.deepEqual(rows.map((r) => r.phone), ["9876543210", null]);
});
