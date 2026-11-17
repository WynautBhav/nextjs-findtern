import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/** The employer's legacy project routes (create, edit, delete) must tell the public /opportunities pages, which are kept for five minutes. */

register("./test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/publish-fakes.mjs")) as typeof import("./test-support/publish-fakes.mjs");
const schema = fakes.schema;
const created = await import("../../app/api/employer/[id]/projects/route.ts");
const legacy = await import("../../app/api/employer/projects/[id]/route.ts");

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
const opportunitiesRefreshed = () => pub().revalidated.some((r) => r.path === "/opportunities" && r.type === "layout");

const asEmployer = () => (pub().session = { uid: "emp-1", role: "employer" });

/* ── Legacy employer project routes ────────────────────────────────── */

test("employer project create (POST /api/employer/[id]/projects) refreshes the public role pages", async () => {
  asEmployer();
  const res = (await created.POST(
    send("POST", { projectName: "Landing page", skills: ["React", "Node.js", "SQL", "Python"], scopeOfWork: "short-term", locationType: "remote" }),
    params("emp-1"),
  )) as unknown as { status: number };
  assert.equal(res.status, 201);
  assert.ok(opportunitiesRefreshed());
});

test("employer project edit (PUT) refreshes the public role pages", async () => {
  asEmployer();
  pub().rows[T.projects] = [{ id: "pr1", employerId: "emp-1", status: "active", projectName: "Landing page", skills: [] }];
  const res = (await legacy.PUT(send("PUT", { status: "closed" }), params("pr1"))) as unknown as { status: number };
  assert.equal(res.status, 200);
  assert.ok(opportunitiesRefreshed());
});

test("employer project delete refreshes the public role pages", async () => {
  asEmployer();
  pub().rows[T.projects] = [{ id: "pr1", employerId: "emp-1", status: "draft", projectName: "Landing page" }];
  const res = (await legacy.DELETE(send("DELETE"), params("pr1"))) as unknown as { status: number };
  assert.equal(res.status, 200);
  assert.ok(opportunitiesRefreshed());
});

