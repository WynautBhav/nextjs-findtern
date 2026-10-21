import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_PROJECT_LOCATIONS, projectLocationsError } from "./project-locations.ts";

test("new projects take at most three preferred locations", () => {
  assert.equal(MAX_PROJECT_LOCATIONS, 3);
  assert.equal(projectLocationsError([]), null);
  assert.equal(projectLocationsError(["Pune", "Jaipur", "Delhi"]), null);
  assert.match(projectLocationsError(["Pune", "Jaipur", "Delhi", "Goa"]) ?? "", /up to 3/);
});

test("a legacy list over the cap still saves unchanged or trimmed", () => {
  const legacy = ["Pune", "Jaipur", "Delhi", "Goa", "Agra"];
  assert.equal(projectLocationsError(legacy, legacy), null);
  assert.equal(projectLocationsError(["pune", "Jaipur", "Delhi", "Goa"], legacy), null);
  assert.match(projectLocationsError(["Pune", "Jaipur", "Delhi", "Surat"], legacy) ?? "", /up to 3/);
});
