import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRoster, readYear, splitCsv } from "./roster.ts";

test("loose headers, BOM, quotes and CRLF", () => {
  const csv = '﻿Roll No,Student Name,Email ID,Department,Year\r\n21CS001,"Sharma, Asha",Asha@JKLU.edu.in,CSE,3rd\r\n21CS002,Ravi,ravi@jklu.edu.in,"ECE",IV\r\n';
  const { rows, errors } = parseRoster(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], { email: "asha@jklu.edu.in", name: "Sharma, Asha", rollNo: "21CS001", year: 3, branch: "CSE" });
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
