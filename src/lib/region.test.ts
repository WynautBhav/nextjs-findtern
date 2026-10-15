import test from "node:test";
import assert from "node:assert/strict";

import { employerRegion } from "./region.ts";

test("country India wins", () => {
  assert.equal(employerRegion({ country: "India", countryCode: "+1", phoneNumber: "555" }), "IN");
  assert.equal(employerRegion({ country: "IN" }), "IN");
  assert.equal(employerRegion({ country: "United States" }), null);
});

test("+91 dial code matches despite split storage", () => {
  assert.equal(employerRegion({ countryCode: "+91", phoneNumber: "9876543210" }), "IN");
  assert.equal(employerRegion({ countryCode: "+1", phoneNumber: "5551234" }), null);
});

test("bare national number is the last resort", () => {
  assert.equal(employerRegion({ phoneNumber: "919876543210" }), "IN");
  assert.equal(employerRegion({ phoneNumber: "9876543210" }), null);
  assert.equal(employerRegion({}), null);
});
