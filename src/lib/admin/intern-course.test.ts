import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { courseFilterSql, courseOptions, parseCourse } from "./intern-course.ts";

const extra = sql.raw("o.extra_data");
const render = (s: ReturnType<typeof sql>) => new PgDialect().sqlToQuery(s);

test("parseCourse trims, and an empty or missing value means no filter", () => {
  assert.equal(parseCourse({ course: "  B.Tech " }), "B.Tech");
  assert.equal(parseCourse({ course: "" }), "");
  assert.equal(parseCourse({ course: "   " }), "");
  assert.equal(parseCourse({}), "");
});

test("no course, no condition", () => {
  assert.equal(courseFilterSql(extra, ""), undefined);
});

test("the course is a bound parameter, never part of the SQL text", () => {
  const evil = "B.Tech'; DROP TABLE users;--";
  const q = render(courseFilterSql(extra, evil)!);
  assert.deepEqual(q.params, [evil]);
  assert.ok(!q.sql.includes("DROP"));
  assert.match(q.sql, /academics/);
  assert.match(q.sql, /lower\(/);
});

test("courseOptions: blanks dropped, one option per spelling ignoring case, sorted", () => {
  assert.deepEqual(
    courseOptions(["BBA", "", " B.Tech ", "b.tech", null, "BBA"]),
    [
      { value: "B.Tech", label: "B.Tech" },
      { value: "BBA", label: "BBA" },
    ],
  );
});
