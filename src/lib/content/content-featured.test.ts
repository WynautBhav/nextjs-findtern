import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/**
 * getFeaturedSkills: what the home page reads. The CMS rows are the answer; the live bench size replaces the stored
 * count, and a skill whose count cannot be worked out must not make the page fall back to the built-in list.
 */

register("../admin/test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("../admin/test-support/publish-fakes.mjs")) as typeof import("../admin/test-support/publish-fakes.mjs");
const content = (await import("./index.ts")) as typeof import("./index.ts");
const { FEATURED_SKILLS } = await import("./proof.ts");

type Fake = { rows: Record<string, unknown[]>; studentsForSkill: ((pool: unknown[], title: string) => unknown[]) | null };
const pub = () => (globalThis as unknown as { __pub: Fake }).__pub;
beforeEach(() => fakes.reset());

const SKILL = getTableName(fakes.schema.websiteFeaturedSkills);
const row = (title: string, resourceCount: number, sortOrder: number) => ({ id: title, title, iconClass: null, metaText: null, resourceCount, href: null, sortOrder, isActive: true });

test("the card count is the live bench size, not the stored number", async () => {
  pub().rows[SKILL] = [row("Sales", 73, 0)];
  pub().studentsForSkill = () => [{}, {}, {}];
  const got = await content.getFeaturedSkills();
  assert.deepEqual(got.map((s) => [s.title, s.resourceCount]), [["Sales", 3]]);
});

test("a skill the matcher cannot count keeps its CMS row and stored count; the list is not swapped for the built-in one", async () => {
  pub().rows[SKILL] = [row("C++", 5, 0), row("Sales", 73, 1)];
  pub().studentsForSkill = (_pool, title) => {
    if (title === "C++") throw new Error("Invalid regular expression");
    return [{}];
  };
  const got = await content.getFeaturedSkills();
  assert.deepEqual(got.map((s) => [s.title, s.resourceCount]), [["C++", 5], ["Sales", 1]]);
  assert.notDeepEqual(got, FEATURED_SKILLS);
});
