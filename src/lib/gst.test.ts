import test from "node:test";
import assert from "node:assert/strict";

import { placeOfSupply, splitGst, stateCodeFromPincode } from "./gst.ts";

test("PIN codes resolve to GST state codes", () => {
  assert.equal(stateCodeFromPincode("302001"), "08"); // Jaipur
  assert.equal(stateCodeFromPincode("342001"), "08"); // Jodhpur
  assert.equal(stateCodeFromPincode("560001"), "29"); // Bengaluru
  assert.equal(stateCodeFromPincode("400001"), "27"); // Mumbai
  assert.equal(stateCodeFromPincode("500001"), "36"); // Hyderabad
  assert.equal(stateCodeFromPincode("110001"), "07"); // Delhi
  assert.equal(stateCodeFromPincode("403001"), "30"); // Goa
  assert.equal(stateCodeFromPincode("834001"), "20"); // Ranchi
  assert.equal(stateCodeFromPincode("800001"), "10"); // Patna
  assert.equal(stateCodeFromPincode("12345"), null);
  assert.equal(stateCodeFromPincode("012345"), null);
});

test("Rajasthan buyer: 9% CGST + 9% SGST", () => {
  const split = splitGst(118000, placeOfSupply({ currency: "INR", pincode: "302001" }));
  assert.equal(split.mode, "intra");
  assert.equal(split.baseMinor, 100000);
  assert.equal(split.cgstMinor, 9000);
  assert.equal(split.sgstMinor, 9000);
  assert.equal(split.igstMinor, 0);
});

test("Other state: 18% IGST", () => {
  const split = splitGst(118000, placeOfSupply({ currency: "INR", pincode: "400001" }));
  assert.equal(split.mode, "inter");
  assert.equal(split.igstMinor, 18000);
  assert.equal(split.cgstMinor + split.sgstMinor, 0);
});

test("GSTIN beats PIN code", () => {
  const place = placeOfSupply({ currency: "INR", gstin: "08ABCDE1234F1Z5", pincode: "560001" });
  assert.deepEqual(place, { kind: "india", stateCode: "08", stateName: "Rajasthan" });
});

test("profile state is the last fallback", () => {
  const place = placeOfSupply({ currency: "INR", state: "Rajasthan" });
  assert.equal(place.kind === "india" && place.stateCode, "08");
});

test("USD or foreign buyer: no GST", () => {
  assert.equal(splitGst(21000, placeOfSupply({ currency: "USD" })).mode, "export");
  assert.equal(splitGst(21000, placeOfSupply({ currency: "INR", country: "Qatar" })).igstMinor, 0);
});

test("parts always sum to the total", () => {
  for (const total of [1, 99, 249900, 2100000, 123457]) {
    for (const pin of ["302001", "560001"]) {
      const s = splitGst(total, placeOfSupply({ currency: "INR", pincode: pin }));
      assert.equal(s.baseMinor + s.cgstMinor + s.sgstMinor + s.igstMinor, total);
    }
  }
});
