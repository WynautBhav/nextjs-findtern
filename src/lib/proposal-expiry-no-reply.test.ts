import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { guaranteeMisses } from "./guarantee.ts";
import { runExpiryCron } from "./proposal-expiry-cron.ts";
import { expiryOf, noReplyExpired, noReplyStamp } from "./proposal-expiry.ts";
import { noReplyDedupeKey, noReplyNotices } from "./proposal-expiry-plan.ts";
import { createSweepThrottle } from "./proposal-expiry-throttle.ts";

const START = "2026-11-26"; // the offer closes at 00:00 IST on it
const BEFORE = new Date("2026-11-25T18:29:59Z"); // 23:59:59 IST on the 25th: still open
const AT = new Date("2026-11-25T18:30:00Z"); // 00:00:00 IST on the 26th
const row = (status: string, over: Record<string, unknown> = {}) => ({ status, hiredAt: null, offerDetails: { startDate: START }, ...over });

test("no reply: sent and interview_scheduled expire exactly at 00:00 IST on the start day", () => {
  for (const status of ["sent", "interview_scheduled"]) {
    assert.equal(noReplyExpired(row(status), BEFORE), false, `${status} 1s before`);
    assert.equal(noReplyExpired(row(status), AT), true, `${status} at the boundary`);
    assert.equal(noReplyExpired(row(status), new Date("2026-12-30T00:00:00Z")), true, `${status} long after`);
  }
});

test("no reply: every other status is never swept, at any time", () => {
  const late = new Date("2027-01-01T00:00:00Z");
  for (const status of ["draft", "accepted", "processing", "hired", "rejected", "withdrawn", "expired", null]) {
    assert.equal(noReplyExpired(row(status as string), late), false, String(status));
  }
  assert.equal(noReplyExpired(row("sent", { hiredAt: new Date("2026-11-20T00:00:00Z") }), late), false, "hired_at set");
});

test("no reply: a missing, blank or malformed start date never expires", () => {
  for (const startDate of [undefined, "", "soon", "2026-13-45x", "26/11/2026"]) {
    assert.equal(noReplyExpired(row("sent", { offerDetails: { startDate } }), AT), false, String(startDate));
  }
  assert.equal(noReplyExpired(row("sent", { offerDetails: null }), AT), false);
});

test("no reply agrees with expiryOf (the one rule every screen reads)", () => {
  for (const status of ["sent", "interview_scheduled", "accepted", "processing", "hired", "withdrawn"]) {
    for (const now of [BEFORE, AT]) {
      const e = expiryOf(row(status), now);
      assert.equal(noReplyExpired(row(status), now), e.reason === "no_reply_past_start", `${status} @ ${now.toISOString()}`);
    }
  }
});

test("noReplyStamp: reason and time always; lapsedAt only for `sent`, so the guarantee count does not change", () => {
  const now = new Date("2026-11-26T04:00:00Z");
  const sent = noReplyStamp("sent", now);
  assert.equal(sent.expiredReason, "no_reply_past_start");
  assert.equal(sent.expiredAt, now.toISOString());
  assert.equal(sent.lapsedAt, now.toISOString());
  const booked = noReplyStamp("interview_scheduled", now);
  assert.equal(booked.expiredReason, "no_reply_past_start");
  assert.equal("lapsedAt" in booked, false, "an interview_scheduled offer never counted as a miss and still does not");
});

test("guarantee: persisting the expiry changes no intern's miss count", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const sentBefore = { status: "sent", offerDetails: { startDate: START } };
  const sentAfter = { status: "expired", offerDetails: { startDate: START, ...noReplyStamp("sent", now) } };
  const bookedBefore = { status: "interview_scheduled", offerDetails: { startDate: START } };
  const bookedAfter = { status: "expired", offerDetails: { startDate: START, ...noReplyStamp("interview_scheduled", now) } };
  assert.equal(guaranteeMisses([sentBefore], now).lapsed, 1);
  assert.equal(guaranteeMisses([sentAfter], now).lapsed, 1);
  assert.equal(guaranteeMisses([bookedBefore], now).total, 0);
  assert.equal(guaranteeMisses([bookedAfter], now).total, 0);
});

test("no-reply notices: employer gets initials only, intern gets no company name; dedupe keys are per side", () => {
  const n = noReplyNotices({ proposalId: "p1", role: "Data Analyst", initials: "A.R.", startDate: START, site: "https://findtern.in", projectTakenDown: false });
  assert.match(n.employer?.message ?? "", /A\.R\./);
  assert.match(n.employer?.message ?? "", /26 Nov 2026/);
  assert.match(n.employer?.email?.cta?.url ?? "", /^https:\/\/findtern\.in\/employer\/proposals$/);
  assert.match(n.intern.message, /Data Analyst/);
  assert.equal(noReplyNotices({ proposalId: "p1", role: "R", initials: "A", startDate: START, site: null, projectTakenDown: true }).employer, null);
  assert.equal(noReplyNotices({ proposalId: "p1", role: "R", initials: "A", startDate: START, site: null, projectTakenDown: false }).employer?.email, undefined);
  assert.equal(noReplyDedupeKey("p1", "employer"), "proposal_expired_no_reply:p1:employer");
  assert.equal(noReplyDedupeKey("p1", "intern"), "proposal_expired_no_reply:p1:intern");
});

