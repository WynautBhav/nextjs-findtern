import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition, normalizeStatus, isVisibleToInterns, isEditableByEmployer,
  submitReadiness, MAX_SKILLS_PER_PROJECT, EDITABLE_WHILE_PUBLISHED, PROJECT_FIELD_LABELS, isLockedWhilePublished, publishedLockedMessage,
} from "./lifecycle.ts";

const employerOk: [string, string][] = [
  ["draft", "pending_review"], ["pending_review", "draft"], ["published", "paused"],
  ["paused", "published"], ["published", "closed"], ["paused", "closed"], ["rejected", "draft"],
  ["draft", "published"], ["pending_review", "published"],
];
const adminOk: [string, string][] = [
  ["published", "closed"],
  ["paused", "closed"], ["draft", "closed"], ["rejected", "closed"], ["pending_review", "closed"],
];

test("employer allowed edges", () => {
  for (const [f, t] of employerOk) assert.equal(canTransition(f, t, "employer"), true, `${f}>${t}`);
});
test("admin allowed edges", () => {
  for (const [f, t] of adminOk) assert.equal(canTransition(f, t, "admin"), true, `${f}>${t}`);
});
test("denied edges", () => {
  const denied: [string, string, "employer" | "admin"][] = [
    ["closed", "draft", "employer"], ["closed", "published", "employer"], ["rejected", "published", "employer"],
    ["rejected", "pending_review", "employer"], ["published", "pending_review", "employer"],
    ["draft", "closed", "employer"], ["published", "draft", "employer"], ["published", "published", "employer"],
    ["draft", "published", "admin"], ["closed", "published", "admin"], ["closed", "closed", "admin"],
    ["published", "rejected", "admin"], ["pending_review", "published", "admin"], ["pending_review", "rejected", "admin"], ["x", "closed", "admin"], ["draft", "bogus", "admin"],
  ];
  for (const [f, t, r] of denied) assert.equal(canTransition(f, t, r), false, `${r} ${f}>${t}`);
  assert.equal(canTransition("draft", "closed", "nobody" as never), false);
});
test("legacy aliases", () => {
  assert.equal(normalizeStatus("active"), "published");
  assert.equal(normalizeStatus("inactive"), "paused");
  assert.equal(normalizeStatus("archived"), "closed");
  assert.equal(normalizeStatus("weird"), null);
  assert.equal(normalizeStatus("toString"), null);
  assert.equal(normalizeStatus(null), null);
  assert.equal(canTransition("active", "paused", "employer"), true);
});
test("visibility and editability", () => {
  assert.equal(isVisibleToInterns("published"), true);
  assert.equal(isVisibleToInterns("active"), true);
  for (const s of ["draft", "paused", "closed", "inactive", "rejected", "pending_review", null]) {
    assert.equal(isVisibleToInterns(s), false);
  }
  for (const s of ["draft", "rejected", "paused", "inactive"]) assert.equal(isEditableByEmployer(s), true);
  for (const s of ["published", "active", "closed", "pending_review"]) assert.equal(isEditableByEmployer(s), false);
  assert.ok(EDITABLE_WHILE_PUBLISHED.length > 0);
});
test("submit readiness and skill limit", () => {
  const skills = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
  const base = { projectName: "T", scopeOfWork: "D", locationType: "remote" };
  assert.equal(MAX_SKILLS_PER_PROJECT, 7);
  assert.deepEqual(submitReadiness({ ...base, skills: skills(7) }), []);
  assert.deepEqual(submitReadiness({ ...base, skills: skills(8) }), ["skills (at most 7)"]);
  assert.deepEqual(submitReadiness({ ...base, skills: [] }), ["skills"]);
  assert.deepEqual(submitReadiness({}), ["title", "description", "skills", "locationType"]);
});
test("locked-while-published list is the single source the form and server share", () => {
  for (const k of EDITABLE_WHILE_PUBLISHED) assert.equal(isLockedWhilePublished(k), false, k);
  for (const k of ["projectName", "skills", "locationType", "state", "city", "pincode", "timezone"]) {
    assert.equal(isLockedWhilePublished(k), true, k);
  }
});
test("published-lock message uses plain words, never column names", () => {
  const msg = publishedLockedMessage(["locationType", "state", "city", "timezone", "scopeOfWork"]);
  assert.equal(
    msg,
    "This project is live, so its work mode, state, city and timezone can't be changed. You can still change the scope of work and the full-time option. To change the rest, pause the project first.",
  );
  for (const raw of ["locationType", "scopeOfWork", "fullTimeOffer", "preferredLocations", "projectName"]) {
    assert.equal(msg.includes(raw), false, raw);
  }
  assert.match(publishedLockedMessage(["skills"]), /^This project is live, so its skills can't be changed\./);
  assert.match(publishedLockedMessage(["somethingNew"]), /so its other details can't be changed/);
  for (const k of EDITABLE_WHILE_PUBLISHED) {
    if (k !== "preferredLocations") assert.ok(PROJECT_FIELD_LABELS[k], k);
  }
});
