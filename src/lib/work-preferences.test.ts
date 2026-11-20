import assert from "node:assert/strict";
import test from "node:test";

import { workPreferenceRows } from "./work-preferences.ts";

const rows = (p: Partial<Parameters<typeof workPreferenceRows>[0]>, project: string[] = []) =>
  workPreferenceRows({ location: "", preferredLocations: [], workModes: [], ...p }, project);

test("nothing stored: both rows are empty", () => {
  const [cities, modes] = rows({});
  assert.deepEqual(cities.chips, []);
  assert.deepEqual(modes.chips, []);
  assert.deepEqual([cities.label, modes.label], ["Preferred cities", "Work mode"]);
});

test("only the home city: it shows, marked as the current city", () => {
  const [cities] = rows({ location: "Pune, Maharashtra", preferredLocations: ["Pune, Maharashtra"] });
  assert.deepEqual(cities.chips, [{ label: "Pune", current: true }]);
});

test("a home city that is not preferred is not added", () => {
  const [cities] = rows({ location: "Pune, Maharashtra", preferredLocations: ["Mumbai"] });
  assert.deepEqual(cities.chips, [{ label: "Mumbai" }]);
});

test("several cities keep their order, one chip per city, state dropped", () => {
  const [cities] = rows({
    location: "Jaipur, Rajasthan",
    preferredLocations: ["Mumbai, Maharashtra", "jaipur", "Mumbai, Gujarat", " ", "Delhi"],
  });
  assert.deepEqual(cities.chips, [{ label: "Mumbai" }, { label: "jaipur", current: true }, { label: "Delhi" }]);
});

test("modes: any casing or spelling, once each, Remote / Hybrid / On-site order", () => {
  const [, modes] = rows({ workModes: ["On-site", "remote", "REMOTE", "onsite", "Hybrid", "teleport"] });
  assert.deepEqual(modes.chips.map((c) => c.label), ["Remote", "Hybrid", "On-site"]);
});

test("project match: only a preferred city equal to a project city, any casing", () => {
  const [cities] = rows({ location: "Delhi", preferredLocations: ["Pune, Maharashtra", "Delhi"] }, ["PUNE", "Goa"]);
  assert.deepEqual(cities.chips, [{ label: "Pune", matchesProject: true }, { label: "Delhi", current: true }]);
});

test("no project cities: no match flag", () => {
  const [cities] = rows({ preferredLocations: ["Pune"] }, []);
  assert.equal(cities.chips[0].matchesProject, undefined);
});
