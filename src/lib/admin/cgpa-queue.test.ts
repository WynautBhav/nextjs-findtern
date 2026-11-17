import assert from "node:assert/strict";
import { test } from "node:test";

import { countsByFilter, firstAcceptedAt, matchesFilter, rowSla, searchRows, sortRows, startWarning, type CgpaQueueRow } from "./cgpa-queue.ts";

const NOW = new Date("2026-11-17T10:00:00.000Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const row = (over: Partial<CgpaQueueRow> & { accepted?: string[] } = {}): CgpaQueueRow => ({
  internId: "i1",
  name: "Aarav Mehta",
  email: "aarav@example.com",
  phone: "+91 98765 43210",
  college: "JECRC University",
  course: "B.Tech · year 3",
  status: "pending",
  semester: 5,
  claimedScore: "8.4",
  scoreType: "cgpa",
  correctedScore: null,
  requestedAt: ago(100),
  decidedAt: null,
  decidedBy: null,
  note: null,
  proofs: [],
  proposals: (over.accepted ?? []).map((a, i) => ({ id: `p${i}`, company: "Northwind", project: "Data", startDate: null, status: "accepted", acceptedAt: a })),
  ...over,
});

test("the clock is the earliest acceptance; none yet means none", () => {
  assert.equal(firstAcceptedAt([{ acceptedAt: ago(5) }, { acceptedAt: ago(30) }, { acceptedAt: null }]), ago(30));
  assert.equal(firstAcceptedAt([]), null);
  assert.equal(rowSla(row(), NOW).tone, "none");
});

test("SLA tone by hours since acceptance: ok, soon (24 h), overdue (48 h)", () => {
  assert.equal(rowSla(row({ accepted: [ago(5)] }), NOW).tone, "ok");
  assert.equal(rowSla(row({ accepted: [ago(30)] }), NOW).tone, "soon");
  assert.equal(rowSla(row({ accepted: [ago(48)] }), NOW).tone, "overdue");
  assert.equal(rowSla(row({ status: "verified", accepted: [ago(80)] }), NOW).tone, "none", "a decided check has no clock");
});

test("filters: pending includes overdue ones; overdue is the subset past 48 h; decided ones have their own", () => {
  const rows = [row({ accepted: [ago(5)] }), row({ accepted: [ago(60)] }), row({ status: "verified" }), row({ status: "incorrect" }), row()];
  assert.deepEqual(countsByFilter(rows, NOW), { pending: 3, overdue: 1, verified: 1, incorrect: 1 });
  assert.equal(rows.filter((r) => matchesFilter(r, "overdue", NOW)).length, 1);
  assert.equal(rows.filter((r) => matchesFilter(r, "pending", NOW)).length, 3);
});

test("search: name, email, college, company, phone digits; all words must match", () => {
  const rows = [row(), row({ internId: "i2", name: "Diya Rao", email: "diya@x.in", phone: "9000011111", college: "NIT Surat" })];
  assert.equal(searchRows(rows, "aarav").length, 1);
  assert.equal(searchRows(rows, "surat").length, 1);
  assert.equal(searchRows(rows, "98765 43210").length, 1);
  assert.equal(searchRows(rows, "9000011111").length, 1);
  assert.equal(searchRows(rows, "aarav surat").length, 0);
  assert.equal(searchRows(rows, "").length, 2);
  assert.equal(searchRows([row({ accepted: [ago(1)] })], "northwind").length, 1);
});

test("pending sort: oldest acceptance first, then those not accepted yet by request time; decided: newest first", () => {
  const a = row({ internId: "a", accepted: [ago(10)] });
  const b = row({ internId: "b", accepted: [ago(50)] });
  const c = row({ internId: "c", requestedAt: ago(500) });
  const d = row({ internId: "d", requestedAt: ago(20) });
  assert.deepEqual(sortRows([c, a, d, b], "pending").map((r) => r.internId), ["b", "a", "c", "d"]);
  const v1 = row({ internId: "v1", status: "verified", decidedAt: ago(3) });
  const v2 = row({ internId: "v2", status: "verified", decidedAt: ago(1) });
  assert.deepEqual(sortRows([v1, v2], "verified").map((r) => r.internId), ["v2", "v1"]);
});

test("start warning: amber under 48 h, red once the start day has come, nothing further out", () => {
  // 2026-11-18 00:00 IST is 2026-11-17T18:30Z: 8.5 h after NOW.
  assert.deepEqual(startWarning("2026-11-18", NOW), { tone: "soon", label: "Starts in 9 h" });
  assert.equal(startWarning("2026-11-19", NOW)?.tone, "soon");
  assert.equal(startWarning("2026-11-20", NOW), null);
  assert.equal(startWarning("2026-11-16", NOW)?.tone, "past");
  assert.equal(startWarning(null, NOW), null);
  assert.equal(startWarning("soon", NOW), null);
});
