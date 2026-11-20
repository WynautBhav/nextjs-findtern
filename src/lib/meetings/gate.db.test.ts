import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * The pre-join gate through its REAL route handlers against a REAL Postgres (Phase 1 pattern): GET /api/meet/<token>/join,
 * POST /api/meet/<token>/accept, GET /api/interviews/<id>/gate, the old POST /api/interviews/<id>/join. No Google, no mail.
 * Skipped unless MEETINGS_TEST_DATABASE_URL points at a scratch database on 127.0.0.1 with all migrations applied (incl. 0044).
 */
const URL_ = process.env.MEETINGS_TEST_DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(URL_).hostname;
  } catch {
    return "";
  }
})();
const enabled = URL_ !== "" && host === "127.0.0.1";
if (URL_ !== "" && !enabled) throw new Error("MEETINGS_TEST_DATABASE_URL must be on 127.0.0.1");

type Res = { status: number; body?: Record<string, unknown>; location?: string };
type Ctx = { params: Promise<Record<string, string>> };
type Route = { GET?: (r: Request, c: Ctx) => Promise<Res>; POST?: (r: Request, c: Ctx) => Promise<Res> };

test("meeting gate, real SQL", { skip: !enabled && "set MEETINGS_TEST_DATABASE_URL (scratch Postgres on 127.0.0.1)" }, async (t) => {
  process.env.DATABASE_URL = URL_;
  process.env.MAIL_MODE = "log";
  process.env.SESSION_SECRET = "gate-test-secret-at-least-32-characters";
  process.env.TRUST_PROXY = "1";
  delete process.env.PUBLIC_ORIGIN;
  register("./test-support/db-hooks.mjs", import.meta.url);
  const { getDb, schema } = (await import("../db/index.ts")) as typeof import("../db/index.ts");
  const { and, eq, sql } = await import("drizzle-orm");
  const { DISCLAIMER_VERSION, signGateStart, gateSecret } = await import("./gate.ts");
  const { hasAccepted, listAcceptances } = await import("./gate-service.ts");
  const load = (p: string) => import(p) as unknown as Promise<Route>;
  const accept = await load("../../app/api/meet/[token]/accept/route.ts");
  const join = await load("../../app/api/meet/[token]/join/route.ts");
  const gateOf = await load("../../app/api/interviews/[id]/gate/route.ts");
  const joinOld = await load("../../app/api/interviews/[id]/join/route.ts");

  const db = getDb();
  const tag = `gt${Date.now()}`;
  let phone = Math.floor(7_000_000_000 + Math.random() * 1_000_000_000);
  const [intern] = await db.insert(schema.users).values({ firstName: "Gita", lastName: "Test", email: `${tag}-i@example.test`, phoneNumber: String(phone++), password: "x", role: "intern" } as never).returning();
  const mkEmp = async (n: string) => (await db.insert(schema.employers).values({ name: n, companyName: `${n} Co`, companyEmail: `${tag}-${n}@example.test`, phoneNumber: String(phone++), password: "x" }).returning())[0];
  const [emp, otherEmp] = [await mkEmp("Gate"), await mkEmp("Other")];
  const MEET = "https://meet.google.com/abc-defg-hij";
  const slot = new Date(Date.now() + 10 * 60_000);
  const mkIv = async (over: Record<string, unknown> = {}) =>
    (await db.insert(schema.interviews).values({ employerId: emp.id, internId: intern.id, status: "scheduled", slot1: slot, selectedSlot: 1, meetingLink: MEET, gateToken: `${tag}-${Math.random().toString(36).slice(2)}`, ...over } as never).returning())[0];
  const as = (role: "employer" | "intern", uid: string) => ((globalThis as { __session?: unknown }).__session = { role, uid, sid: "s" });
  const post = (token: string, body: unknown, ip = "203.0.113.9") => accept.POST!(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ token }) });
  const get = (route: Route, key: string, v: string) => route.GET!(new Request("https://example.test/api"), { params: Promise.resolve({ [key]: v }) });
  const stampAgo = (token: string, role: "employer" | "intern", uid: string, ms: number) => signGateStart(gateSecret(), { token, role, uid, version: DISCLAIMER_VERSION }, Date.now() - ms);
  const rows = (id: string) => db.select().from(schema.meetingGateAcceptances).where(eq(schema.meetingGateAcceptances.interviewId, id));
  const created: string[] = [];

  try {
    await t.test("no acceptance: the join redirect sends the person back to the gate, never to Meet", async () => {
      const iv = await mkIv();
      created.push(iv.id);
      as("employer", emp.id);
      const r = await get(join, "token", iv.gateToken!);
      assert.equal(r.status, 302);
      assert.ok(r.location!.endsWith(`/meet/${encodeURIComponent(iv.gateToken!)}`), r.location);
      assert.ok(!r.location!.includes("meet.google.com"));
      const [after] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, iv.id));
      assert.equal(after.employerJoinedAt, null, "not counted as joined without the gate");
    });

    await t.test("the server enforces the wait: too early, forged, other person's and back-dated stamps record nothing", async () => {
      const iv = await mkIv();
      created.push(iv.id);
      const tok = iv.gateToken!;
      as("intern", intern.id);
      const early = await post(tok, { stamp: stampAgo(tok, "intern", intern.id, 100) });
      assert.deepEqual([early.status, early.body?.code], [409, "too_early"]);
      const edge = await post(tok, { stamp: stampAgo(tok, "intern", intern.id, 8_500) });
      assert.equal(edge.status, 409);
      const forged = await post(tok, { stamp: `${Date.now() - 20_000}.${"A".repeat(43)}` });
      assert.deepEqual([forged.status, forged.body?.code], [410, "restart"]);
      const missing = await post(tok, {});
      assert.equal(missing.status, 410);
      const elsewhere = await post(tok, { stamp: stampAgo(`${tok}x`, "intern", intern.id, 12_000) });
      assert.equal(elsewhere.status, 410);
      const asEmployer = await post(tok, { stamp: stampAgo(tok, "employer", emp.id, 12_000) });
      assert.equal(asEmployer.status, 410, "an employer's stamp is not the intern's");
      assert.equal((await rows(iv.id)).length, 0);
      assert.equal(await hasAccepted(db, iv.id, { role: "intern", uid: intern.id }), false);
    });

    await t.test("a stamp old enough records the acceptance with a salted IP hash, then the join redirects to Meet", async () => {
      const iv = await mkIv();
      created.push(iv.id);
      const tok = iv.gateToken!;
      as("employer", emp.id);
      const ok = await post(tok, { stamp: stampAgo(tok, "employer", emp.id, 10_000) }, "203.0.113.9");
      assert.equal(ok.status, 200);
      assert.equal(ok.body?.next, `/api/meet/${encodeURIComponent(tok)}/join`);
      assert.ok(!JSON.stringify(ok.body).includes("meet.google.com"), "the accept answer never carries the Meet URL");
      const [row] = await rows(iv.id);
      assert.deepEqual([row.userType, row.userId, row.disclaimerVersion], ["employer", emp.id, DISCLAIMER_VERSION]);
      assert.ok(row.acceptedAt);
      assert.ok(row.ipHash && row.ipHash.length === 32 && !row.ipHash.includes("203.0.113"), "salted hash, not the address");
      const r = await get(join, "token", tok);
      assert.equal(r.location, MEET);
      const [after] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, iv.id));
      assert.ok(after.employerJoinedAt, "the employer's first counted join is stamped at the redirect");
      // Re-opening: acceptance is reused, no second countdown needed (no stamp at all) and no second row.
      const again = await post(tok, {});
      assert.equal(again.status, 200);
      assert.equal((await rows(iv.id)).length, 1);
      assert.equal((await get(join, "token", tok)).location, MEET);
    });

    await t.test("a new disclaimer version forces the gate again; the old acceptance stays on record", async () => {
      const iv = await mkIv();
      created.push(iv.id);
      const tok = iv.gateToken!;
      await db.insert(schema.meetingGateAcceptances).values({ interviewId: iv.id, userType: "intern", userId: intern.id, disclaimerVersion: "2020-01-01.0", ipHash: null });
      as("intern", intern.id);
      assert.equal(await hasAccepted(db, iv.id, { role: "intern", uid: intern.id }, "2020-01-01.0"), true);
      assert.equal(await hasAccepted(db, iv.id, { role: "intern", uid: intern.id }), false);
      const r = await get(join, "token", tok);
      assert.ok(r.location!.endsWith(`/meet/${encodeURIComponent(tok)}`));
      assert.equal((await post(tok, {})).status, 410, "needs a real stamp for the current version");
      assert.equal((await post(tok, { stamp: stampAgo(tok, "intern", intern.id, 11_000) })).status, 200);
      const list = await listAcceptances(db, iv.id);
      assert.deepEqual(list.map((a) => a.version).sort(), ["2020-01-01.0", DISCLAIMER_VERSION].sort());
      assert.ok(!("ipHash" in list[0]), "the admin list does not expose the hash");
    });

    await t.test("another person, an unknown token, a cancelled meeting and a link not ready are all refused", async () => {
      const iv = await mkIv();
      const cancelled = await mkIv({ status: "cancelled" });
      const pending = await mkIv({ meetingLink: null });
      created.push(iv.id, cancelled.id, pending.id);
      const stamp = (tok: string, who: "employer" | "intern", uid: string) => stampAgo(tok, who, uid, 12_000);
      as("employer", otherEmp.id);
      assert.equal((await post(iv.gateToken!, { stamp: stamp(iv.gateToken!, "employer", otherEmp.id) })).status, 404);
      assert.equal((await get(join, "token", iv.gateToken!)).status, 404);
      as("intern", intern.id);
      assert.equal((await post("no-such-token", { stamp: "x" })).status, 404);
      const c = await post(cancelled.gateToken!, { stamp: stamp(cancelled.gateToken!, "intern", intern.id) });
      assert.deepEqual([c.status, c.body?.code], [409, "closed"]);
      const p = await post(pending.gateToken!, { stamp: stamp(pending.gateToken!, "intern", intern.id) });
      assert.deepEqual([p.status, p.body?.code], [409, "pending"]);
      assert.equal((await rows(iv.id)).length + (await rows(cancelled.id)).length + (await rows(pending.id)).length, 0);
    });

    await t.test("every Join button's address goes to the gate; the old POST join no longer hands out the Meet URL", async () => {
      const iv = await mkIv();
      const old = await mkIv({ gateToken: null });
      created.push(iv.id, old.id);
      as("employer", emp.id);
      const g = await get(gateOf, "id", iv.id);
      assert.ok(g.location!.endsWith(`/meet/${encodeURIComponent(iv.gateToken!)}`));
      const minted = await get(gateOf, "id", old.id);
      const [m] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, old.id));
      assert.ok(m.gateToken && minted.location!.endsWith(`/meet/${encodeURIComponent(m.gateToken)}`), "a meeting made before Phase 1 gets a token");
      as("employer", otherEmp.id);
      assert.equal((await get(gateOf, "id", iv.id)).status, 404);
      as("employer", emp.id);
      const r = await joinOld.POST!(new Request("https://example.test/api", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: iv.id }) });
      assert.equal(r.status, 200);
      assert.ok(!JSON.stringify(r.body).includes("meet.google.com"));
      assert.equal(r.body?.gate, `/api/interviews/${iv.id}/gate`);
    });
  } finally {
    const ids = created.length ? sql.join(created.map((x) => sql`${x}`), sql`, `) : sql`''`;
    await db.execute(sql`delete from meeting_gate_acceptances where interview_id in (${ids})`);
    await db.execute(sql`delete from interviews where id in (${ids})`);
    await db.delete(schema.users).where(and(eq(schema.users.id, intern.id)));
    await db.delete(schema.employers).where(sql`${schema.employers.id} in (${emp.id}, ${otherEmp.id})`);
  }
});
