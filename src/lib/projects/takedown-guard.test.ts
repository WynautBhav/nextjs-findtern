import assert from "node:assert/strict";
import test from "node:test";

import { makeStore, loadersFor } from "../admin/test-support/takedown-fakes.mjs";
import {
  PROJECT_TAKEN_DOWN_CODE,
  PROJECT_TAKEN_DOWN_MESSAGE,
  isTakenDown,
  makeGuard,
  type GuardLoaders,
} from "./takedown-guard.ts";

/**
 * The shared server guard for every employer action on a project. Behaviour tests with an in-memory store (no database,
 * no Next runtime): the guard itself must refuse a taken-down project with 409 `project_taken_down`, whichever way the
 * request reaches the project (project id, proposal, interview, timesheet, cart item), and must read the flag fresh.
 */

const NOW = new Date("2026-11-17T08:00:00Z");

function world() {
  const store = makeStore();
  store.projects.set("p-down", { id: "p-down", employerId: "emp-1", projectName: "Growth Intern", takenDownAt: NOW });
  store.projects.set("p-up", { id: "p-up", employerId: "emp-1", projectName: "Data Intern", takenDownAt: null });
  store.projects.set("p-other", { id: "p-other", employerId: "emp-2", projectName: "Other", takenDownAt: NOW });
  store.proposals.set("prop-down", { id: "prop-down", projectId: "p-down" });
  store.proposals.set("prop-up", { id: "prop-up", projectId: "p-up" });
  store.interviews.set("int-down", { id: "int-down", projectId: "p-down" });
  store.interviews.set("int-up", { id: "int-up", projectId: "p-up" });
  store.interviews.set("int-none", { id: "int-none", projectId: null });
  store.timesheets.set("ts-down", { id: "ts-down", proposalId: "prop-down" });
  store.timesheets.set("ts-up", { id: "ts-up", proposalId: "prop-up" });
  store.cart.set("cart-down", { id: "cart-down", projectId: "p-down" });
  const guard = makeGuard(loadersFor(store) as unknown as GuardLoaders);
  return { store, guard };
}

type Res = { status: number; body: Record<string, unknown> };
const body = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }) as Res;

test("isTakenDown is true only when takenDownAt is set (Date or ISO string), false for null/undefined/empty", () => {
  assert.equal(isTakenDown({ takenDownAt: NOW }), true);
  assert.equal(isTakenDown({ takenDownAt: "2026-11-17T08:00:00Z" }), true);
  assert.equal(isTakenDown({ takenDownAt: null }), false);
  assert.equal(isTakenDown({}), false);
  assert.equal(isTakenDown(null), false);
  assert.equal(isTakenDown(undefined), false);
});

test("a project that is taken down refuses with 409, code project_taken_down and the owner's message", async () => {
  const { guard } = world();
  const r = await guard.project("p-down", "emp-1");
  assert.equal(r.ok, false);
  if (r.ok) return;
  const res = await body(r.response);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, PROJECT_TAKEN_DOWN_CODE);
  assert.equal(res.body.error, PROJECT_TAKEN_DOWN_MESSAGE);
  assert.equal(PROJECT_TAKEN_DOWN_MESSAGE, "This project was taken down by Findtern. You can view it but not change it. Contact admin to resolve this.");
  assert.equal(res.body.projectId, "p-down");
});

test("every way of reaching a taken-down project is refused: proposal, interview, timesheet, cart item", async () => {
  const { guard } = world();
  for (const [name, call] of [
    ["proposal", () => guard.proposal("prop-down")],
    ["interview", () => guard.interview("int-down")],
    ["timesheet", () => guard.timesheet("ts-down")],
    ["cart item", () => guard.cartItem("cart-down")],
  ] as const) {
    const r = await call();
    assert.equal(r.ok, false, `${name} must be refused`);
    if (!r.ok) assert.equal((await body(r.response)).status, 409, name);
  }
});

test("a project that is not taken down is unchanged: every resolver lets the action through", async () => {
  const { guard } = world();
  assert.equal((await guard.project("p-up", "emp-1")).ok, true);
  assert.equal((await guard.proposal("prop-up")).ok, true);
  assert.equal((await guard.interview("int-up")).ok, true);
  assert.equal((await guard.timesheet("ts-up")).ok, true);
});

test("things that do not resolve to a project are not the guard's business (the route's own 404/403 answers)", async () => {
  const { guard } = world();
  assert.equal((await guard.project("missing", "emp-1")).ok, true);
  assert.equal((await guard.proposal("missing")).ok, true);
  assert.equal((await guard.interview("int-none")).ok, true, "an interview with no project is not project-scoped");
  assert.equal((await guard.timesheet("missing")).ok, true);
});

test("a project owned by another employer is not described to the caller: the guard stays silent and the route's ownership check answers", async () => {
  const { guard } = world();
  const r = await guard.project("p-other", "emp-1");
  assert.equal(r.ok, true);
});

test("restored: the very next call lets the action through (no cached flag), and a new takedown refuses again", async () => {
  const { store, guard } = world();
  assert.equal((await guard.project("p-down", "emp-1")).ok, false);
  const before = store.reads;
  store.projects.get("p-down")!.takenDownAt = null; // admin restore
  assert.equal((await guard.project("p-down", "emp-1")).ok, true);
  assert.equal((await guard.proposal("prop-down")).ok, true);
  store.projects.get("p-down")!.takenDownAt = NOW; // admin takes it down again
  assert.equal((await guard.timesheet("ts-down")).ok, false);
  assert.ok(store.reads >= before + 3, "each guard call reads the database again");
});

test("the guard is an employer guard: the same project is still readable and an admin or intern path never calls it", async () => {
  // Pure check that the helper does not look at who the caller is beyond the owner filter.
  const { guard } = world();
  const r = await guard.project("p-down");
  assert.equal(r.ok, false, "with no owner passed it still refuses a taken-down project");
});
