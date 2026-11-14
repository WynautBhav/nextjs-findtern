import assert from "node:assert/strict";
import { test } from "node:test";

import { initialsOf } from "../../../lib/employer-candidates.ts";
import {
  completionPct,
  dateRange,
  degreeLine,
  documentRows,
  durationLabel,
  maskedId,
  monthYear,
  nextAction,
  scoreLine,
  splitExperience,
  statusLabel,
  uniqueCi,
  workModeLine,
  type Completion,
} from "./profile-logic.ts";

const items = (done: boolean[]): Completion => ({
  items: done.map((d, i) => ({
    id: ["photo", "about", "skills", "x"][i] ?? `s${i}`,
    label: `Step ${i + 1}`,
    done: d,
    href: "/intern/onboarding",
  })),
  done: done.filter(Boolean).length,
  total: done.length,
  complete: done.every(Boolean),
});

test("initials are the two letters an employer's row shows", () => {
  assert.equal(initialsOf("Ananya", "Iyer"), "AI");
  assert.equal(initialsOf("Aarav", ""), "AA");
  assert.equal(initialsOf("", ""), "?");
  assert.equal(initialsOf("<b>", "x"), "BX");
});

test("completionPct rounds, clamps and survives an empty list", () => {
  assert.equal(completionPct({ done: 8, total: 10 }), 80);
  assert.equal(completionPct({ done: 1, total: 3 }), 33);
  assert.equal(completionPct({ done: 0, total: 0 }), 0);
  assert.equal(completionPct({ done: 12, total: 10 }), 100);
});

test("nextAction is the first open step, in form order, with its reason", () => {
  const n = nextAction(items([true, false, false]));
  assert.ok(n);
  assert.equal(n.id, "about");
  assert.equal(n.remaining, 2);
  assert.match(n.why, /cities/i);
  assert.equal(n.href, "/intern/onboarding");
});

test("nextAction is null when the profile is complete", () => {
  assert.equal(nextAction(items([true, true])), null);
});

test("nextAction falls back to a generic reason for an unknown step id", () => {
  const n = nextAction({
    items: [{ id: "mystery", label: "Something new", done: false, href: "/x" }],
    done: 0,
    total: 1,
    complete: false,
  });
  assert.equal(n?.why, "Required to complete your profile.");
});

test("monthYear reads full days and months, leaves anything else as stored", () => {
  assert.equal(monthYear("2025-06-02"), "Jun 2025");
  assert.equal(monthYear("2025-12"), "Dec 2025");
  assert.equal(monthYear("Present"), "Present");
  assert.equal(monthYear("2025-13-01"), "2025-13-01");
  assert.equal(monthYear(""), "");
  assert.equal(monthYear(undefined), "");
});

test("dateRange handles finished, current, open-ended and blank", () => {
  assert.equal(dateRange("2025-06-02", "2025-08-29"), "Jun 2025 – Aug 2025");
  assert.equal(dateRange("2025-01-10", "", true), "Jan 2025 – Present");
  assert.equal(dateRange("2025-01-10", "Present"), "Jan 2025 – Present");
  assert.equal(dateRange("2025-01-10", ""), "Jan 2025");
  assert.equal(dateRange("", "2025-08-29"), "Aug 2025");
  assert.equal(dateRange("", ""), "");
});

test("durationLabel counts both end months and reads years and months", () => {
  assert.equal(durationLabel("2025-06-02", "2025-08-29"), "3 mos");
  assert.equal(durationLabel("2025-06-02", "2025-06-20"), "1 mo");
  assert.equal(durationLabel("2024-01-01", "2025-02-01"), "1 yr 2 mos");
  assert.equal(durationLabel("2024-01-01", "2024-12-31"), "1 yr");
  assert.equal(durationLabel("2025-01-10", "", true, new Date(2025, 3, 5)), "4 mos");
  assert.equal(durationLabel("2025-09-01", "2025-08-01"), "");
  assert.equal(durationLabel("soon", "2025-08-01"), "");
});

test("splitExperience drops empty rows and lists projects apart", () => {
  const rows = [
    { type: "Internship", company: "Zeta", role: "" },
    { type: "Project", company: "", role: "CampusPool" },
    { type: "Freelancing", company: "", role: "" },
    { type: "Job", company: "Acme", role: "Analyst" },
  ];
  const { work, projects } = splitExperience(rows);
  assert.deepEqual(
    work.map((e) => e.type),
    ["Internship", "Job"],
  );
  assert.deepEqual(
    projects.map((e) => e.role),
    ["CampusPool"],
  );
});

test("maskedId never returns more than the last four characters", () => {
  assert.equal(maskedId("412398764512"), "•••• 4512");
  assert.equal(maskedId("BXQPI4821K"), "•••• 821K");
  assert.equal(maskedId("1234"), "••••");
  assert.equal(maskedId(""), null);
  assert.equal(maskedId(undefined), null);
  assert.ok(!maskedId("412398764512")?.includes("4123"));
});

test("academic lines", () => {
  assert.equal(degreeLine({ degree: "B.Tech", branch: "CSE" }), "B.Tech, CSE");
  assert.equal(degreeLine({ degree: "B.Sc" }), "B.Sc");
  assert.equal(degreeLine({}), "");
  assert.equal(statusLabel("pursuing"), "Pursuing");
  assert.equal(statusLabel("COMPLETED"), "Completed");
  assert.equal(statusLabel(""), "");
  assert.equal(scoreLine({ cgpa: "8.7", scoreType: "cgpa" }), "CGPA 8.7 / 10");
  assert.equal(scoreLine({ cgpa: "82%", scoreType: "percentage" }), "82%");
  assert.equal(scoreLine({ cgpa: "", scoreType: "cgpa" }), "");
});

test("preferences wording", () => {
  assert.deepEqual(uniqueCi(["Chennai", "Bengaluru", "bengaluru", " "]), ["Chennai", "Bengaluru"]);
  assert.equal(workModeLine(["onsite"]), "On-site, and open to hybrid or remote");
  assert.equal(workModeLine(["Hybrid", "remote"]), "Hybrid, and open to remote");
  assert.equal(workModeLine(["remote"]), "Remote");
  assert.equal(workModeLine([]), null);
});

test("documentRows show the last four only and call a half-finished identity incomplete", () => {
  const rows = documentRows({
    photo: true,
    panNumber: "BXQPI4821K",
    panImage: true,
    aadhaarNumber: "412398764512",
    aadhaarImage: false,
  });
  assert.deepEqual(
    rows.map((r) => [r.id, r.state]),
    [
      ["photo", "ok"],
      ["pan", "ok"],
      ["aadhaar", "ok"],
    ],
  );
  const text = JSON.stringify(rows);
  assert.ok(!text.includes("BXQPI4821K") && !text.includes("412398764512") && !text.includes("4123"));
  assert.match(rows[1].detail, /•••• 821K/);
  const bare = documentRows({
    photo: false,
    panNumber: "",
    panImage: false,
    aadhaarNumber: undefined,
    aadhaarImage: false,
  });
  assert.deepEqual(
    bare.map((r) => r.state),
    ["missing", "missing", "missing"],
  );
  assert.equal(bare[1].stateLabel, "Incomplete");
  const half = documentRows({
    photo: true,
    panNumber: "BXQPI4821K",
    panImage: false,
    aadhaarNumber: "",
    aadhaarImage: true,
  });
  assert.equal(half[1].state, "missing");
  assert.match(half[1].detail, /card image missing/);
});
