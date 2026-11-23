import { test } from "node:test";
import assert from "node:assert/strict";

import { duplicateProbe } from "./create-dup.ts";

const base = { name: "Sri   Ram Institute", city: "", emailDomains: [] as string[] };

test("R1-02: a college with an AISHE code is never refused by name (the AISHE index is the key)", () => {
  assert.equal(duplicateProbe({ ...base, city: "Jaipur", aisheCode: "C-12345" }), null);
  assert.equal(duplicateProbe({ ...base, aisheCode: "U-0657" }), null);
});

test("R1-02: name + city is checked when a city is given", () => {
  const p = duplicateProbe({ ...base, city: "Jaipur" });
  assert.deepEqual(p, { nameKey: "sri ram institute", cityKey: "jaipur", payload: null });
});

test("R1-02: with no city and no AISHE, only the same payload (double submit) counts as a duplicate", () => {
  const p = duplicateProbe({ ...base, gstin: "08ABCDE1234F1Z5", emailDomains: ["x.edu"] });
  assert.deepEqual(p, { nameKey: "sri ram institute", cityKey: "", payload: { gstin: "08ABCDE1234F1Z5", domains: ["x.edu"] } });
});
