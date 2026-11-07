import assert from "node:assert/strict";
import { test } from "node:test";

import { bandRateLine } from "./band-rate.ts";

test("bandRateLine reads the rate from the band table", () => {
  assert.match(bandRateLine(8.4), /Assured band: employers book you at ₹200 an hour/);
  assert.match(bandRateLine(6), /₹100 an hour/);
});

test("bandRateLine for the lowest band names the way up, no rate", () => {
  const line = bandRateLine(4.2);
  assert.match(line, /Standard band/);
  assert.doesNotMatch(line, /₹/);
  assert.match(line, /Reach 6\.0/);
});
