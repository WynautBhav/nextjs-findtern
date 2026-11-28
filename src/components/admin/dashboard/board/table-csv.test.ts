import test from "node:test";
import assert from "node:assert/strict";

import { csvCell, csvText, shownColumns, tableCsv } from "./table-csv.ts";

const COLS = ["Name", "What happened", "Last seen", "Email", "Phone", "College"];
const row = (name: string, o: Record<string, string | number | null> = {}) => ({
  csv: { Name: name, "What happened": "Hired", "Last seen": "1 day ago", Email: `${name.toLowerCase()}@x.in`, Phone: "+91 98765 43210", College: "JKLU", ...o },
});

test("the CSV has the pinned name and exactly the columns on screen, in screen order", () => {
  const on = new Set(["Email", "Last seen", "Name"]); // the chip order does not matter, the table's does
  assert.deepEqual(shownColumns(COLS, on), ["Last seen", "Email"]);
  const t = tableCsv(COLS, on, [row("Asha"), row("Ravi")]);
  assert.deepEqual(t[0], ["Name", "Last seen", "Email"]);
  assert.deepEqual(t[1], ["Asha", "1 day ago", "asha@x.in"]);
  assert.equal(t.length, 3);
});

test("the name stays even if its chip is off; a hidden column never reaches the file", () => {
  const t = tableCsv(COLS, new Set(["College"]), [row("Asha")]);
  assert.deepEqual(t[0], ["Name", "College"]);
  assert.ok(!t.flat().includes("asha@x.in"));
});

test("only the rows given are exported (the search, tab or selection decides them)", () => {
  assert.equal(tableCsv(COLS, new Set(COLS), [row("Asha")]).length, 2);
  assert.equal(tableCsv(COLS, new Set(COLS), []).length, 1);
});

test("companies pin Company", () => {
  const t = tableCsv(["Company", "Size"], new Set(["Size"]), [{ csv: { Company: "Meridian", Size: "11-50" } }]);
  assert.deepEqual(t, [["Company", "Size"], ["Meridian", "11-50"]]);
});

test("cells: formulas defused, phone numbers kept, commas and quotes escaped, empty for missing", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+91 98765 43210"), "+91 98765 43210");
  assert.equal(csvCell("Hired by A, B"), '"Hired by A, B"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), "");
  assert.ok(csvText([["a"], ["b"]]).startsWith("﻿a\r\nb"));
});
