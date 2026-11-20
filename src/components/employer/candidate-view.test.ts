import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { AVATAR_TINTS, avatarTint, relaxations, cityField, cityParam, dedupeSkills, filterCount, showClearAll, headlineOf, DEFAULT_PAGE_SIZE, PAGE_SIZES, pageWindow, parsePageSize, parseView, rowSkills, skillLead, studyOf, skillBaseName, sortChangeAction, sortCommitValue } from "./candidate-view.ts";

test("skillBaseName drops the level", () => {
  assert.equal(skillBaseName("React · Advanced"), "React");
  assert.equal(skillBaseName("SQL"), "SQL");
});

test("rowSkills caps at 7, counts the rest, and puts project skills first", () => {
  const skills = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const { shown, more } = rowSkills(skills, new Set(["i"]));
  assert.equal(shown.length, 7);
  assert.equal(shown[0], "I");
  assert.equal(more, 2);
});

test("rowSkills matches a leveled skill on its name", () => {
  const { shown, isWanted } = rowSkills(["Go", "React · Advanced"], new Set(["react"]));
  assert.equal(shown[0], "React · Advanced");
  assert.equal(isWanted("React · Advanced"), true);
});

test("rowSkills shows seven or fewer without a +N", () => {
  assert.equal(rowSkills(["A", "B"], new Set()).more, 0);
  assert.equal(rowSkills(["A", "B", "C", "D", "E", "F", "G"], new Set()).more, 0);
});

test("a keyboard step on the sort select holds; a pointer choice navigates", () => {
  assert.equal(sortChangeAction(true), "hold");
  assert.equal(sortChangeAction(false), "navigate");
});

test("committing a held sort choice applies only a real change", () => {
  assert.equal(sortCommitValue("score", "fit"), "score");
  assert.equal(sortCommitValue("fit", "fit"), null);
  assert.equal(sortCommitValue(null, "fit"), null);
});

test("headlineOf: degree and field, else the top two skills, else nothing - never the bio", () => {
  const academics = { degree: "B.Tech", specialization: "Computer Science" };
  assert.equal(headlineOf({ academics, skills: ["React"] }), "B.Tech, Computer Science");
  assert.equal(headlineOf({ academics: null, skills: ["React · Advanced", "Python", "SQL"] }), "React and Python intern");
  assert.equal(headlineOf({ academics: { degree: "", specialization: "" }, skills: [] }), "");
  // A bio on the object is ignored even if present.
  assert.equal(headlineOf({ academics: null, skills: [], bio: "Call me on 98…" } as never), "");
});

test("studyOf / headlineOf drop a field the contact scrub masked whole (B.Tech read as a .tech domain)", () => {
  const academics = { degree: "[hidden until hire]", specialization: "Computer Engineering" };
  assert.equal(studyOf(academics), "Computer Engineering");
  assert.equal(headlineOf({ academics, skills: ["React"] }), "Computer Engineering");
  // Both masked: fall back to the skills line, never the marker.
  assert.equal(headlineOf({ academics: { degree: "[hidden until hire]", specialization: "[hidden until hire]" }, skills: ["SQL"] }), "SQL intern");
});

test("avatarTint: deterministic, one of the four, and ids can differ", () => {
  assert.equal(avatarTint("a"), avatarTint("a"));
  assert.ok(AVATAR_TINTS.includes(avatarTint("some-intern-id") as (typeof AVATAR_TINTS)[number]));
  // "a" = 97 -> 1, "b" = 98 -> 2
  assert.equal(avatarTint("a"), AVATAR_TINTS[1]);
  assert.notEqual(avatarTint("a"), avatarTint("b"));
  assert.equal(avatarTint(""), AVATAR_TINTS[0]);
});

test("skillLead: top three skills (asked-for first) lead the row, the chips get the rest", () => {
  const skills = ["React · Advanced", "Python", "SQL", "Redis", "Go"];
  assert.deepEqual(skillLead(skills, new Set()), { lead: "React, Python and SQL", rest: ["Redis", "Go"] });
  assert.deepEqual(skillLead(skills, new Set(["go", "redis"])), { lead: "Redis, Go and React", rest: ["Python", "SQL"] });
  assert.deepEqual(skillLead(["Rust", "C"], new Set()), { lead: "Rust and C", rest: [] });
  assert.deepEqual(skillLead(["Rust"], new Set()), { lead: "Rust", rest: [] });
  assert.deepEqual(skillLead([], new Set()), { lead: "", rest: [] });
});

test("rowSkills: skip keeps the lead and the chips within seven together", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `S${i + 1}`);
  const { shown, more } = rowSkills(ten, new Set(), 7, 3);
  assert.deepEqual(shown, ["S4", "S5", "S6", "S7"]);
  assert.equal(more, 3);
});

test("dedupeSkills drops repeats in any case, keeps the first spelling and order, and caps at 7", () => {
  assert.deepEqual(dedupeSkills("React,react,REACT, Node.js ,,node.js"), ["React", "Node.js"]);
  assert.deepEqual(dedupeSkills(""), []);
  assert.deepEqual(dedupeSkills("a,b,c,d,e,f,g,h,A"), ["a", "b", "c", "d", "e", "f", "g"]);
});

