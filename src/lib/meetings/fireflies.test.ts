import assert from "node:assert/strict";
import test from "node:test";

import { planFailure, backoffMs, MAX_ATTEMPTS, readWebhook } from "./backoff.ts";
import { classifyError, FakeFireflies, FirefliesError, HttpFireflies, normalizeTranscript, type FetchLike } from "./fireflies.ts";

// Shape follows docs.fireflies.ai/schema/transcript (fields we read: id, title, dateString, duration, cal_id, meeting_link, sentences, summary, meeting_info).
const RAW = {
  id: "ASxwZxCstx", title: "Findtern meeting abcdef12", organizer_email: "ops@example.test", transcript_url: "https://app.fireflies.ai/view/ASxwZxCstx",
  duration: 31.4, dateString: "2026-11-21T10:02:00.000Z", cal_id: "evabc@google.com", meeting_link: "https://meet.google.com/abc-defg-hij",
  sentences: [
    { index: 0, text: "Hi Asha, thanks for joining.", raw_text: "hi asha thanks for joining", start_time: 2.5, end_time: 5, speaker_name: "Rahul", speaker_id: 1 },
    { index: 1, text: "", raw_text: "", start_time: 6, speaker_name: "Rahul" },
    { index: 2, text: "Message me on WhatsApp.", start_time: "61.2", speaker_name: null },
  ],
  summary: { overview: "A short intro call.", gist: "intro" },
  meeting_info: { fred_joined: true, silent_meeting: false, summary_status: "processed" },
};

test("normalizeTranscript maps the documented fields and drops empty sentences", () => {
  const t = normalizeTranscript(RAW)!;
  assert.equal(t.id, "ASxwZxCstx");
  assert.equal(t.calId, "evabc@google.com");
  assert.equal(t.durationMin, 31);
  assert.equal(t.startedAt?.toISOString(), "2026-11-21T10:02:00.000Z");
  assert.deepEqual(t.lines, [{ i: 0, t: "Hi Asha, thanks for joining.", s: 2.5, sp: "Rahul" }, { i: 2, t: "Message me on WhatsApp.", s: 61.2, sp: null }]);
  assert.equal(t.summary, "A short intro call.");
  assert.equal(t.botJoined, true);
  assert.equal(normalizeTranscript({}), null);
});

test("error classification: rate limit and 5xx retry, bad key and invalid arguments do not, object_not_found is null", () => {
  assert.equal(classifyError(200, [{ code: "object_not_found" }], null), "not_found");
  const rl = classifyError(429, [{ extensions: { code: "too_many_requests" } }], "30") as FirefliesError;
  assert.equal(rl.retryable, true);
  assert.equal(rl.retryAfterMs, 30_000);
  assert.equal((classifyError(503, null, null) as FirefliesError).retryable, true);
  assert.equal((classifyError(401, [{ code: "forbidden" }], null) as FirefliesError).retryable, false);
  assert.equal((classifyError(400, [{ code: "invalid_arguments" }], null) as FirefliesError).retryable, false);
});

test("backoff doubles from 5 min, caps at 6 h, honours Retry-After, and ends in failed", () => {
  assert.deepEqual([1, 2, 3, 4].map((a) => backoffMs(a) / 60_000), [5, 10, 20, 40]);
  assert.equal(backoffMs(20), 6 * 3_600_000);
  assert.equal(backoffMs(1, 3_600_000), 3_600_000);
  const now = new Date("2026-11-21T00:00:00Z");
  assert.equal(planFailure(1, true, null, now).status, "queued");
  assert.equal(planFailure(MAX_ATTEMPTS, true, null, now).status, "failed");
  assert.equal(planFailure(1, false, null, now).status, "failed");
});

test("readWebhook accepts the documented events and nothing else", () => {
  assert.deepEqual(readWebhook({ event: "meeting.transcribed", meeting_id: "ASxwZxCstx", timestamp: 1 }), { kind: "fetch", id: "ASxwZxCstx" });
  assert.deepEqual(readWebhook({ event: "meeting.summarized", meeting_id: "ASxwZxCstx" }), { kind: "resummarize", id: "ASxwZxCstx" });
  assert.deepEqual(readWebhook({ event: "meeting.bot_joined", meeting_id: "ASxwZxCstx" }), { kind: "ignore" });
  assert.deepEqual(readWebhook({ event: "meeting.transcribed", meeting_id: "x; drop table" }), { kind: "ignore" });
  assert.deepEqual(readWebhook(null), { kind: "ignore" });
});

test("HttpFireflies sends the bearer key to the documented endpoint, never puts it in an error, and maps responses", async () => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const mk = (status: number, json: unknown, headers: Record<string, string> = {}): FetchLike => async (url, init) => {
    seen.push({ url, headers: init.headers, body: init.body });
    return { status, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, json: async () => json };
  };
  const ok = await new HttpFireflies("KEY-SECRET-123", mk(200, { data: { transcript: RAW } })).getTranscript("ASxwZxCstx");
  assert.equal(ok?.id, "ASxwZxCstx");
  assert.equal(seen[0].url, "https://api.fireflies.ai/graphql");
  assert.equal(seen[0].headers.authorization, "Bearer KEY-SECRET-123");
  assert.equal(JSON.parse(seen[0].body).variables.id, "ASxwZxCstx");
  assert.equal(await new HttpFireflies("k", mk(200, { errors: [{ extensions: { code: "object_not_found" } }] })).getTranscript("nope"), null);
  await assert.rejects(new HttpFireflies("KEY-SECRET-123", mk(429, { errors: [{ code: "too_many_requests" }] }, { "retry-after": "12" })).getTranscript("a"), (e: FirefliesError) => e.retryable && e.retryAfterMs === 12_000 && !e.message.includes("KEY-SECRET"));
  const boom: FetchLike = async () => { throw new Error("socket hang up with Bearer KEY-SECRET-123"); };
  await assert.rejects(new HttpFireflies("KEY-SECRET-123", boom).getTranscript("a"), (e: FirefliesError) => e.retryable && !e.message.includes("KEY-SECRET"));
});

test("FakeFireflies serves recorded transcripts and can be told to fail", async () => {
  const f = new FakeFireflies().add(normalizeTranscript(RAW)!);
  assert.equal((await f.getTranscript("ASxwZxCstx"))?.title, "Findtern meeting abcdef12");
  assert.equal(await f.getTranscript("other"), null);
  f.failNext(new FirefliesError("down", true));
  await assert.rejects(f.getTranscript("ASxwZxCstx"));
  assert.equal((await f.listRecent(new Date("2026-01-01"), 10)).length, 1);
});
