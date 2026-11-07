import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";

import { readXlsxRows, XLSX_MAX_CELLS } from "./xlsx.ts";

/** A one-sheet workbook whose sheet1.xml is `sheetXml` (deflated, like Excel writes). */
function workbook(sheetXml: string): Buffer {
  const files: Record<string, string> = { "xl/worksheets/sheet1.xml": sheetXml };
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    parts.push(local, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

test("a far-right cell ref (ZZZZZZZZ1) is refused instead of padding a row to 10^11 cells", () => {
  const file = workbook(sheet('<row r="1"><c r="ZZZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row>'));
  assert.throws(() => readXlsxRows(file), /Too many columns/);
});

test("column 256 (IV) is the last one read; IW is refused", () => {
  const ok = workbook(sheet('<row r="1"><c r="IV1"><v>1</v></c></row>'));
  assert.equal(readXlsxRows(ok)[0].length, 256);
  const bad = workbook(sheet('<row r="1"><c r="IW1"><v>1</v></c></row>'));
  assert.throws(() => readXlsxRows(bad), /Too many columns/);
});

test("a sheet with more than 5,000 x 64 cells fails while parsing", () => {
  const wide = '<c r="BL1"><v>1</v></c>'; // column 64: each row pads to 64 cells
  const rowsOk = Array.from({ length: XLSX_MAX_CELLS / 64 }, () => `<row>${wide}</row>`).join("");
  assert.equal(readXlsxRows(workbook(sheet(rowsOk))).length, XLSX_MAX_CELLS / 64);
  const rowsBad = rowsOk + `<row>${wide}</row>`;
  assert.throws(() => readXlsxRows(workbook(sheet(rowsBad))), /Too many cells/);
});
