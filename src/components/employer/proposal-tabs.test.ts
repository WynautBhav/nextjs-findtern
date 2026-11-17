import { test } from "node:test";
import assert from "node:assert/strict";

import { closedBreakdown, proposalBucket, proposalCounts, type ProposalRow } from "./proposal-bucket.ts";
import { closedSummary, inTab, tabFromParam, TAB_EMPTY, TAB_EXPLAINER, TAB_KEYS, TAB_LABEL, type TabKey } from "./proposal-tabs.ts";

const row = (status: string, extra: Partial<ProposalRow> = {}): ProposalRow => ({ status, lapsed: false, ...extra });

const ROWS: ProposalRow[] = [
  row("draft"),
  row("sent"),
  row("interview_scheduled"),
  row("accepted", { verifying: true }),
  row("accepted"),
  row("processing"),
  row("hired"),
  row("rejected"),
  row("withdrawn"),
  row("accepted", { expiredReason: "unpaid_past_start" }),
  row("sent", { lapsed: true }),
  row("expired"),
  row("sent", { viewOnly: true }),
  row("accepted", { viewOnly: true, verifying: true }),
  row("weird"),
];

test("each proposal is under exactly one state tab; the tab lengths equal the counter's numbers", () => {
  const STATE_TABS: TabKey[] = ["open", "draft", "verifying", "accepted", "viewonly", "hired", "closed"];
  const c = proposalCounts(ROWS);
  const len = (tab: TabKey) => ROWS.filter((r) => inTab(tab, proposalBucket(r.status, r.lapsed, r), Boolean(r.viewOnly))).length;
  const perTab = Object.fromEntries(STATE_TABS.map((t) => [t, len(t)]));
  assert.equal(perTab.open, c.awaiting);
  assert.equal(perTab.draft, c.drafts);
  assert.equal(perTab.verifying, c.verifying);
  assert.equal(perTab.accepted, c.accepted);
  assert.equal(perTab.viewonly, c.viewOnly);
  assert.equal(perTab.hired, c.hired);
  assert.equal(perTab.closed, c.closed);
  assert.equal(len("all"), c.all);
  // Only the unknown status is in no state tab ("All" only), as before.
  assert.equal(Object.values(perTab).reduce((a, b) => a + b, 0) + c.other, c.all);
  for (const r of ROWS) {
    const n = STATE_TABS.filter((t) => inTab(t, proposalBucket(r.status, r.lapsed, r), Boolean(r.viewOnly))).length;
    assert.equal(n, r.status === "weird" ? 0 : 1, `${r.status} is under ${n} tabs`);
  }
});

test("the owner's case: 2 accepted, none waiting; the two are under Verifying and To pay, never lost", () => {
  const rows = [row("accepted", { verifying: true }), row("accepted")];
  const tab = (t: TabKey) => rows.filter((r) => inTab(t, proposalBucket(r.status, r.lapsed, r), false)).length;
  assert.deepEqual([tab("all"), tab("open"), tab("verifying"), tab("accepted")], [2, 0, 1, 1]);
});

test("every tab has a label, a one-line explanation and an empty state", () => {
  for (const key of TAB_KEYS) {
    assert.ok(TAB_LABEL[key as TabKey].label && TAB_LABEL[key as TabKey].short, key);
    assert.ok(TAB_EXPLAINER[key as TabKey].length > 20, key);
    assert.ok(TAB_EMPTY[key as TabKey].title && TAB_EMPTY[key as TabKey].body, key);
  }
  assert.equal(TAB_LABEL.open.label, "Waiting for candidate");
  assert.equal(TAB_LABEL.verifying.label, "Verifying CGPA");
  assert.equal(TAB_LABEL.accepted.label, "To pay");
});

test("?status= picks a tab; anything unknown is All", () => {
  assert.equal(tabFromParam("verifying"), "verifying");
  assert.equal(tabFromParam(["accepted", "x"]), "accepted");
  assert.equal(tabFromParam("nope"), "all");
  assert.equal(tabFromParam(undefined), "all");
  assert.equal(tabFromParam("__proto__"), "all");
});

test("the Closed summary names each reason in plain words", () => {
  const b = closedBreakdown([row("rejected"), row("rejected"), row("withdrawn"), row("accepted", { expiredReason: "unpaid_past_start" }), row("sent", { lapsed: true }), row("expired")]);
  assert.equal(closedSummary(b), "2 declined · 1 withdrawn · 1 expired: not paid before start · 1 expired: no reply before start · 1 closed: accepted another offer");
  assert.equal(closedSummary([]), "");
});
