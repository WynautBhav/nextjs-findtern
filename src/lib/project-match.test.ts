import assert from "node:assert/strict";
import { test } from "node:test";

import { matchedOnText, projectMatchHref, projectMatchState } from "./project-match.ts";

const base = { hasProject: true, projectDefaults: true, skillsSet: false, skills: [], projectSkills: ["React", "Node.js"], projectCity: "Pune" };
const P = "/employer/candidates";

test("state: matched, edited, off, none", () => {
  assert.equal(projectMatchState(base), "matched");
  assert.equal(projectMatchState({ ...base, skillsSet: true, skills: ["node.js", "REACT"] }), "matched");
  assert.equal(projectMatchState({ ...base, skillsSet: true, skills: ["Go"] }), "edited");
  assert.equal(projectMatchState({ ...base, skillsSet: true, skills: [] }), "edited");
  assert.equal(projectMatchState({ ...base, projectDefaults: false }), "off");
  assert.equal(projectMatchState({ ...base, hasProject: false }), "none");
  assert.equal(projectMatchState({ ...base, projectSkills: [], projectCity: "" }), "none");
});

test("Restore with matching off (pf=0) and no skills picked is not a no-op: pf goes, so the parser restores", () => {
  const href = projectMatchHref(P, "project=p1&pf=0&skills=&min=6", "match", false);
  const q = new URL(href, "http://x").searchParams;
  assert.equal(q.has("pf"), false);
  assert.equal(q.has("skills"), false);
  assert.equal(q.get("min"), "6");
  assert.notEqual(href, `${P}?project=p1&pf=0&skills=&min=6`);
});

test("a link that would end up with no filter says fresh, so the remembered pf=0 is not restored", () => {
  const q = new URL(projectMatchHref(P, "project=p1&pf=0", "match", false), "http://x").searchParams;
  assert.equal(q.get("fresh"), "1");
  assert.equal(q.get("project"), "p1");
});

test("stop sets pf=0, keeps the other filters and resets the page", () => {
  const q = new URL(projectMatchHref(P, "project=p1&skills=Go&page=3&cgpaMin=8", "stop", false), "http://x").searchParams;
  assert.equal(q.get("pf"), "0");
  assert.equal(q.get("skills"), "Go");
  assert.equal(q.has("page"), false);
  assert.equal(q.has("cgpaMin"), false, "free employers carry no Pro params");
});

test("matchedOnText", () => {
  assert.equal(matchedOnText(5, ["Pune"]), "matched on 5 skills + Pune");
  assert.equal(matchedOnText(1, []), "matched on 1 skill");
  assert.equal(matchedOnText(0, ["Pune", "Delhi"]), "matched on Pune, Delhi");
  assert.equal(matchedOnText(0, []), "");
});
