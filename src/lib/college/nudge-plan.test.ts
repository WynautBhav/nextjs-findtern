import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NUDGE_COOLDOWN_MS, nudgeGlow, nudgeHref, planNudge, tallyNudges } from "./nudge-plan.ts";
import { internNotificationHref } from "../notification-href.ts";

const now = new Date("2026-11-18T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const link = (path: string) => `https://findtern.in${path}`;
const noLink = () => null;
const base = { collegeName: "JKLU", now, link };

test("online nudge emails the student with subject, one line and the dashboard CTA", () => {
  const plan = planNudge({ ...base, kind: "online", lastSameKindAt: null });
  assert.equal(plan.cooldown, false);
  if (plan.cooldown) return;
  assert.equal(plan.copy.title, "JKLU placement drive is live");
  assert.ok(plan.email);
  assert.equal(plan.email.subject, "JKLU placement drive is live");
  assert.equal(plan.email.lines.length, 1);
  assert.deepEqual(plan.email.cta, { label: "Open Findtern", url: "https://findtern.in/intern/dashboard?nudge=online" });
});

test("a second online nudge 11 minutes later emails again", () => {
  const plan = planNudge({ ...base, kind: "online", lastSameKindAt: ago(NUDGE_COOLDOWN_MS + 60_000) });
  assert.equal(plan.cooldown, false);
  if (plan.cooldown) return;
  assert.ok(plan.email);
  assert.equal(plan.email.cta?.url, "https://findtern.in/intern/dashboard?nudge=online");
});

test("online nudge is blocked inside the 10-minute cooldown", () => {
  assert.equal(planNudge({ ...base, kind: "online", lastSameKindAt: ago(NUDGE_COOLDOWN_MS - 1000) }).cooldown, true);
});

test("offer and interview email 11 minutes after the last one and keep the 10-minute cooldown", () => {
  for (const kind of ["offer", "interview"] as const) {
    const first = planNudge({ ...base, kind, lastSameKindAt: ago(NUDGE_COOLDOWN_MS + 60_000) });
    assert.equal(first.cooldown, false);
    if (first.cooldown) continue;
    assert.ok(first.email, `${kind} emails even 11 minutes after the last one`);
    assert.equal(first.email.cta?.label, "Open Findtern");
    assert.equal(planNudge({ ...base, kind, lastSameKindAt: ago(60_000) }).cooldown, true);
  }
  const offer = planNudge({ ...base, kind: "offer", lastSameKindAt: null });
  assert.ok(!offer.cooldown && offer.email?.cta?.url === "https://findtern.in/intern/dashboard?nudge=offer");
});

test("no PUBLIC_ORIGIN (link is null): no email for any kind", () => {
  for (const kind of ["online", "offer", "interview"] as const) {
    const plan = planNudge({ ...base, link: noLink, kind, lastSameKindAt: null });
    assert.equal(plan.cooldown, false);
    if (!plan.cooldown) assert.equal(plan.email, undefined);
  }
});

test("tallyNudges: emailed = SMTP accepted, emailFailed = SMTP error, neither counts in sent only; skipped covers failures and invisible students", () => {
  const tally = tallyNudges(
    [
      { ok: true, pushed: true, emailed: true, emailFailed: false },
      { ok: true, pushed: false, emailed: true, emailFailed: false },
      { ok: true, pushed: false, emailed: false, emailFailed: true },
      { ok: true, pushed: true, emailed: false, emailFailed: false }, // MAIL_MODE=log, no link or no address
      { ok: false }, // cooldown or a nudge that threw
    ],
    2,
  );
  assert.deepEqual(tally, { sent: 4, pushed: 2, emailed: 2, emailFailed: 1, skipped: 3 });
  assert.deepEqual(Object.keys(tally).sort(), ["emailFailed", "emailed", "pushed", "sent", "skipped"]);
});

test("the nudge route has the 60s window, per-student allSettled and sends the tally", () => {
  const src = readFileSync(new URL("../../app/api/college/nudge/route.ts", import.meta.url), "utf8");
  assert.match(src, /export const maxDuration = 60;/);
  assert.match(src, /Promise\.allSettled/);
  assert.match(src, /NextResponse\.json\(tally\)/);
});

// Bug sheet 25 Nov: a nudge lands on the dashboard and the control it is about glows.
test("every nudge links to the dashboard with its kind; the bell row links there too", () => {
  for (const kind of ["online", "offer", "interview", "meeting", "open_to_work"] as const) {
    assert.equal(nudgeHref(kind), `/intern/dashboard?nudge=${kind}`);
    const plan = planNudge({ ...base, kind, lastSameKindAt: null });
    assert.ok(!plan.cooldown && plan.copy.url === nudgeHref(kind));
    assert.equal(internNotificationHref(`college_nudge_${kind}`, { url: "https://evil.example" }), nudgeHref(kind));
  }
  assert.equal(internNotificationHref("college_nudge_bogus", {}), "/intern/dashboard");
});

test("what glows: the kind in the link, plus unread nudges from the last two days; junk is ignored", () => {
  assert.deepEqual([...nudgeGlow("offer", [])], ["offer"]);
  assert.deepEqual([...nudgeGlow(["meeting", "x"], [])], ["meeting"]);
  assert.deepEqual([...nudgeGlow("<script>", [])], []);
  assert.deepEqual([...nudgeGlow(undefined, ["college_nudge_open_to_work", "proposal_received", "college_nudge_nope"])], ["open_to_work"]);
  assert.deepEqual([...nudgeGlow("offer", ["college_nudge_offer", "college_nudge_interview"])].sort(), ["interview", "offer"]);
});
