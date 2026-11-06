import assert from "node:assert/strict";
import { test } from "node:test";

import { buildXlsx } from "../xlsx.ts";
import { parseRosterTable } from "./roster.ts";
import {
  ImportError,
  REASON,
  buildPreviewRows,
  countRows,
  overAllocationOf,
  readTable,
  sha256Hex,
  validateMapping,
  type MatchResult,
} from "./roster-import.ts";

const enc = (s: string) => new TextEncoder().encode(s);

test("the same bytes hash the same, so a re-upload is the same import", () => {
  assert.equal(sha256Hex(enc("a,b\n1,2\n")), sha256Hex(enc("a,b\n1,2\n")));
  assert.notEqual(sha256Hex(enc("a,b\n1,2\n")), sha256Hex(enc("a,b\n1,3\n")));
});

test("readTable reads csv, tsv and xlsx into the same rows", () => {
  const csv = readTable("r.csv", enc("Student Name,Email ID,Mobile\nAsha,asha@x.in,98765 43210\n"));
  const tsv = readTable("r.tsv", enc("Student Name\tEmail ID\tMobile\nAsha\tasha@x.in\t98765 43210\n"));
  const xlsx = readTable("r.xlsx", buildXlsx("Roster", [["Student Name", "Email ID", "Mobile"], ["Asha", "asha@x.in", "98765 43210"]]));
  assert.deepEqual(tsv, csv);
  assert.deepEqual(xlsx, csv);
});

test("readTable refuses other file types, empty files, oversize files and fake xlsx", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ImportError ? e.status : -1;
    }
    return 0;
  };
  assert.equal(code(() => readTable("r.pdf", enc("x"))), 400);
  assert.equal(code(() => readTable("r.csv", new Uint8Array())), 400);
  assert.equal(code(() => readTable("r.csv", new Uint8Array(2_000_001))), 413);
  assert.equal(code(() => readTable("r.xlsx", enc("not a zip"))), 400);
});

const parsed = parseRosterTable([
  ["Student Name", "Email ID", "Mobile"],
  ["Asha", "asha@x.in", "9876543210"], // existing, email-matched
  ["Ravi", "ravi@x.in", "9123456780"], // new, phone review
  ["Meera", "meera@x.in", ""], // new, unmatched
  ["Dup", "ravi@x.in", ""], // duplicate of line 3
  ["Bad", "nope", ""], // invalid
  ["Zed", "zed@x.in", "12345"], // invalid phone
]);

const matches = new Map<string, MatchResult>([
  ["asha@x.in", { kind: "email", userId: "u1" }],
  ["ravi@x.in", { kind: "review", candidates: [{ userId: "u2", reason: "phone" }] }],
]);

test("classification: valid, update, duplicate, invalid, with a reason for each", () => {
  const rows = buildPreviewRows(parsed, new Set(["asha@x.in"]), matches);
  assert.deepEqual(
    rows.map((r) => [r.line, r.status, r.match ?? null, r.reason ?? null]),
    [
      [2, "update", "email", REASON.update],
      [3, "valid", "review", REASON.samePhone],
      [4, "valid", "unmatched", null],
      [5, "duplicate", null, "Duplicate of line 3"],
      [6, "invalid", null, "Email is not valid (nope)"],
      [7, "invalid", null, "Phone is not a 10-digit mobile number"],
    ],
  );
  assert.deepEqual(countRows(rows), { total: 6, valid: 2, invalid: 2, duplicate: 1, update: 1, matchedEmail: 1, review: 1, unmatched: 1 });
});

test("a name-only candidate is worded as a name match", () => {
  const p = parseRosterTable([["Name", "Email"], ["Asha", "a@x.in"]]);
  const rows = buildPreviewRows(p, new Set(), new Map([["a@x.in", { kind: "review", candidates: [{ userId: "u", reason: "name" }] }]]));
  assert.equal(rows[0].reason, REASON.sameName);
});

test("over-allocation compares the roster after the import with the paid seats", () => {
  assert.deepEqual(overAllocationOf(280, 20, 300), { rosterAfter: 300, paidSeats: 300, over: false });
  assert.deepEqual(overAllocationOf(280, 21, 300), { rosterAfter: 301, paidSeats: 300, over: true });
  assert.equal(overAllocationOf(0, 1, 0).over, true);
});

test("mapping must point at real columns, and the email is required", () => {
  assert.equal(validateMapping({ name: 0, email: 1, phone: 2 }, 3), null);
  assert.equal(validateMapping({ name: -1, email: 1, phone: null }, 3), null);
  assert.match(validateMapping({ name: 0, email: -1, phone: null }, 3) ?? "", /email/);
  assert.match(validateMapping({ name: 0, email: 5, phone: null }, 3) ?? "", /email/);
  assert.match(validateMapping({ name: 9, email: 1, phone: null }, 3) ?? "", /name/);
  assert.match(validateMapping({ name: 0, email: 1, phone: 3 }, 3) ?? "", /phone/);
});
