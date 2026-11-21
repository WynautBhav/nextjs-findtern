import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cardCandidate, fromWire, toChromeWire, toResultsWire } from "./candidates-wire.ts";
import { cityTerms, readFilters, type CandidatesData } from "./candidates-params.ts";
import type { CandidateProfile } from "./employer-candidates.ts";

const SECRET = {
  first: "Zorander",
  last: "Quillfeather",
  email: "zorander.q@hidden-mail.test",
  phone: "+91 98765 43210",
  linkedin: "https://linkedin.com/in/zorander-q",
  recording: "https://recordings.test/zq-interview.mp4",
  college: "Quillfeather Institute of Technology, Rare Town",
  course: "Secret Course 9000",
};

function profile(id: string): CandidateProfile {
  return {
    id,
    firstName: SECRET.first,
    lastName: SECRET.last,
    fullName: `${SECRET.first} ${SECRET.last}`,
    initials: "ZQ",
    email: SECRET.email,
    city: "Pune",
    state: "Maharashtra",
    location: "Pune, Maharashtra",
    linkedinUrl: SECRET.linkedin,
    skills: ["React", "Node"],
    score: 7.5,
    scored: true,
    ratings: { communication: 7, coding: 8, aptitude: 6, interview: 7 },
    academics: {
      institution: SECRET.college,
      degree: "B.Tech",
      specialization: "CSE",
      level: "Bachelor",
      startYear: "2021",
      endYear: "2025",
      status: "pursuing",
      score: "8.1",
      scoreType: "CGPA",
      courses: [{ name: SECRET.course, institution: SECRET.college, level: "", completed: "", score: "" }],
    },
    workModes: ["remote"],
    preferredLocations: ["Pune"],
    hasLaptop: true,
    updatedAt: new Date("2026-01-02T03:04:05Z"),
    aiFeedbackLink: "https://reports.test/zq-report",
    aiRecordingLink: SECRET.recording,
    photoUrl: `/api/intern/avatar?id=${id}`,
  };
}

function data(ids: string[], unlocked: string[] = []): CandidatesData {
  return {
    restoreTo: null,
    loadFailed: false,
    candidates: ids.map(profile),
    total: ids.length,
    pages: 1,
    currency: "INR",
    region: "IN",
    projects: [{ id: "p1", projectName: "Web app", locationType: "remote", state: null }],
    shortlisted: new Set(ids.slice(0, 1)),
    activeProjectId: "p1",
    activeProjectSkills: ["React"],
    effectiveSkills: ["React"],
    projectApplied: null,
    includeRemote: true,
    cityList: [],
    cityDefault: "",
    nameUnlocked: new Set(unlocked),
    plans: [],
    relations: new Map(),
    presence: Object.fromEntries(ids.map((id) => [id, "Online"])),
    saved: new Set(),
    savedCount: 1,
    pro: { active: false, ignored: false, offered: true, charge: null, periodDays: 30, colleges: [], hiddenNoScore: 0, approxKept: 0 },
    relaxCounts: null,
  };
}

test("before a paid hire the wire carries no name, email, phone, link, recording, exact college or course", () => {
  const wire = toResultsWire(data(["a1", "a2"]), readFilters({}));
  const json = JSON.stringify(wire);
  for (const [what, value] of Object.entries(SECRET)) {
    assert.equal(json.includes(value), false, `${what} leaked: ${value}`);
  }
  assert.equal(json.includes("Quillfeather"), false);
  assert.equal(json.includes("Zorander"), false);
  assert.equal(json.includes("2026-01-02"), false, "profile edit time leaked");
  for (const row of wire.rows) {
    assert.equal(row.candidate.fullName, "");
    assert.equal(row.candidate.firstName, "");
    assert.equal(row.candidate.lastName, "");
    assert.equal(row.candidate.email, "");
    assert.equal(row.candidate.linkedinUrl, "");
    assert.equal(row.candidate.aiRecordingLink, null);
    assert.equal(row.candidate.academics?.institution, "");
    assert.deepEqual(row.candidate.academics?.courses, []);
    assert.equal(row.candidate.initials, "ZQ");
    assert.equal(row.nameUnlocked, false);
  }
});

