import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Guards for the 5-minute server cache (lib/server-cache.ts):
 *  1. every route or action that writes a cached entity purges its tag (a forgotten one means an admin edit
 *     shows up to 5 minutes late);
 *  2. nothing cached is keyed or scoped by a person, and no cached read touches request data.
 * Source-level on purpose: the writers need a database and a signed-in admin to run.
 */

register("./admin/test-support/sem-hooks.mjs", import.meta.url);
const { getTableColumns } = await import("drizzle-orm");
const { pgTable, text, timestamp } = await import("drizzle-orm/pg-core");
const { CACHE_TAGS, cachedRead, purgeServerCache, reviveDates } = await import("./server-cache.ts");

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const files = walk(SRC).map((file) => ({ file, rel: path.relative(SRC, file), text: readFileSync(file, "utf8") }));
const byRel = (rel: string) => {
  const f = files.find((x) => x.rel === rel);
  assert.ok(f, `${rel} exists`);
  return f.text;
};

/** The text of the call that starts at `from` (the index of its opening paren), up to the matching paren. */
function callText(text: string, from: number): string {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error("unbalanced call");
}

// ---- 1. every writer purges -------------------------------------------------------------------------------

/** Each cached entity, how a write to it looks in source, and the tag that must be purged. */
const ENTITIES = [
  { tag: "plans", write: /\.(?:insert|update|delete)\(\s*(?:schema\.)?pricingPlans\s*\)/ },
  // `setSetting(` is the only writer of the cached settings keys; the per-employer overrides key is never cached.
  { tag: "settings", write: /\bsetSetting\(/ },
  // The CMS route writes whichever collection the body names (`TABLES[type]`), the skills catalog among them.
  { tag: "skills", write: { test: (t: string) => /\.(?:insert|update|delete)\(\s*(?:schema\.)?websiteFeaturedSkills\s*\)/.test(t) || (/CMS_TABLES/.test(t) && /\.(?:insert|update|delete)\(\s*table\s*\)/.test(t)) } },
  { tag: "colleges", write: /\.(?:insert|update|delete)\(\s*(?:schema\.)?colleges\s*\)/ },
] as const;

/** Files that match a write pattern but are not an admin edit route, with the reason. */
const NOT_ADMIN_WRITES: Record<string, string> = {
  "lib/platform-settings.ts": "defines setSetting; the callers purge",
  "lib/admin/cms-tables.ts": "table registry, no write",
  "app/api/admin/cms/image/route.ts": "reads the image column only",
};

for (const { tag, write } of ENTITIES) {
  test(`every writer of ${tag} purges the "${CACHE_TAGS[tag]}" tag`, () => {
    const writers = files.filter((f) => write.test(f.text) && !(f.rel in NOT_ADMIN_WRITES));
    assert.ok(writers.length > 0, "the scan finds the writers");
    for (const w of writers) {
      const purges = [...w.text.matchAll(/purgeServerCache\(([^)]*)\)/g)].map((m) => m[1]);
      assert.ok(
        purges.some((args) => args.includes(`CACHE_TAGS.${tag}`)),
        `${w.rel} writes ${tag} but never calls purgeServerCache(CACHE_TAGS.${tag})`,
      );
    }
  });
}

test("the pricing route purges plans and settings in the one function every write ends with", () => {
  const text = byRel("app/api/admin/pricing/route.ts");
  const fn = text.slice(text.indexOf("function revalidatePricing"));
  const head = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(head, /purgeServerCache\(CACHE_TAGS\.plans, CACHE_TAGS\.settings\)/);
  // PATCH + the four PUT branches + POST each end in revalidatePricing().
  const handlers = (text.match(/export async function (PATCH|PUT|POST)\b/g) ?? []).length;
  assert.equal(handlers, 3);
  assert.ok((text.match(/\brevalidatePricing\(\);/g) ?? []).length >= 6, "all six write exits call revalidatePricing()");
});

test("the CMS route purges the skills catalog after every create, edit and delete", () => {
  const text = byRel("app/api/admin/cms/route.ts");
  const feeds = (text.match(/revalidateContentFeeds\(\);/g) ?? []).length;
  const purges = (text.match(/purgeServerCache\(CACHE_TAGS\.skills\);/g) ?? []).length;
  assert.equal(feeds, 3);
  assert.equal(purges, feeds);
});

test("the college routes purge right after the write, before the audit row", () => {
  for (const rel of ["app/api/admin/colleges/route.ts", "app/api/admin/colleges/[id]/route.ts"]) {
    const text = byRel(rel);
    const wrote = text.search(/\.(insert|update)\(schema\.colleges\)|\.insert\(schema\.colleges\)/);
    const purged = text.indexOf("purgeServerCache(CACHE_TAGS.colleges)");
    const audited = text.indexOf("recordAdminAudit(");
    assert.ok(wrote > -1 && purged > wrote && purged < audited, `${rel}: write, then purge, then audit`);
  }
});

