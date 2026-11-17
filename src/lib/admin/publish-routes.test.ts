import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/**
 * Admin website-content "publish", end to end through the real route handlers with in-memory fakes (no database, no Next runtime):
 *   Website content: /api/admin/cms POST / PATCH / DELETE, the table each type writes, the revalidation and the audit row.
 * What a test pins is what a visitor would see: the right table and status written, the public page told to refresh,
 * the audit row written, and a failed write reported as an error without telling the site anything changed.
 */

register("./test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/publish-fakes.mjs")) as typeof import("./test-support/publish-fakes.mjs");
const schema = fakes.schema;
const cms = (await import("../../app/api/admin/cms/route.ts")) as typeof import("../../app/api/admin/cms/route.ts");

type Fake = {
  calls: { op: string; table?: string; values?: Record<string, unknown>; roles?: string[] }[];
  revalidated: { fn: string; path?: string; type?: string; tag?: string }[];
  notified: unknown[];
  rows: Record<string, unknown[]>;
  updateRows: Record<string, unknown[]>;
  failOn: { op: string; table: string; error: unknown } | null;
  deny: unknown;
  session: { uid: string; role: string };
};
const pub = () => (globalThis as unknown as { __pub: Fake }).__pub;
beforeEach(() => fakes.reset());

const T = {
  faq: getTableName(schema.websiteFaqs),
  blog: getTableName(schema.websiteBlogPosts),
  partner: getTableName(schema.websitePartners),
  audit: getTableName(schema.adminAuditLog),
};

