import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PROJECT_LOCATIONS,
  isProjectOpen,
  projectLocationsError,
  projectPlaceError,
  projectSkillsError,
} from "./project-locations.ts";
import { scopeLabel, scopeValue } from "./db/schema.ts";

test("closed, inactive and archived read as closed; anything else is open (EMH-03)", () => {
  for (const s of ["inactive", "closed", "archived", "Inactive", " CLOSED "]) assert.equal(isProjectOpen(s), false, s);
  for (const s of ["active", "", null, undefined, "Active", "paused"]) assert.equal(isProjectOpen(s), true, String(s));
});

test("projects need 4 to 7 skills; an older shorter list still resaves (EMH-13)", () => {
  assert.equal(projectSkillsError(["a", "b", "c", "d"]), null);
  assert.match(projectSkillsError(["a", "b", "c"]) ?? "", /at least 4/);
  assert.match(projectSkillsError(["1", "2", "3", "4", "5", "6", "7", "8"]) ?? "", /at most 7/);
  assert.equal(projectSkillsError(["React", "Node"], ["react", "node"]), null);
  assert.match(projectSkillsError(["React", "Vue"], ["React", "Node"]) ?? "", /at least 4/);
  assert.match(projectSkillsError([], []) ?? "", /at least 4/);
});

test("on-site and hybrid projects need an Indian city and state (EMH-14, EMH-48)", () => {
  const states = ["Karnataka", "Rajasthan"];
  assert.equal(projectPlaceError({ locationType: "remote" }, states), null);
  assert.equal(projectPlaceError({ locationType: "onsite", city: "Jaipur", state: "Rajasthan" }, states), null);
  assert.match(projectPlaceError({ locationType: "hybrid", city: "Jaipur" }, states) ?? "", /state/);
  assert.match(projectPlaceError({ locationType: "hybrid", state: "Rajasthan" }, states) ?? "", /city/);
  assert.match(projectPlaceError({ locationType: "onsite", city: "Austin", state: "Texas" }, states) ?? "", /India-based/);
});

test("scope is stored under legacy keys and every spelling reads back (DB-09)", () => {
  assert.equal(scopeValue("short-term"), "short-term");
  assert.equal(scopeValue("upto-60"), "short-term");
  assert.equal(scopeValue("upto-90"), "medium-term");
  assert.equal(scopeValue("upto-180"), "long-term");
  assert.equal(scopeValue("Long-term"), "long-term");
  assert.equal(scopeValue("not-sure"), "");
  assert.equal(scopeValue(null), "");
  assert.equal(scopeLabel("short-term"), "Up to 60 days");
  assert.equal(scopeLabel("upto-90"), "Up to 90 days");
  assert.equal(scopeLabel("long-term"), "Up to 180 days");
  assert.equal(scopeLabel("not-sure"), "Not decided");
  assert.equal(scopeLabel(null), "Not set");
});

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
