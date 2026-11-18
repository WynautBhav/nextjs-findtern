import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

/**
 * Filter bars get one shape from the shared primitives (admin: components/admin/filter-controls.tsx;
 * employer, college, intern: components/app/filter-controls.tsx). A raw <select>, search box or date
 * input anywhere else must not carry its own radius: that is how one bar ended up half pill and half
 * rounded rectangle. Form fields that are not filters may still pick their own look: they use
 * `fieldClass`/`controlClass`, which carry no radius override on the tag.
 */
const SRC = new URL("../", import.meta.url).pathname;

/** The primitives own the radius; marketing forms and the ui kit are outside the bars. */
const SHARED = new Set([
  "components/admin/filter-controls.tsx",
  "components/app/filter-controls.tsx",
  "components/employer/ui-tokens.ts",
]);
const OUTSIDE = [/^components\/ui\//, /^components\/marketing\//, /^components\/auth\//];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Opening tags of raw filter-ish controls: <select ...>, <input type="search|date" ...>. */
function controlTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<(select|input)\b[^<]*?(?:=>[^<]*?)*>/g;
  for (const m of source.matchAll(re)) {
    const tag = m[0];
    if (m[1] === "select" || /type=["'](search|date)["']/.test(tag)) tags.push(tag);
  }
  return tags;
}

const ONE_OFF_RADIUS = /\brounded-(md|lg|xl|2xl|3xl|\[[^\]]+\])/;

describe("filter controls use the shared shape", () => {
  it("no raw select, search or date input outside the primitives sets its own radius", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (SHARED.has(rel) || OUTSIDE.some((r) => r.test(rel))) continue;
      for (const tag of controlTags(readFileSync(file, "utf8"))) {
        const hit = tag.match(ONE_OFF_RADIUS);
        if (hit) offenders.push(`${rel}: ${hit[0]} on ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    assert.deepEqual(offenders, [], `use FILTER_*/APP_FILTER_* from the shared filter-controls instead:\n${offenders.join("\n")}`);
  });

  it("the guard sees a one-off radius (self-check)", () => {
    const bad = `<select className="h-9 rounded-md border" value={x}>`;
    assert.equal(controlTags(bad).length, 1);
    assert.ok(ONE_OFF_RADIUS.test(controlTags(bad)[0]));
    assert.equal(controlTags(`<select className={FILTER_SELECT}>`).filter((t) => ONE_OFF_RADIUS.test(t)).length, 0);
  });
});
