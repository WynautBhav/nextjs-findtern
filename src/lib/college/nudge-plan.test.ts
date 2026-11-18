import assert from "node:assert/strict";
import { test } from "node:test";

import { NUDGE_COOLDOWN_MS, NUDGE_ONLINE_EMAIL_WINDOW_MS, planNudge } from "./nudge-plan.ts";

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
  assert.deepEqual(plan.email.cta, { label: "Open Findtern", url: "https://findtern.in/intern/dashboard" });
});

test("a second online nudge after the 10-minute cooldown but inside 3 hours: bell and push, no email", () => {
  const plan = planNudge({ ...base, kind: "online", lastSameKindAt: ago(NUDGE_COOLDOWN_MS + 60_000) });
  assert.equal(plan.cooldown, false);
  if (plan.cooldown) return;
  assert.equal(plan.email, undefined);
});

test("online nudge is blocked inside the 10-minute cooldown", () => {
  assert.equal(planNudge({ ...base, kind: "online", lastSameKindAt: ago(NUDGE_COOLDOWN_MS - 1000) }).cooldown, true);
});

test("online nudge emails again once 3 hours have passed", () => {
  const plan = planNudge({ ...base, kind: "online", lastSameKindAt: ago(NUDGE_ONLINE_EMAIL_WINDOW_MS + 1000) });
  assert.equal(plan.cooldown, false);
  if (plan.cooldown) return;
  assert.ok(plan.email);
});

test("offer and interview keep their email and 10-minute cooldown, unaffected by the 3-hour rule", () => {
  for (const kind of ["offer", "interview"] as const) {
    const first = planNudge({ ...base, kind, lastSameKindAt: ago(NUDGE_COOLDOWN_MS + 60_000) });
    assert.equal(first.cooldown, false);
    if (first.cooldown) continue;
    assert.ok(first.email, `${kind} emails even 11 minutes after the last one`);
    assert.equal(first.email.cta?.label, "Open Findtern");
    assert.equal(planNudge({ ...base, kind, lastSameKindAt: ago(60_000) }).cooldown, true);
  }
  const offer = planNudge({ ...base, kind: "offer", lastSameKindAt: null });
  assert.ok(!offer.cooldown && offer.email?.cta?.url === "https://findtern.in/intern/proposals");
});

test("no PUBLIC_ORIGIN (link is null): no email for any kind", () => {
  for (const kind of ["online", "offer", "interview"] as const) {
    const plan = planNudge({ ...base, link: noLink, kind, lastSameKindAt: null });
    assert.equal(plan.cooldown, false);
    if (!plan.cooldown) assert.equal(plan.email, undefined);
  }
});
