import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/**
 * When the site shows the built-in copy instead of what the CMS holds.
 *
 * The rule (see `builtInApplies` in content/index.ts): built-in content is shown only when the database cannot be
 * reached, or when the collection has never been used - its table is empty AND no admin edit of that collection is on
 * record. A database that answers with "no such row", "not published" or "nothing active" is the CMS speaking, and a
 * deleted or unpublished item must stay gone instead of being replaced by the seed copy that ships in the code.
 */

register("../admin/test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("../admin/test-support/publish-fakes.mjs")) as typeof import("../admin/test-support/publish-fakes.mjs");
const content = (await import("./index.ts")) as typeof import("./index.ts");
const { BLOG_POSTS } = await import("./blog.ts");
const { FAQ_ITEMS } = await import("./faq.ts");
const { PARTNERS } = await import("./proof.ts");

type Fake = { rows: Record<string, unknown[] | ((n: number) => unknown[])>; dbDown: boolean; calls: { op: string; table?: string }[] };
const pub = () => (globalThis as unknown as { __pub: Fake }).__pub;
beforeEach(() => fakes.reset());

const T = {
  blog: getTableName(fakes.schema.websiteBlogPosts),
  faq: getTableName(fakes.schema.websiteFaqs),
  partner: getTableName(fakes.schema.websitePartners),
  face: getTableName(fakes.schema.websiteHappyFaces),
  skill: getTableName(fakes.schema.websiteFeaturedSkills),
  audit: getTableName(fakes.schema.adminAuditLog),
};
const slug = BLOG_POSTS[0].slug;

/** The first select of `table` (the reader's own query) returns `first`; any later one (the "has it ever been used?" probe) returns `probe`. */
const answers = (table: string, first: unknown[], probe: unknown[]) => {
  pub().rows[table] = (n: number) => (n === 0 ? first : probe);
};
const live = (over: Record<string, unknown> = {}) => ({ id: "1", slug, title: "T", excerpt: "", body: "<p>b</p>", status: "published", publishedAt: new Date(), updatedAt: new Date(), hasCover: false, hasBanner: false, ...over });

test("a post deleted in the CMS (table still has other rows) is gone, not served from the built-in copy", async () => {
  answers(T.blog, [], [{ id: "other" }]);
  assert.equal(await content.getBlogPost(slug), null);
});

test("an unpublished post stays hidden even though the built-in copy has the slug", async () => {
  pub().rows[T.blog] = [live({ status: "draft" })];
  assert.equal(await content.getBlogPost(slug), null);
});

test("first run: an empty table with no admin edit on record shows the built-in post", async () => {
  answers(T.blog, [], []);
  assert.equal((await content.getBlogPost(slug))?.slug, slug);
});

test("an empty table after an admin deleted the last post stays empty (the audit log remembers the CMS was used)", async () => {
  answers(T.blog, [], []);
  pub().rows[T.audit] = [{ id: "a1" }];
  assert.equal(await content.getBlogPost(slug), null);
  assert.deepEqual(await content.getBlogPosts(), []);
});

test("database unreachable: the built-in post is served", async () => {
  pub().dbDown = true;
  assert.equal((await content.getBlogPost(slug))?.slug, slug);
  assert.ok((await content.getBlogPosts()).length > 0);
});

test("the last published post unpublished (drafts remain) shows an empty blog, not the built-in posts", async () => {
  answers(T.blog, [], [{ id: "draft-1" }]);
  assert.deepEqual(await content.getBlogPosts(), []);
});

test("a published list is what the CMS returned", async () => {
  pub().rows[T.blog] = [live({ slug: "mine" })];
  assert.deepEqual((await content.getBlogPosts()).map((p) => p.slug), ["mine"]);
});

test("a deleted or unpublished post's image is gone too", async () => {
  answers(T.blog, [], [{ id: "other" }]);
  assert.equal(await content.getBlogImage(slug, "cover"), null, "deleted");
  fakes.reset();
  pub().rows[T.blog] = [{ cover: "data:image/png;base64,AAAA", banner: null, status: "draft" }];
  assert.equal(await content.getBlogImage(slug, "cover"), null, "draft");
  fakes.reset();
  answers(T.blog, [], []);
  assert.ok(await content.getBlogImage(slug, "cover"), "first run still shows the built-in image");
});

for (const [name, table, read, builtIn] of [
  ["FAQ", T.faq, () => content.getFaqItems(), FAQ_ITEMS],
  ["partners", T.partner, () => content.getPartners(), PARTNERS],
  ["happy faces", T.face, () => content.getHappyFaces(), null],
  ["featured skills", T.skill, () => content.getFeaturedSkills(), null],
] as const) {
  test(`${name}: nothing active but rows exist (all switched off) shows nothing, not the built-in list`, async () => {
    answers(table, [], [{ id: "off" }]);
    assert.deepEqual(await read(), []);
  });

  test(`${name}: first run (empty table, no admin edit) shows the built-in list`, async () => {
    answers(table, [], []);
    const got = await read();
    assert.ok((got as unknown[]).length > 0);
    if (builtIn) assert.deepEqual(got, builtIn);
  });

  test(`${name}: database unreachable shows the built-in list`, async () => {
    pub().dbDown = true;
    assert.ok(((await read()) as unknown[]).length > 0);
  });
}
