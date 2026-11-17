import assert from "node:assert/strict";
import { test } from "node:test";

import { skillFilterHref } from "./skill-filter-href.ts";

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