test("the photo is the avatar route only, never a file name or storage path", () => {
  const wire = toResultsWire(data(["a1"]), readFilters({}));
  assert.equal(wire.rows[0].candidate.photoUrl, "/api/intern/avatar?id=a1");
});

test("after a paid hire the name shows, contact and the recording still never leave", () => {
  const wire = toResultsWire(data(["a1", "a2"], ["a1"]), readFilters({}));
  const json = JSON.stringify(wire.rows[0]);
  assert.equal(wire.rows[0].candidate.fullName, `${SECRET.first} ${SECRET.last}`);
  assert.equal(wire.rows[0].nameUnlocked, true);
  for (const key of ["email", "phone", "linkedin", "recording", "college", "course"] as const) {
    assert.equal(json.includes(SECRET[key]), false, `${key} leaked after hire`);
  }
  // the other candidate on the same page stays locked
  assert.equal(wire.rows[1].candidate.fullName, "");
});

test("the card mapper is the one the page builds rows with (no second redaction path)", () => {
  const page = readFileSync(join(import.meta.dirname, "../app/employer/candidates/page.tsx"), "utf8");
  const route = readFileSync(join(import.meta.dirname, "../app/api/employer/candidates/results/route.ts"), "utf8");
  const results = readFileSync(join(import.meta.dirname, "../app/employer/candidates/_results.tsx"), "utf8");
  void page;
  assert.match(route, /toResultsWire/);
  // the page's list builds each card's candidate with the same mapper the endpoint uses; nothing else redacts
  assert.match(results, /cardCandidate\(candidate/);
  assert.doesNotMatch(results, /redactForEmployer/);
  assert.equal(cardCandidate(profile("x"), false).email, "");
});

test("the endpoint reads through the page's loader: the pool, hold, frozen and hired rules are shared, not copied", () => {
  const route = readFileSync(join(import.meta.dirname, "../app/api/employer/candidates/results/route.ts"), "utf8");
  const query = readFileSync(join(import.meta.dirname, "../app/employer/candidates/_query.ts"), "utf8");
  assert.match(route, /loadCandidates\(/);
  assert.doesNotMatch(route, /schema\.|getDb|select\(/);
  // the loader holds back anyone held by another company or frozen, and anyone this employer hired, on the list and on the Shortlist tab
  assert.match(query, /not\(heldElsewhereSql\(uid\)\)/);
  assert.match(query, /notHiredByEmployerSql\(uid\)/);
  assert.match(query, /candidatePoolClauses\(\)/);
});

test("the endpoint is employer-only and never cached", () => {
  const route = readFileSync(join(import.meta.dirname, "../app/api/employer/candidates/results/route.ts"), "utf8");
  assert.match(route, /role !== "employer"/);
  assert.match(route, /unauthenticatedResponse\(\)/);
  assert.match(route, /private, no-store/);
});

test("fromWire rebuilds what the page components read, with the chrome from the page", () => {
  const d = data(["a1", "a2"]);
  const filters = readFilters({ skills: "React" });
  const back = fromWire(toChromeWire("u1", d), toResultsWire(d, filters));
  assert.equal(back.data.total, 2);
  assert.equal(back.data.candidates.length, 2);
  assert.equal(back.data.shortlisted.has("a1"), true);
  assert.equal(back.data.shortlisted.has("a2"), false);
  assert.equal(back.data.presence["a1"], "Online");
  assert.equal(back.data.projects[0].projectName, "Web app");
  assert.equal(back.data.pro.offered, true);
  assert.deepEqual(back.filters.skills, ["React"]);
});

test("one city only: a legacy list in the URL keeps its first city, and the match term is that one", () => {
  const f = (city?: string) => readFilters(city === undefined ? {} : { city });
  assert.equal(f("Pune,Mumbai").city, "Pune");
  assert.equal(f(",Mumbai").city, "Mumbai");
  assert.equal(f("").city, "");
  assert.equal(f("").citySet, true);
  assert.equal(f().citySet, false);
  assert.deepEqual(cityTerms("Pune, Mumbai"), ["pune"]);
  assert.deepEqual(cityTerms(",Mumbai"), ["mumbai"]);
  assert.deepEqual(cityTerms(""), []);
});
