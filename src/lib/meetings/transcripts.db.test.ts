import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * Fireflies ingestion + the admin review actions through their REAL handlers against a REAL Postgres, with FakeFireflies (no
 * network, no real Fireflies) and MAIL_MODE=log. Skipped unless MEETINGS_TEST_DATABASE_URL is a scratch DB on 127.0.0.1 with all
 * migrations applied. Never use a shared or production database: the test inserts rows.
 */
const URL_ = process.env.MEETINGS_TEST_DATABASE_URL ?? "";
const host = (() => { try { return new URL(URL_).hostname; } catch { return ""; } })();
const enabled = URL_ !== "" && host === "127.0.0.1";
if (URL_ !== "" && !enabled) throw new Error("MEETINGS_TEST_DATABASE_URL must be on 127.0.0.1");

type Res = { status: number; body: Record<string, unknown> };
type Route = { POST: (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Res> };

test("meeting transcripts, real SQL", { skip: !enabled && "set MEETINGS_TEST_DATABASE_URL (scratch Postgres on 127.0.0.1)" }, async (t) => {
  process.env.DATABASE_URL = URL_;
  process.env.MAIL_MODE = "log";
  process.env.FIREFLIES_WEBHOOK_SECRET = "whsec_test_123";
  delete process.env.PUBLIC_ORIGIN;
  register("./test-support/db-hooks.mjs", import.meta.url);
  const { getDb, schema } = (await import("../db/index.ts")) as typeof import("../db/index.ts");
  const { eq, and, sql } = await import("drizzle-orm");
  const { FakeFireflies, FirefliesError, setFireflies } = await import("./fireflies.ts");
  const { firefliesSignature } = await import("./fireflies-signature.ts");
  const { sweepTranscripts, processTranscript, enqueueTranscript } = await import("./transcripts-db.ts");
  const { loadReviewQueue, loadReviewDetail, pendingMeetingReviewsCount } = await import("./review-load.ts");
  const hook = (await import("../../app/api/webhooks/fireflies/route.ts")) as unknown as Route;
  const review = (await import("../../app/api/admin/meeting-reviews/[id]/route.ts")) as unknown as Route;

  const db = getDb();
  const tag = `tr${Date.now()}`;
  const fake = new FakeFireflies();
  setFireflies(fake);
  let phone = Math.floor(6_000_000_000 + Math.random() * 1_000_000_000);

  const mkUser = async (n: string) => (await db.insert(schema.users).values({ firstName: n, lastName: "Test", email: `${tag}-${n}@example.test`, phoneNumber: String(phone++), password: "x", role: "intern" } as never).returning())[0];
  const mkEmp = async (n: string) => (await db.insert(schema.employers).values({ name: n, companyName: `${n} Co`, companyEmail: `${tag}-${n}@example.test`, phoneNumber: String(phone++), password: "x" }).returning())[0];
  const [intern, intern2] = [await mkUser("Asha"), await mkUser("Bela")];
  const emp = await mkEmp("Eon");
  const mkMeeting = async (over: Record<string, unknown> = {}) => {
    const slot = new Date(Date.now() - 6 * 3_600_000);
    const [row] = await db.insert(schema.interviews).values({ employerId: emp.id, internId: intern.id, status: "scheduled", slot1: slot, selectedSlot: 1, calendarEventId: `ev-${tag}-${phone++}`, meetingLink: `https://meet.google.com/aaa-bbbb-ccc`, ...over } as never).returning();
    return row;
  };
  const line = (i: number, text: string, sp = "Rahul") => ({ index: i, text, start_time: 10 * i, speaker_name: sp });
  const ffFor = (id: string, calId: string | null, sentences: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) =>
    ({ id, title: "Findtern meeting x", calId, meetingLink: null, startedAt: new Date(), organizerEmail: null, durationMin: 20, sourceUrl: `https://app.fireflies.ai/view/${id}`, summary: "An intro call.", botJoined: true, summaryStatus: "processed", lines: sentences.map((s) => ({ i: s.index, t: s.text, s: s.start_time, sp: s.speaker_name })), ...extra });
  const rowOf = async (ffid: string) => (await db.select().from(schema.meetingTranscripts).where(eq(schema.meetingTranscripts.firefliesId, ffid)))[0];
  const post = (body: unknown, sig?: string | null) => {
    const raw = JSON.stringify(body);
    return hook.POST(new Request("https://example.test/api/webhooks/fireflies", { method: "POST", body: raw, headers: sig === null ? {} : { "x-hub-signature": sig ?? firefliesSignature(raw, "whsec_test_123") } }));
  };
  const as = (perms: string[] = ["*"]) => ((globalThis as { __session?: unknown }).__session = { role: "admin", uid: `admin-${tag}`, sid: "s", permissions: perms });
  const act = (id: string, body: unknown) => review.POST(new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  const wait = async (fn: () => Promise<boolean>) => { for (let i = 0; i < 50; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 40)); } return false; };

  try {
    await t.test("webhook: bad or missing signature -> 401 and no row; good signature stores once; replay is a no-op", async () => {
      const ev = { event: "meeting.transcribed", meeting_id: `ff${tag}a`, timestamp: 1 };
      assert.equal((await post(ev, "sha256=" + "0".repeat(64))).status, 401);
      assert.equal((await post(ev, null)).status, 401);
      assert.equal(await rowOf(`ff${tag}a`), undefined);
      fake.add(ffFor(`ff${tag}a`, null, [line(0, "Hello and welcome.")]));
      assert.equal((await post(ev)).status, 200);
      const again = await post(ev);
      assert.equal(again.status, 200);
      assert.equal(again.body.duplicate, true);
      const n = await db.select({ n: sql<number>`count(*)::int` }).from(schema.meetingTranscripts).where(eq(schema.meetingTranscripts.firefliesId, `ff${tag}a`));
      assert.equal(n[0].n, 1);
      assert.equal((await post({ event: "meeting.bot_joined", meeting_id: "zzzzzz" })).body.ignored, true);
      assert.equal((await db.select().from(schema.meetingTranscripts).where(eq(schema.meetingTranscripts.firefliesId, "zzzzzz"))).length, 0);
    });

    await t.test("the post-response processing stores it; no meeting to tie it to -> unmatched bucket, clean, never open", async () => {
      assert.ok(await wait(async () => (await rowOf(`ff${tag}a`))?.status === "ready"));
      const r = await rowOf(`ff${tag}a`);
      assert.equal(r.interviewId, null);
      assert.equal(r.matchNote, "no_match");
      assert.equal(r.reviewState, "clean");
      assert.equal(r.summary, "An intro call.");
      assert.ok(r.textExpiresAt && r.textExpiresAt.getTime() > Date.now() + 89 * 86_400_000);
      const q = await loadReviewQueue("unmatched");
      assert.ok(q.rows.some((x) => x.transcriptId === r.id && x.kind === "unmatched"));
    });

    let tid = "";
    let meeting: Awaited<ReturnType<typeof mkMeeting>>;
    await t.test("a transcript tied to a meeting by calendar event id is flagged and OPENED for an admin; nothing is punished", async () => {
      meeting = await mkMeeting();
      fake.add(ffFor(`ff${tag}b`, `${meeting.calendarEventId}@google.com`, [line(0, "Welcome Asha."), line(1, "Message me on WhatsApp, my number is 98765 43210."), line(2, "I will pay you directly, skip the platform.")]));
      assert.equal((await post({ event: "meeting.transcribed", meeting_id: `ff${tag}b` })).status, 200);
      assert.ok(await wait(async () => (await rowOf(`ff${tag}b`))?.status === "ready"));
      const r = await rowOf(`ff${tag}b`);
      tid = r.id;
      assert.equal(r.interviewId, meeting.id);
      assert.equal(r.matchMethod, "calendar_event");
      assert.equal(r.reviewState, "open");
      assert.ok(r.flagsCount >= 3);
      assert.equal(r.maxSeverity, "high");
      assert.equal((await db.select().from(schema.accountStrikes).where(eq(schema.accountStrikes.userId, intern.id))).length, 0);
      assert.ok((await pendingMeetingReviewsCount()) >= 1);
    });

    await t.test("a second recording of the same meeting stays unmatched (one transcript per meeting)", async () => {
      fake.add(ffFor(`ff${tag}c`, `${meeting.calendarEventId}`, [line(0, "Hello again.")]));
      await enqueueTranscript(`ff${tag}c`);
      await processTranscript(`ff${tag}c`, fake);
      const r = await rowOf(`ff${tag}c`);
      assert.equal(r.interviewId, null);
      assert.equal(r.matchNote, "duplicate_meeting");
    });

    await t.test("fetch errors back off and are recorded; the sweeper never throws; after the last try the row is failed", async () => {
      await enqueueTranscript(`ff${tag}d`);
      fake.failNext(new FirefliesError("Fireflies rate limit", true, 1000, 429));
      assert.equal(await processTranscript(`ff${tag}d`, fake), "retry");
      let r = await rowOf(`ff${tag}d`);
      assert.equal(r.status, "queued");
      assert.equal(r.attempts, 1);
      assert.match(r.lastError ?? "", /rate limit/);
      assert.ok(r.nextAttemptAt.getTime() > Date.now() + 4 * 60_000, "backed off ~5 min");
      assert.equal(await processTranscript(`ff${tag}d`, fake), "skipped", "not due yet");
      fake.failNext(new FirefliesError("Fireflies refused the API key", false, null, 401));
      await db.update(schema.meetingTranscripts).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(schema.meetingTranscripts.firefliesId, `ff${tag}d`));
      assert.equal(await processTranscript(`ff${tag}d`, fake), "failed");
      r = await rowOf(`ff${tag}d`);
      assert.equal(r.status, "failed");
      assert.ok((await loadReviewQueue("no_recording")).rows.some((x) => x.kind === "fetch_failed" && x.transcriptId === r.id));
      fake.failNext(new FirefliesError("down", true));
      const res = await sweepTranscripts({ poll: true, client: fake }); // list fails, nothing throws
      assert.ok(res.purged);
    });

    await t.test("polling fallback queues a transcript whose webhook never arrived and processes it", async () => {
      fake.add(ffFor(`ff${tag}e`, null, [line(0, "Quick sync.")]));
      const res = await sweepTranscripts({ poll: true, client: fake, now: new Date(Date.now() + 1000) });
      assert.ok(res.polled >= 1);
      assert.equal((await rowOf(`ff${tag}e`)).status, "ready");
    });

    await t.test("no recording: a booked meeting that ended 3+ h ago with no transcript row shows to the admin", async () => {
      const ghost = await mkMeeting({ slot1: new Date(Date.now() - 8 * 3_600_000), internId: intern2.id });
      const q = await loadReviewQueue("no_recording");
      assert.ok(q.rows.some((x) => x.kind === "no_recording" && x.meetingId === ghost.id));
      const recent = await mkMeeting({ slot1: new Date(Date.now() - 30 * 60_000), internId: intern2.id });
      assert.ok(!(await loadReviewQueue("no_recording")).rows.some((x) => x.meetingId === recent.id), "still inside the window");
    });

    await t.test("admin detail returns the transcript and writes an audit row", async () => {
      const d = await loadReviewDetail(tid, `admin-${tag}`);
      assert.ok(d && d.lines && d.lines.length === 3);
      assert.equal(d.row.employer?.name.includes("Eon"), true);
      const audits = await db.select().from(schema.adminAuditLog).where(and(eq(schema.adminAuditLog.action, "meeting.transcript_view"), eq(schema.adminAuditLog.targetId, tid)));
      assert.equal(audits.length, 1);
      assert.equal(await loadReviewDetail("not-a-uuid", "a"), null);
    });

    await t.test("Warn: needs a party, reason, note and the right write permission; then one warning strike, review 'warned', audited, idempotent", async () => {
      as(["interns:write"]);
      assert.equal((await act(tid, { action: "warn", note: "ok" })).status, 400, "note too short");
      assert.equal((await act(tid, { action: "warn", note: "Shared a number on the call", reason: "off_platform_contact", expectedViolations: 0 })).status, 400, "no party");
      assert.equal((await act(tid, { action: "warn", party: "employer", note: "Shared a number on the call", reason: "off_platform_contact", expectedViolations: 0 })).status, 403, "employer needs companies:write");
      assert.equal((await act(tid, { action: "warn", party: "intern", note: "Shared a number on the call", reason: "nope", expectedViolations: 0 })).status, 400, "bad reason");
      const ok = await act(tid, { action: "warn", party: "intern", note: "Shared a number on the call", reason: "off_platform_contact", expectedViolations: 0 });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.effect, "warn");
      assert.equal(ok.body.state, "warned");
      const again = await act(tid, { action: "warn", party: "intern", note: "Shared a number on the call", reason: "off_platform_contact", expectedViolations: 0 });
      assert.equal(again.status, 200);
      assert.equal(again.body.already, true);
      const strikes = await db.select().from(schema.accountStrikes).where(eq(schema.accountStrikes.userId, intern.id));
      assert.equal(strikes.length, 1);
      assert.equal(strikes[0].kind, "warning");
      assert.equal(strikes[0].flagId, tid);
      const r = (await db.select().from(schema.meetingTranscripts).where(eq(schema.meetingTranscripts.id, tid)))[0];
      assert.equal(r.reviewState, "warned");
      assert.equal(r.reviewParty, "intern");
      assert.equal(r.strikeId, strikes[0].id);
      const names = (await db.select({ a: schema.adminAuditLog.action }).from(schema.adminAuditLog).where(eq(schema.adminAuditLog.targetId, tid))).map((x) => x.a);
      assert.ok(names.includes("meeting.review_warn"));
      const own = (await db.select({ a: schema.adminAuditLog.action }).from(schema.adminAuditLog).where(eq(schema.adminAuditLog.targetId, intern.id))).map((x) => x.a);
      assert.ok(own.includes("account.warn"), "the strike service's own audit");
    });

    await t.test("Freeze (employer, with companies:write) goes through the strike service and holds the account; a second click changes nothing", async () => {
      const m2 = await mkMeeting({ internId: intern2.id });
      fake.add(ffFor(`ff${tag}f`, `${m2.calendarEventId}`, [line(0, "Send it to my gpay number please.")]));
      await enqueueTranscript(`ff${tag}f`);
      await processTranscript(`ff${tag}f`, fake);
      const r = await rowOf(`ff${tag}f`);
      assert.equal(r.reviewState, "open");
      as(["*"]);
      const body = { action: "freeze", party: "employer", note: "Asked to be paid outside the platform", reason: "payment_outside", expectedViolations: 0 };
      const bad = await act(r.id, { ...body, reason: "off_platform_contact", expectedViolations: 5 });
      assert.equal(bad.status, 409, "stale standing");
      const ok = await act(r.id, body);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.state, "frozen");
      assert.equal((await act(r.id, body)).body.already, true);
      const e = (await db.select().from(schema.employers).where(eq(schema.employers.id, emp.id)))[0];
      assert.ok(e.frozenAt);
      assert.equal((await db.select().from(schema.accountStrikes).where(eq(schema.accountStrikes.userId, emp.id))).length, 1);
    });

    await t.test("Dismiss: note only, nobody is told, no strike; repeat is a no-op", async () => {
      const m3 = await mkMeeting({ internId: intern2.id });
      fake.add(ffFor(`ff${tag}g`, `${m3.calendarEventId}`, [line(0, "Email me at asha at gmail dot com")]));
      await enqueueTranscript(`ff${tag}g`);
      await processTranscript(`ff${tag}g`, fake);
      const r = await rowOf(`ff${tag}g`);
      as(["*"]);
      const ok = await act(r.id, { action: "dismiss", note: "Fine, her own portfolio mail" });
      assert.equal(ok.body.state, "dismissed");
      assert.equal((await act(r.id, { action: "dismiss", note: "Fine, her own portfolio mail" })).body.already, true);
      assert.equal((await act(r.id, { action: "warn", party: "intern", note: "after the fact", reason: "off_platform_contact", expectedViolations: 0 })).body.already, true, "closed reviews cannot be actioned");
      assert.equal((await db.select().from(schema.accountStrikes).where(eq(schema.accountStrikes.userId, intern2.id))).length, 0);
      assert.equal((await db.select().from(schema.adminAuditLog).where(and(eq(schema.adminAuditLog.action, "meeting.review_dismiss"), eq(schema.adminAuditLog.targetId, r.id)))).length, 1);
    });

    await t.test("retention: the sweeper deletes text and summary after 90 days, flags after 1 year, keeps minimal metadata", async () => {
      const before = await rowOf(`ff${tag}b`);
      assert.ok(before.transcript && before.flags);
      const at90 = new Date(Date.now() + 91 * 86_400_000);
      const r1 = await sweepTranscripts({ now: at90, client: fake });
      assert.ok(r1.purged && r1.purged.text >= 1);
      let r = await rowOf(`ff${tag}b`);
      assert.equal(r.transcript, null);
      assert.equal(r.summary, null);
      assert.ok(r.flags && r.flags.length >= 3, "evidence kept until 1 year");
      assert.ok(r.textPurgedAt);
      const d = await loadReviewDetail(tid, `admin-${tag}`);
      assert.equal(d?.lines, null);
      assert.equal(d?.row.textPurged, true);
      assert.deepEqual((await sweepTranscripts({ now: at90, client: fake })).purged, { text: 0, evidence: 0 }, "idempotent");
      await sweepTranscripts({ now: new Date(Date.now() + 366 * 86_400_000), client: fake });
      r = await rowOf(`ff${tag}b`);
      assert.equal(r.flags, null);
      assert.ok(r.evidencePurgedAt);
      assert.equal(r.reviewState, "warned", "outcome stays");
      assert.ok(r.flagsCount >= 3, "count stays as metadata");
    });
  } finally {
    setFireflies(null);
  }
});
