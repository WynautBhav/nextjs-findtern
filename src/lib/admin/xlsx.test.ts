import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";

import { isXlsx, readXlsxRows, writeXlsx } from "./xlsx.ts";

test("writeXlsx output reads back through readXlsxRows", () => {
  const rows = [
    ["email", "communication", "ai interview"],
    ["a&b@example.com", 8, 6.5],
  ];
  const file = writeXlsx(rows, "ratings");
  assert.ok(isXlsx(file));
  assert.deepEqual(readXlsxRows(file), [
    ["email", "communication", "ai interview"],
    ["a&b@example.com", "8", "6.5"],
  ]);
});

test("reads shared strings, sparse cells and deflated entries like Excel writes them", () => {
  // Hand-built workbook: shared strings, a gap at column B, deflate method.
  const files: Record<string, string> = {
    "xl/workbook.xml":
      '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId7"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId7" Target="worksheets/data.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>email</t></si><si><r><t>x@</t></r><r><t>y.in</t></r></si></sst>",
    "xl/worksheets/data.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>coding</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>7</v></c></row><row r="3"></row></sheetData></worksheet>',
  };
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
  const file = Buffer.concat([...parts, cd, end]);

  assert.deepEqual(readXlsxRows(file), [
    ["email", "", "coding"],
    ["x@y.in", "", "7"],
  ]);
});

test("rejects something that is not a zip", () => {
  assert.equal(isXlsx(Buffer.from("email,coding\n")), false);
  assert.throws(() => readXlsxRows(Buffer.from("PK\x03\x04 nope")));
});
