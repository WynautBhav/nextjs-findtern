import assert from "node:assert/strict";
import test from "node:test";

import { buildCodeRow, issueCodes, maskCode, type DriveCodeRow } from "./codes.ts";

const SECRET = "x".repeat(40);

test("row never contains the plain code", () => {
  const { row, code } = buildCodeRow({ orderId: "o", entryId: "e", validUntil: new Date(), secret: SECRET });
  assert.ok(!JSON.stringify(row).includes(code));
  assert.ok(!JSON.stringify(row).includes(code.replace(/-/g, "")));
  assert.equal(row.codeLast4, code.slice(-4));
  assert.match(maskCode(row.codeLast4), /^••••-••••-/);
});

function fakeTx(slots: number) {
  const o = { issued: 0, slots, status: "paid" };
  const rows: DriveCodeRow[] = [];
  return {
    rows,
    o,
    async execute(_q: string, p: unknown[]) {
      const n = p[1] as number;
      if (o.status === "paid" && o.issued + n <= o.slots) {
        o.issued += n;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async insertDriveCodes(r: DriveCodeRow[]) {
      rows.push(...r);
    },
  };
}

test("issue respects slot cap", async () => {
  const tx = fakeTx(2);
  const base = { orderId: "o", validUntil: new Date(), secret: SECRET };
  const a = await issueCodes(tx, { ...base, entryIds: ["1", "2"] });
  assert.equal(a.ok, true);
  const b = await issueCodes(tx, { ...base, entryIds: ["3"] });
  assert.equal(b.ok, false);
  assert.equal(tx.rows.length, 2);
  assert.equal(new Set(tx.rows.map((r) => r.codeHash)).size, 2);
});
