import assert from "node:assert/strict";
import { test } from "node:test";

import { requireSkillHref, skillFilterHref } from "./skill-filter-href.ts";

const stale = "cgpaMin=8&cgpaVerified=1&colleges=IIT+Bombay&sort=college%2Cscore&project=p1&page=3";

test("a free employer's skill chip links carry no Findtern Pro params from a stale link", () => {
  const href = skillFilterHref("/employer/candidates", stale, ["React", "Node.js"], false);
  const q = new URL(href, "http://x").searchParams;
  assert.equal(q.get("skills"), "React,Node.js");
  assert.equal(q.get("project"), "p1");
  assert.equal(q.get("sort"), "score");
  for (const k of ["cgpaMin", "cgpaVerified", "colleges", "page"]) assert.equal(q.has(k), false, k);
});

test("a subscriber's chip links keep their Pro filters and the college sort", () => {
  const q = new URL(skillFilterHref("/employer/candidates", stale, ["React"], true), "http://x").searchParams;
  assert.equal(q.get("cgpaMin"), "8");
  assert.equal(q.get("colleges"), "IIT Bombay");
  assert.equal(q.get("sort"), "college,score");
  assert.equal(q.has("page"), false);
});

test("null skills drops the pick; an empty query is the bare path", () => {
  assert.equal(skillFilterHref("/employer/candidates", "skills=React", null, true), "/employer/candidates");
});

test("restoring project skills (null) also drops pf=0, and never ends bare", () => {
  const q = new URL(skillFilterHref("/employer/candidates", "project=p1&pf=0", null, false), "http://x").searchParams;
  assert.equal(q.has("pf"), false);
  assert.equal(q.get("fresh"), "1");
  assert.equal(skillFilterHref("/employer/candidates", "", null, false), "/employer/candidates", "unchanged without pf");
  const kept = new URL(skillFilterHref("/employer/candidates", "project=p1&pf=0&min=6", null, false), "http://x").searchParams;
  assert.equal(kept.has("fresh"), false);
  assert.equal(kept.get("min"), "6");
});

test("requireSkillHref adds the skill, once, and spends the typed keyword", () => {
  const q = new URL(requireSkillHref("/employer/candidates", "q=reac&skills=Go&page=2", ["Go"], "React", false), "http://x").searchParams;
  assert.equal(q.get("skills"), "Go,React");
  assert.equal(q.has("q"), false);
  assert.equal(q.has("page"), false);
  const dup = new URL(requireSkillHref("/employer/candidates", "skills=Go,React", ["Go", "React"], "react", false), "http://x").searchParams;
  assert.equal(dup.get("skills"), "Go,react");
});
