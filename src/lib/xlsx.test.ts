import assert from "node:assert/strict";
import { test } from "node:test";

import { buildXlsx, columnName, crc32 } from "./xlsx.ts";

test("column names roll over like Excel", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(701), "ZZ");
});

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("buildXlsx writes a zip with the workbook parts", () => {
  const file = buildXlsx("Timesheet", [["Date", "Status"], ["2026-11-01", "Present"], ["Days", 1]]);
  const text = new TextDecoder("latin1").decode(file);
  assert.equal(file[0], 0x50); // "PK"
  assert.equal(file[1], 0x4b);
  assert.ok(text.includes("[Content_Types].xml"));
  assert.ok(text.includes("xl/worksheets/sheet1.xml"));
  assert.ok(text.includes("<v>1</v>"));
  assert.ok(text.includes("Present"));
});
