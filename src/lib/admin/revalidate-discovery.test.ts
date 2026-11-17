import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/**
 * What a visitor and a crawler see after a write. The sitemap, /llms.txt and the blog feed are route handlers kept for an
 * hour, and /opportunities pages for five minutes, so every write that changes what they list must say so: the CMS
 * (posts, FAQs), the employer's legacy project routes (create, edit, delete) and the project lifecycle (publish, pause,
 * take down, restore).
 */

register("./test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/publish-fakes.mjs")) as typeof import("./test-support/publish-fakes.mjs");
const schema = fakes.schema;
const cms = await import("../../app/api/admin/cms/route.ts");
const transition = await import("../../app/api/employer/projects/[id]/transition/route.ts");
const takedown = await import("../../app/api/admin/projects/[id]/takedown/route.ts");
const restore = await import("../../app/api/admin/projects/[id]/restore/route.ts");

type Fake = {
  revalidated: { fn: string; path?: string; type?: string }[];
  rows: Record<string, unknown[]>;
  session: { uid: string; role: string };
};
const pub = () => (globalThis as unknown as { __pub: Fake }).__pub;
beforeEach(() => fakes.reset());

const T = { projects: getTableName(schema.projects), blog: getTableName(schema.websiteBlogPosts) };
const send = (method: string, body?: unknown) =>
  new Request("http://test.local/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const paths = () => pub().revalidated.filter((r) => r.fn === "revalidatePath").map((r) => r.path);
const opportunitiesRefreshed = () => pub().revalidated.some((r) => r.path === "/opportunities" && r.type === "layout");
const discoveryRefreshed = () => ["/sitemap.xml", "/llms.txt"].every((p) => paths().includes(p));

const asEmployer = () => (pub().session = { uid: "emp-1", role: "employer" });

/* ── CMS: sitemap + llms.txt + blog feed ───────────────────────────── */

test("CMS create / edit / delete refresh /sitemap.xml, /llms.txt and the blog feed", async () => {
  await cms.POST(send("POST", { type: "blog", title: "Hello", slug: "hello", status: "published", body: "x" }));
  for (const p of ["/sitemap.xml", "/llms.txt", "/blog/feed.xml"]) assert.ok(paths().includes(p), `POST ${p}`);
  fakes.reset();
  pub().rows[T.blog] = [{ slug: "hello", status: "draft" }];
  await cms.PATCH(send("PATCH", { type: "blog", id: "p1", status: "published" }));
  for (const p of ["/sitemap.xml", "/llms.txt", "/blog/feed.xml"]) assert.ok(paths().includes(p), `PATCH ${p}`);
  fakes.reset();
  await cms.DELETE(send("DELETE", { type: "blog", id: "p1" }));
  for (const p of ["/sitemap.xml", "/llms.txt", "/blog/feed.xml"]) assert.ok(paths().includes(p), `DELETE ${p}`);
});

/* ── Lifecycle: the sitemap lists /opportunities/<id> ──────────────── */

test("project publish, takedown and restore also refresh /sitemap.xml and /llms.txt", async () => {
  asEmployer();
  pub().rows[T.projects] = [{ id: "pr1", employerId: "emp-1", status: "draft", projectName: "Landing page", scopeOfWork: "short-term", skills: ["react"], locationType: "remote", publishedAt: null }];
  await transition.POST(send("POST", { to: "published" }), params("pr1"));
  assert.ok(opportunitiesRefreshed() && discoveryRefreshed(), "publish");

  fakes.reset();
  pub().session = { uid: "admin-1", role: "admin" };
  pub().rows[T.projects] = [{ id: "pr1", employerId: "emp-1", status: "published", projectName: "Landing page", takenDownAt: null }];
  await takedown.POST(send("POST", { reason: "Spam" }), params("pr1"));
  assert.ok(opportunitiesRefreshed() && discoveryRefreshed(), "takedown");

  fakes.reset();
  pub().session = { uid: "admin-1", role: "admin" };
  pub().rows[T.projects] = [{ id: "pr1", employerId: "emp-1", status: "published", projectName: "Landing page", takenDownAt: new Date() }];
  await restore.POST(send("POST"), params("pr1"));
  assert.ok(opportunitiesRefreshed() && discoveryRefreshed(), "restore");
});
