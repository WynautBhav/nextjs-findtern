import { test } from "node:test";
import assert from "node:assert/strict";

import { TAKEN_DOWN_PAY_NOTE, splitTakenDownProposals } from "./takedown-payable.ts";

const p = (id: string, projectId: string) => ({ id, projectId, status: "accepted" });

test("nothing taken down: every proposal stays payable, in the same order, as the same array (identity)", () => {
  const list = [p("a", "p1"), p("b", "p2"), p("c", "p1")];
  const r = splitTakenDownProposals(list, new Set());
  assert.equal(r.payable, list, "the very same array, so no figure can change");
  assert.deepEqual(r.blocked, []);
});

test("a taken-down project's proposals are blocked, the rest stay payable in order", () => {
  const r = splitTakenDownProposals([p("a", "p1"), p("b", "p2"), p("c", "p1"), p("d", "p3")], new Set(["p1"]));
  assert.deepEqual(r.payable.map((x) => x.id), ["b", "d"]);
  assert.deepEqual(r.blocked.map((x) => x.id), ["a", "c"]);
});

test("the explanation line is the one the owner asked for", () => {
  assert.equal(TAKEN_DOWN_PAY_NOTE, "Taken down: contact admin");
});
