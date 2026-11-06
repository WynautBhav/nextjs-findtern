import assert from "node:assert/strict";
import { test } from "node:test";

import { buildXlsx } from "../xlsx.ts";
import { parseRosterTable } from "./roster.ts";
import {
  ImportError,
  MAX_IMPORT_ROWS,
  REASON,
  buildPreviewRows,
  candidateShown,
  decisionBlock,
  countRows,
  overAllocationOf,
  readTable,
  sha256Hex,
  storedFrom,
  validateMapping,
  withoutCells,
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

test("readTable refuses a file with more than 5,000 students, csv or xlsx", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof ImportError ? e.status : -1;
    }
    return 0;
  };
  const line = (i: number) => `S${i},s${i}@x.in\n`;
  const csv = (n: number) => enc("Name,Email\n" + Array.from({ length: n }, (_, i) => line(i)).join(""));
  assert.equal(readTable("r.csv", csv(MAX_IMPORT_ROWS)).length, MAX_IMPORT_ROWS + 1);
  assert.equal(code(() => readTable("r.csv", csv(MAX_IMPORT_ROWS + 1))), 413);
  const rows = [["Name", "Email"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`S${i}`, `s${i}@x.in`])];
  assert.equal(code(() => readTable("r.xlsx", buildXlsx("Roster", rows))), 413);
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

test("only a review or unmatched row can be decided; rejected, linked and email rows give 409", () => {
  assert.equal(decisionBlock("review"), null);
  assert.equal(decisionBlock("unmatched"), null);
  for (const st of ["rejected", "linked", "email"]) assert.equal(decisionBlock(st)?.status, 409, st);
});

test("link shortcut: phone only counts for an Indian number, verified email must equal the row", () => {
  const row = { email: "asha@x.in", phone: "9876543210", matchCandidates: [{ userId: "c1" }] };
  const user = { id: "u1", email: "other@y.in", verified: false, phone: "9876543210", countryCode: "+91" };
  assert.equal(candidateShown(row, user), true);
  assert.equal(candidateShown(row, { ...user, countryCode: "+1" }), false);
  assert.equal(candidateShown(row, { ...user, phone: "9000000000" }), false);
  assert.equal(candidateShown(row, { ...user, id: "c1", phone: "9000000000" }), true);
  assert.equal(candidateShown(row, { ...user, phone: "1", email: "asha@x.in", verified: true }), true);
  assert.equal(candidateShown(row, { ...user, phone: "1", email: "asha@x.in", verified: false }), false);
});

test("a stored import keeps only the columns the roster reads; commit/discard drop the cells (review #10)", () => {
  const table = [
    ["Name", "Email", "DOB", "Aadhaar", "Roll No", "Address"],
    ["Asha", "asha@x.in", "2004-01-02", "1234 5678 9012", "R1", "12 MG Road"],
  ];
  const parsed = parseRosterTable(table);
  const rows = buildPreviewRows(parsed, new Set(), new Map());
  const stored = storedFrom(rows, table, parsed.mapping);
  assert.deepEqual(stored[0].cells, table[0], "header names stay for the mapping UI");
  assert.deepEqual((stored[1] as { cells: string[] }).cells, ["Asha", "asha@x.in", "", "", "R1", ""]);
  assert.ok(!JSON.stringify(stored).includes("1234 5678 9012"));
  // Remapping away from a detected column keeps it, so the admin can switch back (e2e college-roster).
  const t2 = [["Name", "Email", "Phone", "DOB"], ["Asha", "asha@x.in", "9876543210", "2004"]];
  const off = storedFrom(rows, t2, { name: 0, email: 1, phone: null });
  assert.deepEqual(off[0].kept?.sort(), [0, 1, 2]);
  // No email column yet: the admin still has to pick one, so the row is kept whole.
  const open = storedFrom(rows, table, { name: 0, email: -1, phone: null });
  assert.deepEqual((open[1] as { cells: string[] }).cells, table[1]);
  const done = withoutCells(stored);
  assert.deepEqual((done[1] as { cells: string[]; email: string }).cells, []);
  assert.equal((done[1] as { email: string }).email, "asha@x.in");
});
