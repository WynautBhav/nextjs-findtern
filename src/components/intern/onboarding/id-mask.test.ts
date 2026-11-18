import assert from "node:assert/strict";
import { test } from "node:test";

import { clearOnFileErrors, idOnFileOf, saveBody, withoutIdNumbers } from "./id-mask.ts";

test("Aadhaar and PAN show the last four only", () => {
  const m = idOnFileOf({ aadhaarNumber: "2345 6789 0123", panNumber: "ABCDE1234F" });
  assert.deepEqual(m, { aadhaar: "•••• 0123", pan: "•••• 234F" });
  assert.doesNotMatch(JSON.stringify(m), /2345|6789|ABCDE/);
});

test("nothing on file gives null", () => {
  assert.deepEqual(idOnFileOf({ aadhaarNumber: "", panNumber: null }), { aadhaar: null, pan: null });
});

test("the draft sent to the browser carries no number", () => {
  const d = withoutIdNumbers({ aadhaarNumber: "234567890123", panNumber: "ABCDE1234F", city: "Pune" });
  assert.doesNotMatch(JSON.stringify(d), /234567890123|ABCDE1234F/);
  assert.equal(d.city, "Pune");
});

test("an untouched number is left out of the save so the stored one is kept", () => {
  const on = { aadhaar: "•••• 0123", pan: "•••• 234F" };
  const body = saveBody({ aadhaarNumber: "", panNumber: "", city: "Pune" }, on);
  assert.equal("aadhaarNumber" in body, false);
  assert.equal("panNumber" in body, false);
  assert.equal(saveBody({ aadhaarNumber: "345678901234", panNumber: "", city: "x" }, on).aadhaarNumber, "345678901234");
  assert.equal("aadhaarNumber" in saveBody({ aadhaarNumber: "", panNumber: "" }, { aadhaar: null, pan: null }), true);
});

test("on-file numbers are not reported missing", () => {
  const on = { aadhaar: "•••• 0123", pan: null };
  const e = clearOnFileErrors({ aadhaarNumber: "required", panNumber: "required", city: "x" }, { aadhaarNumber: "", panNumber: "" }, on);
  assert.deepEqual(e, { panNumber: "required", city: "x" });
});
