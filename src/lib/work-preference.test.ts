import assert from "node:assert/strict";
import { test } from "node:test";

import { modeProblem, offerableModes, workPreferenceOf } from "./work-preference.ts";

test("preferred cities split into city and state", () => {
  const pref = workPreferenceOf({
    locationTypes: ["remote", "hybrid"],
    preferredLocations: ["Pune, Maharashtra", "Pune, Maharashtra", "Bengaluru Urban"],
  });
  assert.deepEqual(pref.modes, ["remote", "hybrid"]);
  assert.equal(pref.cities.length, 2, "duplicates are dropped");
  assert.deepEqual(pref.cities[0], { label: "Pune, Maharashtra", city: "Pune", state: "Maharashtra" });
  assert.equal(pref.cities[1].city, "Bengaluru Urban");
});

test("an offer's mode must be one the candidate picked", () => {
  const remoteOnly = workPreferenceOf({ locationTypes: ["remote"], preferredLocations: [] });
  assert.equal(modeProblem(remoteOnly, "remote"), null);
  assert.match(modeProblem(remoteOnly, "onsite") ?? "", /remote work only/);
  // A legacy row with no modes stored limits nothing.
  assert.deepEqual(offerableModes(workPreferenceOf(null)), ["remote", "hybrid", "onsite"]);
});

test("a free-band candidate (score under 6) can only be offered remote work, whatever they picked", () => {
  const row = { locationTypes: ["onsite"], preferredLocations: ["Pune, Maharashtra"] };
  const free = workPreferenceOf(row, 4.5);
  assert.deepEqual(offerableModes(free), ["remote"]);
  assert.equal(modeProblem(free, "remote"), null);
  assert.match(modeProblem(free, "hybrid") ?? "", /free Standard band.*remote work only/);
  assert.match(modeProblem(free, "onsite") ?? "", /remote work only/);
  // A paid band keeps what the candidate picked; unscored (0 or missing) is not the free band.
  assert.deepEqual(offerableModes(workPreferenceOf(row, 6)), ["onsite"]);
  assert.equal(modeProblem(workPreferenceOf(row, 8.2), "onsite"), null);
  assert.equal(workPreferenceOf(row, 0).freeBand, undefined);
  assert.equal(workPreferenceOf(row).freeBand, undefined);
});
