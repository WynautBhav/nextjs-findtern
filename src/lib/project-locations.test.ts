import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PROJECT_LOCATIONS,
  projectCities,
  isListingLive,
  isProjectClosedForGood,
  isProjectOpen,
  projectDescriptionError,
  projectLocationsError,
  projectPlaceError,
  projectSkillsError,
  projectStatusChangeError,
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

test("the city must be one of the state's districts when the routes pass the list", () => {
  const states = ["Karnataka", "Rajasthan"];
  const districtsOf = (st: string) => (st.toLowerCase() === "rajasthan" ? ["Jaipur", "Jodhpur"] : ["Bengaluru"]);
  assert.equal(projectPlaceError({ locationType: "onsite", city: "jaipur", state: "rajasthan" }, states, districtsOf), null);
  assert.match(projectPlaceError({ locationType: "onsite", city: "Bengaluru", state: "Rajasthan" }, states, districtsOf) ?? "", /Pick a city in Rajasthan/);
  assert.match(projectPlaceError({ locationType: "hybrid", city: "x".repeat(121), state: "Karnataka" }, states, districtsOf) ?? "", /Pick a city/);
  assert.equal(projectPlaceError({ locationType: "remote", city: "Nowhere", state: "Karnataka" }, states, districtsOf), null);
  // Without the list (the form) only presence and the state are checked.
  assert.equal(projectPlaceError({ locationType: "onsite", city: "Anything", state: "Karnataka" }, states), null);
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

test("an on-site project filters candidates by its main city and every preferred city", () => {
  assert.deepEqual(
    projectCities({ locationType: "onsite", city: "Jaipur", preferredLocations: ["Pune, Maharashtra", "jaipur, Rajasthan", " Delhi "] }),
    ["Jaipur", "Pune", "Delhi"],
  );
  // A hybrid project with no main city still uses its preferred ones.
  assert.deepEqual(projectCities({ locationType: "hybrid", city: null, preferredLocations: ["Indore"] }), ["Indore"]);
});

test("a remote project looks in no city", () => {
  assert.deepEqual(projectCities({ locationType: "remote", city: "Jaipur", preferredLocations: ["Pune"] }), []);
  assert.deepEqual(projectCities({ locationType: null, city: "Jaipur" }), []);
});

test("a listing is live only while active and not taken down (OA8)", () => {
  assert.equal(isListingLive({ status: "active", takenDownAt: null }), true);
  assert.equal(isListingLive({ status: "Active" }), true);
  for (const status of ["inactive", "closed", "archived", "", null, undefined]) {
    assert.equal(isListingLive({ status, takenDownAt: null }), false, String(status));
  }
  assert.equal(isListingLive({ status: "active", takenDownAt: new Date() }), false);
});

test("pause is undoable, close is final; only 'closed' is final", () => {
  assert.equal(isProjectClosedForGood("closed"), true);
  assert.equal(isProjectClosedForGood(" Closed "), true);
  assert.equal(isProjectClosedForGood("inactive"), false);
  assert.equal(isProjectClosedForGood("active"), false);
});

test("a description with a phone number, email or link is refused with a sentence", () => {
  assert.equal(projectDescriptionError(""), null);
  assert.equal(projectDescriptionError("Build dashboards in React for 3 months. Python 3.11 helps."), null);
  const sentence = "Remove the phone number / email / link from the description: candidates contact you through Findtern.";
  for (const text of ["call 9876543210", "mail us at hr@acme.co", "see https://acme.com/jobs", "WhatsApp me, wa.me/919876543210", "write to hr [at] acme dot com"]) {
    assert.equal(projectDescriptionError(text), sentence, text);
  }
  assert.match(projectDescriptionError("x".repeat(2001)) ?? "", /under 2000/);
});

test("a taken-down listing cannot be reopened by the employer; a closed one is final", () => {
  const down = { status: "active", takenDownAt: new Date(), takenDownReason: "Contact details in the title" };
  assert.match(projectStatusChangeError(down, "active") ?? "", /Findtern took this listing down: Contact details in the title\. Contact support\./);
  assert.equal(projectStatusChangeError(down, "inactive"), null, "pausing or closing a taken-down listing is harmless");
  assert.match(projectStatusChangeError({ status: "closed" }, "active") ?? "", /closed for good/);
  assert.match(projectStatusChangeError({ status: "closed" }, "inactive") ?? "", /closed for good/);
  assert.equal(projectStatusChangeError({ status: "closed" }, "closed"), null);
  assert.equal(projectStatusChangeError({ status: "inactive" }, "active"), null, "a pause can be resumed");
  assert.equal(projectStatusChangeError({ status: "active" }, "closed"), null);
});

test("a taken-down listing is not open for offers even though its status stays active", () => {
  assert.equal(isProjectOpen("active", new Date()), false);
  assert.equal(isProjectOpen("active", "2026-11-06T10:00:00Z"), false);
  assert.equal(isProjectOpen("active", null), true);
  assert.equal(isProjectOpen("active", undefined), true);
  assert.equal(isProjectOpen("inactive", null), false);
});