/* ── cron route handler ─────────────────────────────────────────────── */

const req = (auth?: string) => new Request("http://x/api/cron/proposal-expiry", { headers: auth ? { authorization: auth } : {} });
const sweepSpy = () => {
  const calls: number[] = [];
  return { calls, sweep: async () => (calls.push(1), { expired: 2, employers: 1, ids: ["a", "b"], notified: 4, noReply: { expired: 3, ids: ["c", "d", "e"], notified: 6 } }) };
};

test("cron: 401 when CRON_SECRET is unset, whatever header is sent; the sweep never runs", async () => {
  const s = sweepSpy();
  for (const h of [undefined, "", "Bearer ", "Bearer undefined", "Bearer x"]) {
    const res = await runExpiryCron(req(h), { secret: undefined, schedulers: undefined, sweep: s.sweep });
    assert.equal(res.status, 401, String(h));
  }
  assert.equal(s.calls.length, 0);
});

test("cron: 401 on a wrong secret; skipped when SCHEDULERS=off; runs and reports both sweeps otherwise", async () => {
  const s = sweepSpy();
  assert.equal((await runExpiryCron(req("Bearer wrong"), { secret: "right", schedulers: undefined, sweep: s.sweep })).status, 401);
  const off = await runExpiryCron(req("Bearer right"), { secret: "right", schedulers: "off", sweep: s.sweep });
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { skipped: true, reason: "SCHEDULERS is off" });
  assert.equal(s.calls.length, 0);
  const ok = await runExpiryCron(req("Bearer right"), { secret: "right", schedulers: "on", sweep: s.sweep });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.expired, 2, "the unpaid result keeps its old top-level shape");
  assert.equal(body.noReply.expired, 3);
  assert.equal(s.calls.length, 1);
  assert.equal((await runExpiryCron(req("Bearer right"), { secret: "right", schedulers: "", sweep: s.sweep })).status, 200, "empty SCHEDULERS runs");
});

test("cron: a failing sweep is a 500 with no detail in the body", async () => {
  const res = await runExpiryCron(req("Bearer right"), { secret: "right", schedulers: undefined, sweep: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"); } });
  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(await res.json()), /hunter2|ECONNREFUSED/);
});

/* ── throttle: at most once per 10 minutes per instance ──────────────── */

test("throttle: one claim per 10 minutes, the next window opens exactly at 10:00", () => {
  let t = 1_000_000;
  const th = createSweepThrottle(10 * 60_000, () => t);
  assert.equal(th.tryClaim(), true);
  assert.equal(th.tryClaim(), false);
  t += 10 * 60_000 - 1;
  assert.equal(th.tryClaim(), false);
  t += 1;
  assert.equal(th.tryClaim(), true);
  assert.equal(th.tryClaim(), false);
});

test("throttle: release() lets a failed claim try again later without waiting a window", () => {
  const t = 5;
  const th = createSweepThrottle(600_000, () => t);
  assert.equal(th.tryClaim(), true);
  th.release();
  assert.equal(th.tryClaim(), true);
});

/* ── structure: the SQL cannot silently match nothing, and is bounded ── */

const db = readFileSync(new URL("./proposal-expiry-db.ts", import.meta.url), "utf8");

test("db sweep: bounded, locked, status re-asserted, and no JS-consumed regex escapes", () => {
  const noReply = db.slice(db.indexOf("export async function expireNoReplyPastStart"));
  assert.ok(noReply.length > 100, "expireNoReplyPastStart exists");
  assert.match(noReply, /limit \$\{MAX_NO_REPLY_ROWS\}/);
  assert.match(noReply, /for update skip locked/);
  assert.match(noReply, /status in \('sent', 'interview_scheduled'\)/);
  assert.match(noReply, /hired_at is null/);
  assert.match(noReply, /startBegun\(today\)/);
  assert.doesNotMatch(db, /\\d/, "a backslash-d inside a template literal is consumed by JS: use [0-9]");
  assert.doesNotMatch(noReply, /lapsedAt['"]?\s*[:,]\s*now/i, "lapsedAt comes from the stamp, not an ad-hoc now()");
});

test("the in-process hourly sweep and the cron route both run the combined sweep", () => {
  const sched = readFileSync(new URL("./schedulers.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/cron/proposal-expiry/route.ts", import.meta.url), "utf8");
  assert.match(sched, /sweepProposalExpiry/);
  assert.match(route, /sweepProposalExpiry/);
  assert.match(route, /runExpiryCron/);
});

test("the opportunistic kick is wired into the employer proposals and dashboard pages and the admin proposal tracker", () => {
  for (const p of ["../app/employer/proposals/page.tsx", "../app/employer/dashboard/page.tsx", "../app/admin/proposal-tracker/page.tsx"]) {
    const src = readFileSync(new URL(p, import.meta.url), "utf8");
    assert.match(src, /kickProposalExpiry\(\)/, p);
  }
});
