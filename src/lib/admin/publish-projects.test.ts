import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

import { getTableName } from "drizzle-orm";

/**
 * Project "publish", end to end through the real route handlers with in-memory fakes (no database, no Next runtime):
 * the employer's Submit / pause (draft -> published -> paused) and the admin takedown / restore. A test pins what an
 * intern would see: the right row written, the audit row, and the public /opportunities pages told to refresh.
 */

register("./test-support/publish-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/publish-fakes.mjs")) as typeof import("./test-support/publish-fakes.mjs");
const schema = fakes.schema;
const transition = (await import("../../app/api/employer/projects/[id]/transition/route.ts")) as typeof import("../../app/api/employer/projects/[id]/transition/route.ts");
const takedown = (await import("../../app/api/admin/projects/[id]/takedown/route.ts")) as typeof import("../../app/api/admin/projects/[id]/takedown/route.ts");
const restore = (await import("../../app/api/admin/projects/[id]/restore/route.ts")) as typeof import("../../app/api/admin/projects/[id]/restore/route.ts");
const { canTransition, isVisibleToInterns } = await import("../projects/lifecycle.ts");
const { INTERN_VISIBLE_STATUSES } = await import("../projects/transition.ts");

type Fake = {
  calls: { op: string; table?: string; values?: Record<string, unknown> }[];
  revalidated: { fn: string; path?: string; type?: string; tag?: string }[];
  rows: Record<string, unknown[]>;
  session: { uid: string; role: string };
};
const pub = () => (globalThis as unknown as { __pub: Fake }).__pub;
beforeEach(() => fakes.reset());

const T = { projects: getTableName(schema.projects), audit: getTableName(schema.adminAuditLog) };

const send = (path: string, method: string, body?: unknown) =>
  new Request(`http://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
type Res = { status: number; body: Record<string, unknown> };
const run = async (p: Promise<unknown>) => (await p) as Res;
const writes = () => pub().calls.filter((c) => ["insert", "update", "delete"].includes(c.op) && c.table !== T.audit);
const audits = () => pub().calls.filter((c) => c.table === T.audit && c.op === "insert");

const draftProject = {
  id: "pr1",
  employerId: "emp-1",
  status: "draft",
  projectName: "Landing page",
  scopeOfWork: "Build it",
  skills: ["react"],
  locationType: "remote",
  publishedAt: null,
};

test("project Submit (employer, draft -> published): sets status and publishedAt, and tells the public role pages", async () => {
  pub().session = { uid: "emp-1", role: "employer" };
  pub().rows[T.projects] = [draftProject];
  const res = await run(transition.POST(send("/x", "POST", { to: "published" }), params("pr1")));
  assert.deepEqual([res.status, res.body], [200, { ok: true, status: "published" }]);
  const w = writes()[0];
  assert.equal(w.table, T.projects);
  assert.equal(w.values?.status, "published");
  assert.ok(w.values?.publishedAt instanceof Date);
  assert.ok(
    pub().revalidated.some((r) => r.fn === "revalidatePath" && r.path === "/opportunities"),
    `the public /opportunities list and detail pages were not refreshed: ${JSON.stringify(pub().revalidated)}`,
  );
});

test("project Submit with the brief incomplete: 422, nothing written, nothing refreshed", async () => {
  pub().session = { uid: "emp-1", role: "employer" };
  pub().rows[T.projects] = [{ ...draftProject, skills: [] }];
  const res = await run(transition.POST(send("/x", "POST", { to: "published" }), params("pr1")));
  assert.equal(res.status, 422);
  assert.equal(writes().length, 0);
  assert.equal(pub().revalidated.length, 0);
});

test("project pause (published -> paused) hides it from /opportunities straight away", async () => {
  pub().session = { uid: "emp-1", role: "employer" };
  pub().rows[T.projects] = [{ ...draftProject, status: "published", publishedAt: new Date() }];
  const res = await run(transition.POST(send("/x", "POST", { to: "paused" }), params("pr1")));
  assert.equal(res.status, 200);
  assert.ok(pub().revalidated.some((r) => r.path === "/opportunities"), JSON.stringify(pub().revalidated));
});

test("admin takedown: sets takenDownAt on the project, audits project.takedown, and refreshes the public role pages", async () => {
  pub().rows[T.projects] = [{ id: "pr1", projectName: "Landing page", employerId: "emp-1", takenDownAt: null }];
  const res = await run(takedown.POST(send("/x", "POST", { reason: "Spam" }), params("pr1")));
  assert.equal(res.status, 200);
  assert.equal(res.body.takenDown, true);
  const w = writes().find((c) => c.table === T.projects)!;
  assert.ok(w.values?.takenDownAt instanceof Date);
  assert.equal(w.values?.takenDownBy, "admin-1");
  assert.equal(audits()[0].values?.action, "project.takedown");
  assert.ok(pub().revalidated.some((r) => r.path === "/opportunities"), `a taken-down role stays on the cached public pages: ${JSON.stringify(pub().revalidated)}`);
});

test("admin restore: clears takenDownAt, audits project.restore, and refreshes the public role pages", async () => {
  pub().rows[T.projects] = [{ id: "pr1", projectName: "Landing page", employerId: "emp-1", takenDownAt: new Date() }];
  const res = await run(restore.POST(send("/x", "POST"), params("pr1")));
  assert.equal(res.status, 200);
  assert.equal(res.body.takenDown, false);
  assert.equal(writes().find((c) => c.table === T.projects)!.values?.takenDownAt, null);
  assert.equal(audits()[0].values?.action, "project.restore");
  assert.ok(pub().revalidated.some((r) => r.path === "/opportunities"), JSON.stringify(pub().revalidated));
});

test("admin takedown of a listing already down is a no-op: no write, no refresh", async () => {
  pub().rows[T.projects] = [{ id: "pr1", projectName: "Landing page", employerId: "emp-1", takenDownAt: new Date() }];
  const res = await run(takedown.POST(send("/x", "POST", { reason: "Spam" }), params("pr1")));
  assert.deepEqual([res.status, res.body.unchanged], [200, true]);
  assert.equal(writes().length, 0);
});

test("who can publish: an admin only takes postings down; the employer publishes their own", () => {
  assert.equal(canTransition("draft", "published", "employer"), true);
  assert.equal(canTransition("pending_review", "published", "employer"), true);
  for (const from of ["draft", "pending_review", "paused", "rejected"]) assert.equal(canTransition(from, "published", "admin"), false, `admin ${from} -> published`);
  assert.equal(canTransition("published", "closed", "admin"), true);
});

test("interns see exactly published and legacy active; every other status is hidden", () => {
  assert.deepEqual([...INTERN_VISIBLE_STATUSES].sort(), ["active", "published"]);
  for (const s of ["published", "active"]) assert.equal(isVisibleToInterns(s), true, s);
  for (const s of ["draft", "pending_review", "paused", "rejected", "closed", "inactive", "archived", "", null]) assert.equal(isVisibleToInterns(s as string | null), false, String(s));
});