test("filterCount: chips, skills and a project city count once each; the Shortlist view counts none", () => {
  assert.equal(filterCount({ chips: 0, skills: 0, projectCity: false, shortlistView: false }), 0);
  assert.equal(filterCount({ chips: 2, skills: 3, projectCity: false, shortlistView: false }), 5);
  assert.equal(filterCount({ chips: 1, skills: 5, projectCity: true, shortlistView: false }), 7);
  assert.equal(filterCount({ chips: 2, skills: 3, projectCity: true, shortlistView: true }), 0);
});

test("showClearAll is off when the only chip is the project's own city (reset would bring it back)", () => {
  assert.equal(showClearAll([]), false);
  assert.equal(showClearAll(["project-city"]), false);
  assert.equal(showClearAll(["project-city", "min"]), true);
  assert.equal(showClearAll(["city"]), true);
});

// `_query.ts` and `_toolbar.tsx` import the DB and `@/` aliases, so node:test cannot load them: pin the wiring.
const query = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_query.ts"), "utf8");
const results = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_toolbar.tsx"), "utf8");

test("the active count, the skills parse and the project-city chip go through the tested helpers", () => {
  assert.match(query, /skills: dedupeSkills\(one\(params\.skills\) \?\? ""\)/);
  assert.match(query, /filterCount\(\{ chips: activeChips\(filters\)\.length, skills: effectiveSkills\.length, projectCity: Boolean\(projectCity\), shortlistView: filters\.saved \}\)/);
  // The chip: its label names the project as the source, and its X drops the project's defaults (pf=0) through withoutCity.
  assert.match(results, /key: "project-city", label: `City: \$\{projectCity\} \(from project\)`, href: withoutCity\(filters\)/);
  assert.match(results, /showClearAll\(chips\.map\(\(chip\) => chip\.key\)\)/);
  // Removing a project-supplied city is an explicit empty `city`, so the chip (and the pre-fill) does not come back.
  assert.match(query, /withFilters\(filters, \{ \.\.\.patch, city: "", citySet: true, page: "" \}\)/);
  // An absent `city` takes the project's; a present one (even empty) is the employer's choice.
  assert.match(query, /if \(!cityText && !filters\.citySet\) cityText = projectCities\(project\)/);
  assert.match(query, /citySet: params\.city !== undefined/);
});

test("parseView: grid and rows are themselves, anything else falls back to the cards", () => {
  assert.equal(parseView("grid"), "grid");
  assert.equal(parseView(" Grid "), "grid");
  assert.equal(parseView("rows"), "rows");
  assert.equal(parseView(" ROWS "), "rows");
  assert.equal(parseView("list"), "list");
  assert.equal(parseView("table"), "list");
  assert.equal(parseView("nonsense"), "list");
  assert.equal(parseView(""), "list");
  assert.equal(parseView(undefined), "list");
  assert.equal(parseView(null), "list");
});

test("rowSkills: a candidate with seven skills shows all seven chips when nothing is skipped", () => {
  const seven = ["A", "B", "C", "D", "E", "F", "G"];
  const { shown, more } = rowSkills(seven, new Set());
  assert.deepEqual(shown, seven);
  assert.equal(more, 0);
});

test("rowSkills: opening a folded list shows every skill (max = length)", () => {
  const nine = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const { shown, more } = rowSkills(nine, new Set(), nine.length);
  assert.equal(shown.length, 9);
  assert.equal(more, 0);
});

test("parsePageSize: 12, 24 and 48 are the choices; anything else is the default (12)", () => {
  assert.deepEqual([...PAGE_SIZES], [12, 24, 48]);
  assert.equal(DEFAULT_PAGE_SIZE, 12);
  assert.equal(parsePageSize("24"), 24);
  assert.equal(parsePageSize(48), 48);
  assert.equal(parsePageSize("30"), 12);
  assert.equal(parsePageSize("abc"), 12);
  assert.equal(parsePageSize(undefined), 12);
  assert.equal(parsePageSize(null), 12);
});

test("pageWindow: 30 candidates at 12 a page are chunks of 12, 12 and 6", () => {
  assert.deepEqual(pageWindow(30, 1, 12), { page: 1, pages: 3, start: 0, end: 12, first: 1, last: 12 });
  assert.deepEqual(pageWindow(30, 2, 12), { page: 2, pages: 3, start: 12, end: 24, first: 13, last: 24 });
  assert.deepEqual(pageWindow(30, 3, 12), { page: 3, pages: 3, start: 24, end: 30, first: 25, last: 30 });
});

test("pageWindow: a page past the end or below one is clamped, so 'Showing a-b of c' stays true", () => {
  assert.equal(pageWindow(30, 9, 12).page, 3);
  assert.equal(pageWindow(30, 0, 12).page, 1);
  assert.equal(pageWindow(30, Number.NaN, 12).page, 1);
  assert.equal(pageWindow(24, 2, 24).pages, 1);
  assert.equal(pageWindow(24, 2, 24).page, 1);
});

