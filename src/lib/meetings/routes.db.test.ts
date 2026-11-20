import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * The meeting routes through their REAL handlers against a REAL Postgres, with a FakeCalendar for Google and MAIL_MODE=log
 * (no mail, no Google, no network). Skipped unless MEETINGS_TEST_DATABASE_URL points at a scratch database on 127.0.0.1
 * that has all migrations applied (npm run db:migrate). Never use a shared or production database: the test inserts rows.
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

type Res = { status: number; body: Record<string, unknown> };
type Route = { POST: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Res> };

test("meeting routes, real SQL", { skip: !enabled && "set MEETINGS_TEST_DATABASE_URL (scratch Postgres on 127.0.0.1)" }, async (t) => {
  process.env.DATABASE_URL = URL_;
  process.env.MAIL_MODE = "log";
  delete process.env.PUBLIC_ORIGIN;
  register("./test-support/db-hooks.mjs", import.meta.url);
  const { getDb, schema } = (await import("../db/index.ts")) as typeof import("../db/index.ts");
  const { eq, sql } = await import("drizzle-orm");
  const { FakeCalendar, setCalendar } = await import("./calendar.ts");
  const cal = new FakeCalendar();
  setCalendar(cal);
  const load = (p: string) => import(p) as unknown as Promise<Route>;
  const selectSlot = await load("../../app/api/interviews/[id]/select-slot/route.ts");
  const counter = await load("../../app/api/interviews/[id]/counter/route.ts");
  const cancel = await load("../../app/api/interviews/[id]/cancel/route.ts");
  const reschedule = await load("../../app/api/interviews/[id]/reschedule/route.ts");
  const create = await load("../../app/api/employer/[id]/interviews/route.ts");
  const requests = await load("../../app/api/intern/meeting-requests/route.ts");

  const db = getDb();
  const tag = `mt${Date.now()}`;
  let phone = Math.floor(7_000_000_000 + Math.random() * 1_000_000_000);
  // A pool candidate: live, scored, interviewed, approved, fee paid (the same rules the routes check).
  const mkUser = async (n: string) => {
    const [u] = await db.insert(schema.users).values({ firstName: n, lastName: "Test", email: `${tag}-${n}@example.test`, phoneNumber: String(phone++), password: "x", role: "intern", profileVisibility: "live" } as never).returning();
    await db.insert(schema.internOnboarding).values({ userId: u.id, extraData: { findternScore: 7, ratings: { interview: 7 }, approvalStatus: "Approved", payment: { isPaid: true } } } as never);
    return u;
  };
  const mkEmp = async (n: string) => (await db.insert(schema.employers).values({ name: n, companyName: `${n} Co`, companyEmail: `${tag}-${n}@example.test`, phoneNumber: String(phone++), password: "x" }).returning())[0];
  const [i1, i2, i3] = [await mkUser("Asha"), await mkUser("Bela"), await mkUser("Chitra")];
  const [e1, e2] = [await mkEmp("Eon"), await mkEmp("Fyn")];
  const [p1] = await db.insert(schema.projects).values({ employerId: e1.id, projectName: "Proj", status: "published", timezone: "Asia/Kolkata" } as never).returning();

  const [p2] = await db.insert(schema.projects).values({ employerId: e2.id, projectName: "Proj2", status: "published", timezone: "Asia/Kolkata" } as never).returning();
  const projectOf = (e: typeof e1) => (e.id === e1.id ? p1 : p2);

  const as = (role: "employer" | "intern", uid: string) => ((globalThis as { __session?: unknown }).__session = { role, uid, sid: "s" });
  const req = (body: unknown) => new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) });
  const call = (route: Route, id: string, body: unknown) => route.POST(req(body), { params: Promise.resolve({ id }) });
  const wall = (hoursAhead: number) => {
    const d = new Date(Date.now() + hoursAhead * 3_600_000);
    d.setUTCMinutes(Math.ceil(d.getUTCMinutes() / 15) * 15, 0, 0);
    // IST wall-clock: the project and interns are both in Asia/Kolkata in this test
    return new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16);
  };
  const row = async (id: string) => (await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)))[0];
  const offer = async (employer = e1, intern = i1, slots = [wall(30), wall(54), wall(78)]) => {
    as("employer", employer.id);
    const r = await create.POST(req({ internId: intern.id, projectId: projectOf(employer).id, slot1: slots[0], slot2: slots[1], slot3: slots[2], timezone: "Asia/Kolkata" }), { params: Promise.resolve({ id: employer.id }) });
    return r;
  };
  // an intern the employer can see: shortlist row stands in for the "relationship"
  const relate = async (e: typeof e1, i: typeof i1) => db.insert(schema.employerCartItems).values({ employerId: e.id, projectId: projectOf(e).id, internId: i.id, listType: "cart" } as never);

  try {
    await t.test("employer offers 1-3 times; the row records who offered, the round and respond-by", async () => {
      await relate(e1, i1);
      const r = await offer();
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const iv = await row((r.body.interview as { id: string }).id);
      assert.equal(iv.proposedBy, "employer");
      assert.equal(iv.round, 1);
      assert.ok(iv.respondBy && iv.gateToken);
      // a second open meeting for the pair is refused
      assert.equal((await offer()).status, 409);
      // a single slot is fine for another pair
      await relate(e1, i2);
      as("employer", e1.id);
      const one = await create.POST(req({ internId: i2.id, projectId: p1.id, slot1: wall(30), timezone: "Asia/Kolkata" }), { params: Promise.resolve({ id: e1.id }) });
      assert.equal(one.status, 201, JSON.stringify(one.body));
    });

    await t.test("the proposer cannot pick its own offer; the other side books it, Meet is made once, gate token is set", async () => {
      const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i1.id));
      as("employer", e1.id);
      assert.equal((await call(selectSlot, iv.id, { slot: 1 })).status, 403);
      as("intern", i1.id);
      const ok = await call(selectSlot, iv.id, { slot: 2 });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const booked = await row(iv.id);
      assert.equal(booked.status, "scheduled");
      assert.equal(booked.selectedSlot, 2);
      assert.ok(booked.meetingLink?.startsWith("https://meet.google.com/fake-"));
      assert.equal(cal.events.size, 1);
      assert.deepEqual([...cal.events.values()][0].attendees, []);
      // a double pick is a 409 and creates no second event
      assert.equal((await call(selectSlot, iv.id, { slot: 3 })).status, 409);
      assert.equal(cal.events.size, 1);
      // nothing sent contains the raw Meet link
      const notes = await db.select().from(schema.notifications).where(sql`${schema.notifications.data}->>'interviewId' = ${iv.id}`);
      assert.ok(notes.length >= 2);
      assert.ok(!JSON.stringify(notes).includes("meet.google.com"), "raw Meet url leaked into a notification");
    });

    await t.test("conflict: a pick overlapping either side's confirmed meeting is a 409, a different slot works", async () => {
      // i1 is booked at slot 2 (+54h) with e1. e2 offers i1 a time at the same instant and a later one.
      const [booked] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i1.id));
      const clash = wall(54);
      const r = await offer(e2, i1, [clash, wall(100), wall(101)]);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const id = (r.body.interview as { id: string }).id;
      as("intern", i1.id);
      const bad = await call(selectSlot, id, { slot: 1 });
      assert.equal(bad.status, 409);
      assert.equal(bad.body.code, "conflict");
      assert.equal((await row(id)).status, "pending");
      assert.equal((await call(selectSlot, id, { slot: 2 })).status, 200);
      void booked;
    });

    await t.test("counter-offer: intern proposes own times, employer picks; rounds are capped; an own offer cannot be countered", async () => {
      await relate(e1, i3);
      const first = await offer(e1, i3);
      const id = (first.body.interview as { id: string }).id;
      as("employer", e1.id);
      assert.equal((await call(counter, id, { slots: [wall(40)] })).status, 403, "proposer cannot counter itself");
      as("intern", i3.id);
      const c1 = await call(counter, id, { slots: [wall(40), wall(41)] });
      assert.equal(c1.status, 200, JSON.stringify(c1.body));
      let cur = await row(id);
      assert.equal(cur.proposedBy, "intern");
      assert.equal(cur.round, 2);
      assert.equal(cur.slot3, null);
      assert.equal((await call(selectSlot, id, { slot: 1 })).status, 403, "intern cannot pick its own counter");
      as("employer", e1.id);
      const c2 = await call(counter, id, { slots: [wall(60)] });
      assert.equal(c2.status, 200);
      cur = await row(id);
      assert.equal(cur.round, 3);
      assert.equal(cur.proposedBy, "employer");
      // round 3 is the last: the intern may not counter again, only pick (or cancel)
      as("intern", i3.id);
      const c3 = await call(counter, id, { slots: [wall(70)] });
      assert.equal(c3.status, 409);
      assert.equal(c3.body.code, "max_rounds");
      assert.equal((await call(selectSlot, id, { slot: 1 })).status, 200);
      assert.equal((await row(id)).status, "scheduled");
    });

    await t.test("cancel needs a reason, records who, deletes the Meet event, and a second cancel is refused", async () => {
      const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i1.id)).limit(1);
      const before = cal.events.size;
      as("intern", i1.id);
      assert.equal((await call(cancel, iv.id, { reason: " " })).status, 400);
      const ok = await call(cancel, iv.id, { reason: "Exam clash" });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const c = await row(iv.id);
      assert.equal(c.status, "cancelled");
      assert.equal(c.cancelledBy, "intern");
      assert.equal(c.cancelReason, "Exam clash");
      assert.equal(c.meetingLink, null);
      assert.equal(cal.events.size, before - 1);
      assert.equal((await call(cancel, iv.id, { reason: "again" })).status, 409);
    });

    await t.test("reschedule by the intern (allowed now) re-opens the meeting for the employer to pick", async () => {
      const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i3.id)).limit(1);
      as("intern", i3.id);
      const r = await call(reschedule, iv.id, { slots: [wall(120), wall(121)] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const cur = await row(iv.id);
      assert.equal(cur.status, "pending");
      assert.equal(cur.proposedBy, "intern");
      assert.equal(cur.selectedSlot, null);
      assert.equal(cur.calendarEventId, null);
    });

    await t.test("an intern can only ask for a meeting inside a relationship; none, no meeting (404)", async () => {
      as("intern", i2.id);
      // i2 has an interview with e1 (relationship) but Fyn (e2) never touched i2
      const none = await requests.POST(req({ interviewId: "00000000-0000-0000-0000-000000000000", slots: [wall(130)] }), { params: Promise.resolve({}) });
      assert.equal(none.status, 404);
      const [mine] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i2.id)).limit(1);
      await db.update(schema.interviews).set({ status: "cancelled" }).where(eq(schema.interviews.id, mine.id));
      const ok = await requests.POST(req({ interviewId: mine.id, slots: [wall(130), wall(131)] }), { params: Promise.resolve({}) });
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      const made = await row((ok.body.interview as { id: string }).id);
      assert.equal(made.proposedBy, "intern");
      assert.equal(made.employerId, e1.id);
      // another intern cannot hang a request on i2's interview
      as("intern", i3.id);
      const steal = await requests.POST(req({ interviewId: mine.id, slots: [wall(140)] }), { params: Promise.resolve({}) });
      assert.equal(steal.status, 404);
    });

    await t.test("a lapsed offer (respond_by passed) cannot be picked or countered", async () => {
      await relate(e2, i3);
      const r = await offer(e2, i3, [wall(200), wall(201), wall(202)]);
      const id = (r.body.interview as { id: string }).id;
      await db.update(schema.interviews).set({ respondBy: new Date(Date.now() - 60_000) }).where(eq(schema.interviews.id, id));
      as("intern", i3.id);
      assert.equal((await call(selectSlot, id, { slot: 1 })).body.code, "lapsed");
      assert.equal((await call(counter, id, { slots: [wall(100)] })).body.code, "lapsed");
    });
  } finally {
    const ids = [i1, i2, i3].map((u) => u.id);
    await db.execute(sql`delete from notifications where recipient_id in (${sql.join([...ids, e1.id, e2.id].map((x) => sql`${x}`), sql`, `)})`);
    await db.execute(sql`delete from interviews where intern_id in (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`);
    await db.execute(sql`delete from employer_cart_items where employer_id in (${e1.id}, ${e2.id})`);
    await db.execute(sql`delete from projects where id in (${p1.id}, ${p2.id})`);
    await db.execute(sql`delete from intern_onboarding where user_id in (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`);
    await db.delete(schema.users).where(sql`${schema.users.id} in (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`);
    await db.delete(schema.employers).where(sql`${schema.employers.id} in (${e1.id}, ${e2.id})`);
    setCalendar(null);
  }
});