test("purgeServerCache expires immediately (no stale copy is served after an admin edit)", () => {
  assert.match(byRel("lib/server-cache.ts"), /revalidateTag\(tag, \{ expire: 0 \}\)/);
  assert.equal(typeof purgeServerCache, "function");
});

// ---- 2. key hygiene ---------------------------------------------------------------------------------------

/** Source with its string literals blanked, so a cache key like "by-sort-order" is not read as an `order`. */
const noStrings = (text: string) => text.replace(/"[^"\n]*"/g, '""');

const PER_PERSON = /\b(employerId|internId|userId|uid|session\w*|cookies|headers|proposals?|payments?|orders?|timesheets?|cgpa\w*)\b/i;

test("a cached read carries no user, session or money state, and only fixed string key parts", () => {
  const calls: { rel: string; text: string }[] = [];
  for (const f of files) {
    if (f.rel === "lib/server-cache.ts") continue;
    for (const m of f.text.matchAll(/\bcachedRead\(/g)) calls.push({ rel: f.rel, text: callText(f.text, m.index! + m[0].length - 1) });
  }
  assert.ok(calls.length >= 4, "the scan finds the cached reads");
  for (const c of calls) {
    const keyParts = /^\(\s*(\[[^\]]*\])/.exec(c.text)?.[1];
    assert.ok(keyParts, `${c.rel}: first argument is an array literal`);
    assert.match(keyParts, /^\[\s*("[a-z0-9-]+"\s*,?\s*)+\]$/, `${c.rel}: key parts are fixed string literals`);
    assert.doesNotMatch(noStrings(c.text), PER_PERSON, `${c.rel}: ${c.text.slice(0, 80)}... touches per-person or money state`);
    const tags = /\[(CACHE_TAGS\.\w+(?:,\s*CACHE_TAGS\.\w+)*)\]/.exec(c.text);
    assert.ok(tags, `${c.rel}: tags come from CACHE_TAGS`);
  }
});

test("unstable_cache is only called through cachedRead, plus the existing public bench-count pool", () => {
  const direct = files.filter((f) => /\bunstable_cache\(/.test(f.text)).map((f) => f.rel).sort();
  assert.deepEqual(direct, ["lib/content/index.ts", "lib/server-cache.ts"]);
});

test("the per-employer subscription grants are never served from the cache", () => {
  const text = byRel("lib/platform-settings.ts");
  assert.match(text, /UNCACHED_KEYS[^=]*=\s*\[\s*"employer_subscription_overrides"\s*\]/);
  assert.match(text, /UNCACHED_KEYS\.includes\(key\) \? await readSettingRowLive\(key\) : await readSettingRow\(key\)/);
});

test("cached-reads.ts reads only global tables: no user, employer or session in it", () => {
  const text = byRel("lib/cached-reads.ts");
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(noStrings(code), PER_PERSON);
  assert.doesNotMatch(code, /next\/headers/);
});

test("the pricing plans cache stays out of the proposal and payment write paths", () => {
  for (const rel of ["app/api/employer/[id]/proposals/route.ts", "lib/payments.ts", "lib/employer-payable.ts"]) {
    assert.doesNotMatch(byRel(rel), /getActivePricingPlans/, `${rel} reads plans live`);
  }
});

// ---- 3. behaviour -----------------------------------------------------------------------------------------

test("reviveDates turns the ISO strings of a cached row back into Dates, and nothing else", () => {
  const t = pgTable("t_server_cache", { id: text("id"), createdAt: timestamp("created_at"), name: text("name") });
  assert.deepEqual(Object.keys(getTableColumns(t)), ["id", "createdAt", "name"]);
  const when = new Date("2026-11-20T10:00:00.000Z");
  const [row] = reviveDates(t, [JSON.parse(JSON.stringify({ id: "a", createdAt: when, name: "2026-11-20" }))]);
  assert.ok(row.createdAt instanceof Date);
  assert.equal((row.createdAt as Date).getTime(), when.getTime());
  assert.equal(row.name, "2026-11-20");
  assert.equal(reviveDates(t, [{ id: "a", createdAt: null }])[0].createdAt, null);
});

test("cachedRead runs the function, passes arguments through and does not swallow its errors", async () => {
  const read = cachedRead(["guard-test"], [CACHE_TAGS.plans], async (n: number) => {
    if (n < 0) throw new Error("db down");
    return n * 2;
  });
  assert.equal(await read(21), 42);
  await assert.rejects(() => read(-1), /db down/);
});