test("pageWindow: no candidates is one empty page showing 0-0", () => {
  assert.deepEqual(pageWindow(0, 1, 12), { page: 1, pages: 1, start: 0, end: 0, first: 0, last: 0 });
});

test("pageWindow: every candidate lands on exactly one page", () => {
  for (const total of [1, 11, 12, 13, 24, 25, 47, 48, 49]) {
    for (const size of PAGE_SIZES) {
      const { pages } = pageWindow(total, 1, size);
      let seen = 0;
      for (let p = 1; p <= pages; p++) {
        const w = pageWindow(total, p, size);
        assert.equal(w.start, seen);
        seen = w.end;
      }
      assert.equal(seen, total);
    }
  }
});

// "Preferred work city" starts with the selected project's city (read-only: nothing is written to the project).
test("cityField: no city in the URL pre-fills the project's city", () => {
  assert.deepEqual(cityField({ city: "", citySet: false, defaultCity: "Pune" }), { value: "Pune", prefilled: true });
});

test("cityField: an explicit city wins, and an explicit empty city stays empty", () => {
  assert.deepEqual(cityField({ city: "Mumbai", citySet: true, defaultCity: "Pune" }), { value: "Mumbai", prefilled: false });
  assert.deepEqual(cityField({ city: "", citySet: true, defaultCity: "Pune" }), { value: "", prefilled: false });
});

test("cityField: no project, or a project without a city, leaves the field empty", () => {
  assert.deepEqual(cityField({ city: "", citySet: false, defaultCity: "" }), { value: "", prefilled: false });
  assert.deepEqual(cityField({ city: "Delhi", citySet: false, defaultCity: "" }), { value: "Delhi", prefilled: false });
});

test("cityField: switching project or Reset (no city in the URL) shows the new project's city", () => {
  const url = { city: "", citySet: false };
  assert.equal(cityField({ ...url, defaultCity: "Pune" }).value, "Pune");
  assert.equal(cityField({ ...url, defaultCity: "Jaipur" }).value, "Jaipur");
});

test("cityParam: the project's own city is not sent, a cleared field is sent empty, anything else is explicit", () => {
  assert.equal(cityParam("Pune", "Pune"), null);
  assert.equal(cityParam(" pune ", "Pune"), null);
  assert.equal(cityParam("", "Pune"), "");
  assert.equal(cityParam("Pune, Mumbai", "Pune"), "Pune, Mumbai");
  assert.equal(cityParam("Mumbai", "Pune"), "Mumbai");
  // No default to opt out of: a cleared field sends nothing, as before.
  assert.equal(cityParam("", ""), null);
  assert.equal(cityParam("Mumbai", ""), "Mumbai");
});

test("the city pre-fill is wired through the form, the panel and the restore, and writes nothing", () => {
  const form = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_filter-form.tsx"), "utf8");
  const filters = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_filters.tsx"), "utf8");
  assert.match(form, /const city = cityParam\(value, cityDefault\);\s*if \(city !== null\) next\.append\(key, city\);/);
  assert.match(filters, /From your project: \{city\.value\}\. Change it to narrow or widen the search\./);
  assert.match(filters, /defaultValue=\{city\.value\}/);
  assert.match(query, /withoutSavedCity\(remembered\)/);
  assert.doesNotMatch(filters + form, /fetch\(|\/api\//);
});

const none = { q: "", skills: [] as string[], cities: [] as string[], includeRemote: true, proFilters: false, scoreFloors: false, match: "none" as const, projectName: "", saved: false };

test("relaxations: only what narrows the list, keyword, skill, city, remote, project, Pro, score in that order", () => {
  assert.deepEqual(relaxations(none), []);
  const all = relaxations({ ...none, q: "reac", skills: ["React · Advanced", "Node.js"], cities: ["pune"], includeRemote: false, proFilters: true, scoreFloors: true, match: "edited", projectName: "Web" }, 9);
  assert.deepEqual(all.map((r) => r.key), ["q", "skill", "city", "remote", "project", "pro", "score"]);
  assert.equal(all[1].label, "Drop Node.js");
  assert.equal(relaxations({ ...none, skills: ["React · Advanced"] })[0].label, "Drop React");
});

test("relaxations: capped, never offered on the shortlist tab, no 'project' unless the skills were edited", () => {
  const many = { ...none, q: "x", skills: ["A"], cities: ["pune"], includeRemote: false };
  assert.equal(relaxations(many).length, 4);
  assert.equal(relaxations(many, 2).length, 2);
  assert.deepEqual(relaxations({ ...many, saved: true }), []);
  assert.equal(relaxations({ ...many, match: "matched" }, 9).some((r) => r.key === "project"), false);
  assert.equal(relaxations({ ...many, match: "off" }, 9).some((r) => r.key === "project"), false);
});
