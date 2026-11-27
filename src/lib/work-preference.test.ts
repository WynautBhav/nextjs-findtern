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
  assert.deepEqual(offerableModes(workPreferenceOf(row, 6)), ["remote", "hybrid", "onsite"]);
  assert.equal(modeProblem(workPreferenceOf(row, 8.2), "onsite"), null);
  assert.equal(workPreferenceOf(row, 0).freeBand, undefined);
  assert.equal(workPreferenceOf(row).freeBand, undefined);
});

// Bug 27 Nov: a candidate who picked hybrid and on-site could not be offered remote work. Willing to come in means
// willing to work from home: a mode allows every less on-site one. Stored rows don't always hold the implied modes
// (only the profile's tap buttons added them), so the offer rule implies them itself.
test("a candidate open to on-site or hybrid work can always be offered remote; remote-only stays remote", () => {
  const of = (modes: string[]) => offerableModes(workPreferenceOf({ locationTypes: modes, preferredLocations: [] }));
  assert.deepEqual(of(["hybrid", "onsite"]), ["remote", "hybrid", "onsite"]);
  assert.deepEqual(of(["onsite"]), ["remote", "hybrid", "onsite"]);
  assert.deepEqual(of(["hybrid"]), ["remote", "hybrid"]);
  assert.deepEqual(of(["remote"]), ["remote"]);
  assert.equal(modeProblem(workPreferenceOf({ locationTypes: ["hybrid", "onsite"], preferredLocations: [] }), "remote"), null);
  assert.match(modeProblem(workPreferenceOf({ locationTypes: ["hybrid"], preferredLocations: [] }), "onsite") ?? "", /remote or hybrid work only/);
});