const send = (path: string, method: string, body?: unknown) =>
  new Request(`http://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
type Res = { status: number; body: Record<string, unknown> };
const run = async (p: Promise<unknown>) => (await p) as Res;
const writes = () => pub().calls.filter((c) => ["insert", "update", "delete"].includes(c.op) && c.table !== T.audit);
const audits = () => pub().calls.filter((c) => c.table === T.audit && c.op === "insert");
const layoutRevalidated = () => pub().revalidated.some((r) => r.fn === "revalidatePath" && r.path === "/" && r.type === "layout");

/* ── 1. Website content ─────────────────────────────────────────────── */

test("CMS POST faq: inserts into website_faqs, refreshes the whole public site, writes a cms.create audit row", async () => {
  const res = await run(cms.POST(send("/api/admin/cms", "POST", { type: "faq", category: "Intern", question: "Is it free?", answer: "Yes." })));
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { ok: true, item: { id: "new-1" } });
  assert.deepEqual(writes().map((c) => c.table), [T.faq]);
  assert.equal(writes()[0].values?.question, "Is it free?");
  assert.ok(layoutRevalidated(), "revalidatePath('/', 'layout') after the insert");
  assert.equal(audits().length, 1);
  assert.deepEqual({ adminId: audits()[0].values?.adminId, action: audits()[0].values?.action, targetId: audits()[0].values?.targetId }, { adminId: "admin-1", action: "cms.create", targetId: "new-1" });
});

test("CMS POST blog as published: stamps publishedAt so the reader's status filter and ordering see it", async () => {
  const res = await run(cms.POST(send("/api/admin/cms", "POST", { type: "blog", title: "Hello", slug: "hello", status: "published", body: "Plain text" })));
  assert.equal(res.status, 201);
  const v = writes()[0].values!;
  assert.equal(writes()[0].table, T.blog);
  assert.equal(v.status, "published");
  assert.ok(v.publishedAt instanceof Date);
  assert.match(String(v.body), /^<p[^>]*>Plain text<\/p>$/);
  assert.ok(layoutRevalidated());
});

test("CMS PATCH blog draft -> published stamps publishedAt; published -> draft clears it", async () => {
  pub().rows[T.blog] = [{ slug: "hello", status: "draft" }];
  const up = await run(cms.PATCH(send("/api/admin/cms", "PATCH", { type: "blog", id: "p1", status: "published" })));
  assert.equal(up.status, 200);
  assert.equal(writes()[0].table, T.blog);
  assert.equal(writes()[0].values?.status, "published");
  assert.ok(writes()[0].values?.publishedAt instanceof Date);
  assert.ok(layoutRevalidated());

  fakes.reset();
  pub().rows[T.blog] = [{ slug: "hello", status: "published" }];
  const down = await run(cms.PATCH(send("/api/admin/cms", "PATCH", { type: "blog", id: "p1", status: "draft" })));
  assert.equal(down.status, 200);
  assert.equal(writes()[0].values?.status, "draft");
  assert.equal(writes()[0].values?.publishedAt, null);
  assert.ok(layoutRevalidated());
});

test("CMS PATCH toggle on a partner: writes isActive on website_partners, refreshes, audits cms.update", async () => {
  const res = await run(cms.PATCH(send("/api/admin/cms", "PATCH", { type: "partner", id: "x1", isActive: false })));
  assert.equal(res.status, 200);
  assert.equal(writes()[0].table, T.partner);
  assert.equal(writes()[0].values?.isActive, false);
  assert.ok(layoutRevalidated());
  assert.equal(audits()[0].values?.action, "cms.update");
});

test("CMS PATCH of an id that does not exist: 404, nothing refreshed, nothing audited", async () => {
  pub().updateRows[T.faq] = [];
  const res = await run(cms.PATCH(send("/api/admin/cms", "PATCH", { type: "faq", id: "gone", answer: "New" })));
  assert.equal(res.status, 404);
  assert.equal(pub().revalidated.length, 0);
  assert.equal(audits().length, 0);
});

test("CMS: a guard refusal (no cms:write, no CSRF) writes nothing and refreshes nothing", async () => {
  pub().deny = { status: 403, body: { error: "Your role doesn't allow this" } };
  for (const p of [cms.POST(send("/api/admin/cms", "POST", { type: "faq" })), cms.PATCH(send("/api/admin/cms", "PATCH", { type: "faq", id: "a" })), cms.DELETE(send("/api/admin/cms", "DELETE", { type: "faq", id: "a" }))]) {
    assert.equal((await run(p)).status, 403);
  }
  assert.equal(writes().length, 0);
  assert.equal(pub().revalidated.length, 0);
});

test("CMS POST: a database failure answers a JSON 500, and the public site is not told anything changed", async () => {
  pub().failOn = { op: "insert", table: T.faq, error: new Error("connect ETIMEDOUT") };
  const res = await run(cms.POST(send("/api/admin/cms", "POST", { type: "faq", category: "Intern", question: "Q", answer: "A" })));
  assert.equal(res.status, 500);
  assert.match(String(res.body.error), /Nothing was changed/);
  assert.equal(pub().revalidated.length, 0);
  assert.equal(audits().length, 0);
});

test("CMS POST: a failing audit insert does not turn a saved change into an error", async () => {
  pub().failOn = { op: "insert", table: T.audit, error: new Error("audit down") };
  const res = await run(cms.POST(send("/api/admin/cms", "POST", { type: "faq", category: "Intern", question: "Q", answer: "A" })));
  assert.equal(res.status, 201);
  assert.ok(layoutRevalidated());
});

test("CMS DELETE: deletes from the right table, refreshes the site, audits cms.delete", async () => {
  const res = await run(cms.DELETE(send("/api/admin/cms", "DELETE", { type: "blog", id: "p1" })));
  assert.equal(res.status, 200);
  assert.deepEqual(writes().map((c) => [c.op, c.table]), [["delete", T.blog]]);
  assert.ok(layoutRevalidated());
  assert.equal(audits()[0].values?.action, "cms.delete");
});

test("CMS DELETE: a database failure answers a JSON error, not an unhandled throw", async () => {
  pub().failOn = { op: "delete", table: T.blog, error: new Error("connect ETIMEDOUT") };
  const res = await run(cms.DELETE(send("/api/admin/cms", "DELETE", { type: "blog", id: "p1" })));
  assert.equal(res.status, 500);
  assert.equal(typeof res.body.error, "string");
  assert.equal(pub().revalidated.length, 0);
});
