import assert from "node:assert/strict";
import { test } from "node:test";

import { clearOnFileErrors, idOnFileOf, maskAadhaar, maskPan, saveBody, withoutIdNumbers } from "./id-mask.ts";

test("Aadhaar shows XXXX XXXX and the last four; PAN keeps two letters and the last three", () => {
  assert.equal(maskAadhaar("2345 6789 0123"), "XXXX XXXX 0123");
  assert.equal(maskAadhaar("234567890123"), "XXXX XXXX 0123");
  assert.equal(maskPan("ABCDE1234F"), "ABXXXXX34F");
  assert.equal(maskPan(" abcde1234f "), "ABXXXXX34F");
});

test("nothing on file, or a value of the wrong shape, masks to null and never echoes the input", () => {
  assert.equal(maskAadhaar(""), null);
  assert.equal(maskAadhaar(null), null);
  assert.equal(maskPan(undefined), null);
  assert.equal(maskAadhaar("12345"), "XXXX XXXX XXXX");
  assert.equal(maskPan("ABC"), "XXXXXXXXXX");
});

test("idOnFileOf carries only masked forms", () => {
  const m = idOnFileOf({ aadhaarNumber: "2345 6789 0123", panNumber: "ABCDE1234F" });
  assert.deepEqual(m, { aadhaar: "XXXX XXXX 0123", pan: "ABXXXXX34F" });
  assert.doesNotMatch(JSON.stringify(m), /2345|6789|CDE12/);
  assert.deepEqual(idOnFileOf({ aadhaarNumber: "", panNumber: null }), { aadhaar: null, pan: null });
});

test("the draft sent to the browser carries no number", () => {
  const d = withoutIdNumbers({ aadhaarNumber: "234567890123", panNumber: "ABCDE1234F", city: "Pune" });
  assert.doesNotMatch(JSON.stringify(d), /234567890123|ABCDE1234F/);
  assert.equal(d.city, "Pune");
});

test("an untouched number is left out of the save so the stored one is kept", () => {
  const on = { aadhaar: "XXXX XXXX 0123", pan: "ABXXXXX34F" };
  const body = saveBody({ aadhaarNumber: "", panNumber: "", city: "Pune" }, on);
  assert.equal("aadhaarNumber" in body, false);
  assert.equal("panNumber" in body, false);
  assert.equal(saveBody({ aadhaarNumber: "345678901234", panNumber: "", city: "x" }, on).aadhaarNumber, "345678901234");
  assert.equal("aadhaarNumber" in saveBody({ aadhaarNumber: "", panNumber: "" }, { aadhaar: null, pan: null }), true);
});

test("a masked value is never submitted as a new number", () => {
  const on = { aadhaar: "XXXX XXXX 0123", pan: "ABXXXXX34F" };
  const body = saveBody({ aadhaarNumber: "XXXX XXXX 0123", panNumber: "ABXXXXX34F" }, on);
  assert.equal("aadhaarNumber" in body, false);
  assert.equal("panNumber" in body, false);
});

test("on-file numbers are not reported missing", () => {
  const on = { aadhaar: "XXXX XXXX 0123", pan: null };
  const e = clearOnFileErrors({ aadhaarNumber: "required", panNumber: "required", city: "x" }, { aadhaarNumber: "", panNumber: "" }, on);
  assert.deepEqual(e, { panNumber: "required", city: "x" });
});
