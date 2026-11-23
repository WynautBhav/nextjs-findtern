import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { nextCgpaVerification } from "../cgpa-verification-flow.ts";

/**
 * PUT /api/admin/interns/[id]/academics, traced through the REAL route handler with an in-memory database and the
 * real permission rule for its path (test-support/academics-fakes.mjs). What this proves: who may call it, what it
 * validates, what it keeps and what it writes. What it cannot prove: the SQL itself (the e2e covers that).
 */

type Res = { status: number; body: Record<string, unknown> };
register("./test-support/academics-hooks.mjs", import.meta.url);
const fakes = (await import("./test-support/academics-fakes.mjs")) as unknown as { reset: () => void };
const route = (await import("../../app/api/admin/interns/[id]/academics/route.ts")) as unknown as {
  PUT: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Res>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F = () => (globalThis as any).__acad;
const put = (body: unknown, id = "intern-1") =>
  route.PUT(new Request(`https://example.test/api/admin/interns/${id}/academics`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

const prodExtra = () => ({
  findternScore: 7.3,
  ratings: { coding: 7 },
  approvalStatus: "Approved",
  hiddenAt: "2026-11-01T00:00:00.000Z",
  academics: {
    level: "phd",
    degree: "cvb b",
    institution: "cbgh",
    status: "Completed",
    startYear: "2022",
    endYear: "2026",
    score: "",
    scoreType: "",
    certifications: [{ id: "c1", name: "Keep this cert" }],
    professionalCourses: [{ id: "p1", name: "CA" }],
  },
});
const fix = { qualificationLevel: "Bachelor's", degree: "B.Tech", scoreType: "cgpa", score: "8.4" };

test("a role without interns:write is refused (403) and nothing is read or written", async () => {
  fakes.reset();
  F().extra = prodExtra();
  F().permissions = ["interns:read"];
  const res = await put(fix);
  console.log("expected 403, actual:", res.status, res.body);
  assert.equal(res.status, 403);
  assert.equal(F().locked, false);
  assert.deepEqual(F().extra, prodExtra());
  assert.equal(F().audits.length, 0);
});

test("an admin with interns:write saves: score stored, every other extra_data key and academics key kept, one audit row", async () => {
  fakes.reset();
  F().extra = prodExtra();
  const res = await put(fix);
  console.log("expected 200, actual:", res.status, res.body);
  assert.equal(res.status, 200);
  assert.equal(F().locked, true, "read under a row lock");
  const e = F().extra;
  assert.equal(e.academics.score, "8.4");
  assert.equal(e.academics.scoreType, "cgpa");
  assert.equal(e.academics.level, "bachelors");
  assert.equal(e.academics.degree, "B.Tech");
  assert.deepEqual(e.academics.certifications, [{ id: "c1", name: "Keep this cert" }]);
  assert.deepEqual(e.academics.professionalCourses, [{ id: "p1", name: "CA" }]);
  assert.equal(e.findternScore, 7.3);
  assert.deepEqual(e.ratings, { coding: 7 });
  assert.equal(e.hiddenAt, "2026-11-01T00:00:00.000Z");
  assert.equal("cgpaVerification" in e, false, "no check is invented for an admin-typed score");
  assert.equal(F().audits.length, 1);
  const audit = F().audits[0];
  assert.equal(audit.action, "intern.academics_update");
  assert.equal(audit.targetId, "intern-1");
  assert.equal(audit.adminId, "admin-1");
  assert.deepEqual(audit.meta.changes, {
    qualificationLevel: { from: "Ph.D", to: "Bachelor's" },
    degree: { from: "cvb b", to: "B.Tech" },
    scoreType: { from: "", to: "cgpa" },
    score: { from: "", to: "8.4" },
  });
});

test("invalid scores are 400 with the field's message, and nothing is written", async () => {
  for (const [what, body, field] of [
    ["CGPA over 10", { scoreType: "cgpa", score: "11" }, "score"],
    ["percentage over 100", { scoreType: "percentage", score: "101" }, "score"],
    ["not a number", { scoreType: "cgpa", score: "eight" }, "score"],
    ["score without a type", { qualificationLevel: "Bachelor's", degree: "B.Tech", score: "8" }, "scoreType"],
    ["CGPA over 10 on a Ph.D", { qualificationLevel: "Ph.D", score: "11", scoreType: "cgpa" }, "score"],
    ["end year before start", { yearOfGraduation: "2021" }, "yearOfGraduation"],
  ] as const) {
    fakes.reset();
    F().extra = prodExtra();
    const res = await put(body);
    assert.equal(res.status, 400, what);
    assert.ok((res.body.fields as Record<string, string>)[field], `${what}: names ${field}`);
    assert.equal(typeof res.body.error, "string");
    assert.deepEqual(F().extra, prodExtra(), what);
    assert.equal(F().audits.length, 0, what);
  }
});

test("malformed bodies are 400: unknown key, wrong type, bad enum, empty, not JSON", async () => {
  for (const body of [{ score: 8.4 }, { score: "8", hack: 1 }, { scoreType: "gpa" }, { status: "Dropped" }, {}, null]) {
    fakes.reset();
    F().extra = prodExtra();
    assert.equal((await put(body)).status, 400, JSON.stringify(body));
  }
  fakes.reset();
  F().extra = prodExtra();
  const res = await route.PUT(new Request("https://example.test/api/admin/interns/i/academics", { method: "PUT", body: "not json" }), { params: Promise.resolve({ id: "i" }) });
  assert.equal(res.status, 400);
});

test("an unknown candidate is 404; a save that changes nothing writes and audits nothing", async () => {
  fakes.reset();
  F().extra = null;
  assert.equal((await put(fix)).status, 404);
  fakes.reset();
  F().extra = prodExtra();
  const res = await put({ institution: "cbgh" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.changed, []);
  assert.equal(F().updates.length, 0);
  assert.equal(F().audits.length, 0);
});

test("a failed audit write rolls the edit back (no unlogged change)", async () => {
  fakes.reset();
  F().extra = prodExtra();
  F().failAudit = true;
  await assert.rejects(() => put(fix), /audit insert failed/);
  assert.deepEqual(F().extra, prodExtra());
});

test("changing a score with a CGPA check on file: the check records the admin's number and accepted offers carry the correction", async () => {
  fakes.reset();
  const extra = {
    ...prodExtra(),
    academics: { ...prodExtra().academics, level: "bachelors", degree: "B.Tech", score: "8.0", scoreType: "cgpa" },
    cgpaVerification: nextCgpaVerification({}, { score: "8.0", scoreType: "cgpa", semester: 5 }, new Date("2026-11-10T00:00:00Z")),
  };
  F().extra = extra;
  F().offers = [{ id: "pr-1", offerDetails: { roleTitle: "Intern", cgpaAckAt: "2026-11-12T00:00:00Z" } }];
  const res = await put({ score: "8.4" });
  assert.equal(res.status, 200);
  assert.equal(res.body.offers, 1);
  const v = F().extra.cgpaVerification;
  assert.equal(v.status, "incorrect");
  assert.equal(v.correctedScore, "8.4");
  assert.equal(v.decidedBy, "admin-1");
  assert.equal(v.note, "edited by admin");
  assert.equal(v.history[v.history.length - 1].by, "admin-1");
  assert.equal(F().extra.academics.score, "8.4");
  const offer = F().offers[0].offerDetails;
  assert.equal("cgpaAckAt" in offer, false);
  assert.equal(offer.cgpaCorrection.from, "8.0");
  assert.equal(offer.cgpaCorrection.to, "8.4");
  assert.equal(offer.roleTitle, "Intern");
  assert.equal(F().audits[0].meta.offers, 1);
});

test("a check on file refuses a cleared score, and writes nothing", async () => {
  fakes.reset();
  const extra = {
    ...prodExtra(),
    academics: { ...prodExtra().academics, level: "bachelors", degree: "B.Tech", score: "8.0", scoreType: "cgpa" },
    cgpaVerification: nextCgpaVerification({}, { score: "8.0", scoreType: "cgpa", semester: 5 }),
  };
  F().extra = extra;
  const res = await put({ score: "", scoreType: "" });
  assert.equal(res.status, 409);
  assert.deepEqual(F().extra, extra);
  assert.equal(F().audits.length, 0);
});

test("with several onboarding rows the edit reads the newest one (the row the hire gate and the list read)", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  fakes.reset();
  F().extra = prodExtra();
  await put(fix);
  const order = F().orderBy as unknown[] | undefined;
  assert.ok(order && order.length >= 1, "the onboarding read must be ordered");
  const text = order.map((c) => new PgDialect().sqlToQuery(c as never).sql).join(" ");
  assert.match(text, /"created_at" desc/);
});
