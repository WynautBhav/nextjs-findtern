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
  const askReschedule = await load("../../app/api/interviews/[id]/request-reschedule/route.ts");
  const cancel = await load("../../app/api/interviews/[id]/cancel/route.ts");
  const reschedule = await load("../../app/api/interviews/[id]/reschedule/route.ts");
  const create = await load("../../app/api/employer/[id]/interviews/route.ts");

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
    await t.test("employer offers exactly 3 times (1, 2, duplicate or past are refused); the row records who offered, the round and respond-by", async () => {
      await relate(e1, i1);
      const r = await offer();
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const iv = await row((r.body.interview as { id: string }).id);
      assert.equal(iv.proposedBy, "employer");
      assert.equal(iv.round, 1);
      assert.ok(iv.respondBy && iv.gateToken);
      // a second open meeting for the pair is refused
      assert.equal((await offer()).status, 409);
      // exactly three: one or two (or a repeat, or a past time) is a 400 and creates nothing
      await relate(e1, i2);
      as("employer", e1.id);
      const body = (extra: Record<string, string>) => req({ internId: i2.id, projectId: p1.id, timezone: "Asia/Kolkata", ...extra });
      const ctx = { params: Promise.resolve({ id: e1.id }) };
      assert.equal((await create.POST(body({ slot1: wall(30) }), ctx)).status, 400);
      assert.equal((await create.POST(body({ slot1: wall(30), slot2: wall(31) }), ctx)).status, 400);
      assert.equal((await create.POST(body({ slot1: wall(30), slot2: wall(30), slot3: wall(32) }), ctx)).status, 400);
      assert.equal((await create.POST(body({ slot1: wall(-5), slot2: wall(31), slot3: wall(32) }), ctx)).status, 400);
      assert.equal((await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i2.id))).length, 0);
      // an intern cannot book a meeting at all
      as("intern", i2.id);
      const byIntern = await create.POST(body({ slot1: wall(30), slot2: wall(31), slot3: wall(32) }), ctx);
      assert.ok([401, 403, 404].includes(byIntern.status), String(byIntern.status));
      assert.equal((await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i2.id))).length, 0);
      // three slots work for another pair
      as("employer", e1.id);
      const three = await create.POST(body({ slot1: wall(30), slot2: wall(31), slot3: wall(32) }), ctx);
      assert.equal(three.status, 201, JSON.stringify(three.body));
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

    await t.test("conflict: an offer overlapping either side's confirmed meeting is refused (409); a pick that became a clash is a 409, another slot works", async () => {
      // i1 is booked at slot 2 (+54h) with e1. e2 cannot offer i1 that time (the intern is busy), e1 cannot offer anyone else it (the employer is busy).
      const clash = wall(54);
      assert.equal((await offer(e2, i1, [clash, wall(100), wall(101)])).body.code, "conflict");
      await relate(e1, i3);
      assert.equal((await offer(e1, i3, [clash, wall(100), wall(101)])).body.code, "conflict");
      // a clean offer goes through; then i1 gets booked elsewhere at one of its times before replying
      const r = await offer(e2, i1, [wall(100), wall(103), wall(106)]);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const id = (r.body.interview as { id: string }).id;
      const first = await row(id);
      const [other] = await db.insert(schema.interviews).values({ employerId: e1.id, internId: i1.id, status: "scheduled", slot1: first.slot1, selectedSlot: 1, proposedBy: "employer", round: 1, timezone: "Asia/Kolkata" } as never).returning();
      as("intern", i1.id);
      const bad = await call(selectSlot, id, { slot: 1 });
      assert.equal(bad.status, 409);
      assert.equal(bad.body.code, "conflict");
      assert.equal((await row(id)).status, "pending");
      assert.equal((await call(selectSlot, id, { slot: 2 })).status, 200);
      await db.delete(schema.interviews).where(eq(schema.interviews.id, other.id));
    });

    await t.test("nobody can reschedule (403, nothing changes): not the intern, not the employer; the intern picks from the first times", async () => {
      const first = await offer(e1, i3, [wall(140), wall(141), wall(142)]);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      const id = (first.body.interview as { id: string }).id;
      // the intern has no way to put times on a meeting
      as("intern", i3.id);
      const own = await call(reschedule, id, { slots: [wall(40), wall(41), wall(42)] });
      assert.ok([401, 403].includes(own.status), `stub guard says 401 for a wrong role, the real one 403: got ${own.status}`);
      assert.deepEqual([(await row(id)).round, (await row(id)).proposedBy], [1, "employer"]);
      // ...and no way to ask to reschedule: refused explicitly, the meeting is untouched, the employer is not notified
      for (const body of [{}, { reason: "Exam that week", slots: [wall(40)] }]) {
        const ask = await call(askReschedule, id, body);
        assert.equal(ask.status, 403, JSON.stringify(ask.body));
        assert.equal(ask.body.code, "intern_reschedule_removed");
      }
      let cur = await row(id);
      assert.deepEqual([cur.status, cur.proposedBy, cur.round], ["pending", "employer", 1]);
      assert.ok(cur.slot1 && cur.slot2 && cur.slot3, "the company's three times are still there");
      const notes = await db.select().from(schema.notifications).where(sql`${schema.notifications.recipientId} = ${e1.id} and ${schema.notifications.data}->>'interviewId' = ${id} and ${schema.notifications.type} = 'meeting_reschedule_requested'`);
      assert.equal(notes.length, 0, "no reschedule notification");
      // ...and the employer can't reschedule either (owner 24 Nov 2026): refused, nothing changes; the intern picks from the first times
      as("employer", e1.id);
      const re = await call(reschedule, id, { slots: [wall(40), wall(41), wall(42)] });
      assert.equal(re.status, 403, JSON.stringify(re.body));
      assert.equal(re.body.code, "employer_reschedule_removed");
      cur = await row(id);
      assert.deepEqual([cur.status, cur.proposedBy, cur.round], ["pending", "employer", 1]);
      as("intern", i3.id);
      assert.equal((await call(selectSlot, id, { slot: 3 })).status, 200);
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

    await t.test("a booked meeting: the intern's reschedule request is refused, it stays booked with its Meet event; the intern can still cancel", async () => {
      const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.internId, i3.id)).limit(1);
      assert.equal(iv.status, "scheduled");
      const before = cal.events.size;
      as("intern", i3.id);
      const r = await call(askReschedule, iv.id, {});
      assert.equal(r.status, 403, JSON.stringify(r.body));
      const cur = await row(iv.id);
      assert.equal(cur.status, "scheduled");
      assert.equal(cur.selectedSlot, iv.selectedSlot);
      assert.equal(cur.calendarEventId, iv.calendarEventId);
      assert.equal(cal.events.size, before);
      assert.equal((await call(cancel, iv.id, { reason: "Not available any more" })).status, 200);
    });

    await t.test("a meeting an intern proposed under the old rules still shows, can be picked by the employer, or cancelled", async () => {
      await relate(e2, i2);
      const mk = async () =>
        (await db.insert(schema.interviews).values({ employerId: e2.id, internId: i2.id, projectId: p2.id, status: "pending", proposedBy: "intern", round: 1, slot1: new Date(Date.now() + 90 * 3_600_000), respondBy: new Date(Date.now() + 88 * 3_600_000), timezone: "Asia/Kolkata" } as never).returning())[0];
      const legacy = await mk();
      as("employer", e2.id);
      const pick = await call(selectSlot, legacy.id, { slot: 1 });
      assert.equal(pick.status, 200, JSON.stringify(pick.body));
      assert.equal((await row(legacy.id)).status, "scheduled");
      as("intern", i2.id);
      assert.equal((await call(cancel, legacy.id, { reason: "Changed my mind" })).status, 200);
      const second = await mk();
      assert.equal((await call(cancel, second.id, { reason: "Changed my mind" })).status, 200);
      assert.equal((await row(second.id)).status, "cancelled");
    });

    await t.test("a lapsed offer (respond_by passed) cannot be picked", async () => {
      await relate(e2, i3);
      const r = await offer(e2, i3, [wall(200), wall(201), wall(202)]);
      const id = (r.body.interview as { id: string }).id;
      await db.update(schema.interviews).set({ respondBy: new Date(Date.now() - 60_000) }).where(eq(schema.interviews.id, id));
      as("intern", i3.id);
      assert.equal((await call(selectSlot, id, { slot: 1 })).body.code, "lapsed");
      assert.equal((await call(askReschedule, id, {})).status, 403, "a lapsed offer cannot be turned into a request either");
    });

    await t.test("an expired, lapsed or open meeting is never re-offered: the employer's reschedule is refused for each (403), nothing changes", async () => {
      const lapsed = (await db.select().from(schema.interviews).where(sql`${schema.interviews.employerId} = ${e2.id} and ${schema.interviews.internId} = ${i3.id}`))[0];
      const fresh = await offer(e2, i3, [wall(300), wall(301), wall(302)]);
      assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
      const openId = (fresh.body.interview as { id: string }).id;
      await db.update(schema.interviews).set({ status: "expired" }).where(eq(schema.interviews.id, lapsed.id));
      as("employer", e2.id);
      for (const id of [lapsed.id, openId]) {
        const before = await row(id);
        const r = await call(reschedule, id, { slots: [wall(310), wall(311), wall(312)] });
        assert.equal(r.status, 403, JSON.stringify(r.body));
        assert.equal(r.body.code, "employer_reschedule_removed");
        assert.deepEqual([(await row(id)).status, (await row(id)).round], [before.status, before.round]);
      }
    });

    await t.test("a cancel reason loses contact details and names before the hire: stored row, other side's alert", async () => {
      const [intern] = [await mkUser("Gita")];
      try {
        await relate(e2, intern);
        const made = await offer(e2, intern);
        assert.equal(made.status, 201, JSON.stringify(made.body));
        const id = (made.body.interview as { id: string }).id;
        as("intern", intern.id);
        const raw = `Gita Test, call 98290 12345, ${tag}-Gita@example.test. Exam clash on Monday.`;
        assert.equal((await call(cancel, id, { reason: raw })).status, 200);
        const stored = (await row(id)).cancelReason ?? "";
        assert.doesNotMatch(stored, /Gita|98290|example\.test/);
        assert.match(stored, /Exam clash on Monday/);
        const [alert] = await db.select().from(schema.notifications).where(sql`${schema.notifications.recipientId} = ${e2.id} and ${schema.notifications.type} = 'meeting_cancelled' and ${schema.notifications.data}->>'interviewId' = ${id}`);
        assert.ok(alert, "the employer got an alert");
        assert.doesNotMatch(alert.message, /Gita|98290|example\.test/);
      } finally {
        await db.execute(sql`delete from notifications where recipient_id in (${intern.id}, ${e2.id})`);
        await db.execute(sql`delete from interviews where intern_id = ${intern.id}`);
        await db.execute(sql`delete from employer_cart_items where intern_id = ${intern.id}`);
        await db.execute(sql`delete from intern_onboarding where user_id = ${intern.id}`);
        await db.delete(schema.users).where(sql`${schema.users.id} = ${intern.id}`);
      }
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
