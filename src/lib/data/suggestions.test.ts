import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { suggestSkills, skillKey, SKILLS, NON_TECH_SKILLS } from "./skills.ts";
import { suggestDistricts, stateForDistrict, DISTRICTS, STATES } from "./districts.ts";

/**
 * The vocabulary is what candidate matching stands on. If these lists are
 * missing or malformed the failure is silent - a picker that offers nothing
 * still looks like a picker - so the shape of the data is asserted here.
 */

describe("skills vocabulary", () => {
  test("carries the legacy list", () => {
    assert.equal(SKILLS.length, 2482);
    assert.ok(SKILLS.includes("React"));
    assert.ok(SKILLS.includes("TypeScript"));
  });

  test("has no duplicates", () => {
    assert.equal(new Set(SKILLS).size, SKILLS.length);
  });

  test("matches case-insensitively", () => {
    assert.ok(suggestSkills("react").includes("React"));
  });

  test("ranks an exact match first", () => {
    const out = suggestSkills("go");
    assert.equal(out[0]?.toLowerCase(), "go");
  });

  test("finds a long-tail skill the old hardcoded list could not express", () => {
    assert.ok(suggestSkills("rust").some((s) => /rust/i.test(s)));
  });

  test("returns nothing for an empty query", () => {
    assert.deepEqual(suggestSkills("   "), []);
  });

  test("normalises punctuation for matching", () => {
    assert.equal(skillKey("React.js"), skillKey("ReactJS"));
  });
});

describe("non-technical skills", () => {
  test("are offered without changing the legacy list", () => {
    assert.ok(NON_TECH_SKILLS.length >= 20);
    assert.equal(new Set(NON_TECH_SKILLS.map((s) => s.toLowerCase())).size, NON_TECH_SKILLS.length);
  });

  test("every one is findable by search, including those the legacy list lacks", () => {
    for (const skill of NON_TECH_SKILLS) assert.equal(suggestSkills(skill)[0], skill, skill);
  });
});

describe("districts", () => {
  test("carries the legacy list, trimmed", () => {
    assert.equal(DISTRICTS.length, 750);
    assert.ok(STATES.includes("Karnataka"));
  });

  test("every row has a district and a state", () => {
    for (const row of DISTRICTS) {
      assert.ok(row.district, "district missing");
      assert.ok(row.state, `state missing for ${row.district}`);
    }
  });

  test("resolves the state for a district", () => {
    assert.equal(stateForDistrict("Bengaluru"), "Karnataka");
    assert.equal(stateForDistrict("Nowhere"), null);
  });

  test("matches on state name as well as district", () => {
    const hits = suggestDistricts("Kerala", 5);
    assert.ok(hits.length > 0);
    assert.ok(hits.every((d) => d.state === "Kerala"));
  });
});