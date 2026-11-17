import assert from "node:assert/strict";
import { test } from "node:test";

import { expiriesInWindow, expiryLinks } from "./expiries.ts";

const at = (iso: string) => new Date(iso);
const prop = (reason: string, when: string | null) => ({ reason, at: when ? at(when) : null }) as never;
const ai = (reason: string, when: string | null) => ({ reason, at: when ? at(when) : null }) as never;

// 1 Nov 00:00 IST = 31 Oct 18:30Z; window is the IST month of November (until open = now).
const SINCE = at("2026-10-31T18:30:00Z");
const UNTIL = at("2026-11-08T18:30:00Z"); // exclusive: 9 Nov 00:00 IST

test("counts by reason inside the window: since inclusive, until exclusive, unknown time never counted", () => {
  const e = expiriesInWindow(
    {
      proposals: [
        prop("no_reply_past_start", "2026-10-31T18:30:00Z"), // exactly since: in
        prop("no_reply_past_start", "2026-10-31T18:29:59Z"), // a second before: out
        prop("unpaid_past_start", "2026-11-08T18:29:59Z"), // last second: in
        prop("unpaid_past_start", "2026-11-08T18:30:00Z"), // exactly until: out
        prop("accepted_elsewhere", "2026-11-03T00:00:00Z"),
        prop("admin_closed", "2026-11-04T00:00:00Z"),
        prop("withdrawn", "2026-11-05T00:00:00Z"),
        prop("withdrawn", null),
      ],
      ai: [ai("link_expired", "2026-11-02T00:00:00Z"), ai("link_expired", "2026-10-01T00:00:00Z"), ai("missed", "2026-11-03T00:00:00Z"), ai("cancelled", null)],
    },
    { since: SINCE, until: UNTIL },
  );
  assert.deepEqual(e.proposals, { no_reply_past_start: 1, unpaid_past_start: 1, accepted_elsewhere: 1, admin_closed: 1, withdrawn: 1 });
  assert.equal(e.proposalsHeadline, 3); // withdrawn and admin-closed are not "expired"
  assert.deepEqual(e.ai, { link_expired: 1, missed: 1, cancelled: 0, no_show: 0 });
  assert.equal(e.aiTotal, 2);
});

test("open-ended windows: all time counts every dated row, an open end runs to now", () => {
  const rows = { proposals: [prop("no_reply_past_start", "2020-01-01T00:00:00Z"), prop("no_reply_past_start", null)], ai: [ai("missed", "2026-11-03T00:00:00Z")] };
  const all = expiriesInWindow(rows, { since: null, until: null });
  assert.equal(all.proposalsHeadline, 1);
  assert.equal(all.aiTotal, 1);
  assert.equal(expiriesInWindow(rows, { since: SINCE, until: null }).proposalsHeadline, 0);
});

test("links carry the same IST days the counts used, so the list equals the card", () => {
  const l = expiryLinks({ since: SINCE, until: UNTIL });
  assert.equal(l.proposals("no_reply_past_start"), "/admin/proposal-tracker?tab=expired&reason=no_reply_past_start&from=2026-11-01&to=2026-11-08");
  assert.equal(l.proposals(null), "/admin/proposal-tracker?tab=expired&from=2026-11-01&to=2026-11-08");
  assert.equal(l.ai(null), "/admin/ai-interviews?filter=expired&from=2026-11-01&to=2026-11-08");
  assert.equal(l.ai("missed"), "/admin/ai-interviews?filter=expired&reason=missed&from=2026-11-01&to=2026-11-08");
  const open = expiryLinks({ since: null, until: null });
  assert.equal(open.proposals(null), "/admin/proposal-tracker?tab=expired");
  assert.equal(expiryLinks({ since: SINCE, until: null }).ai(null), "/admin/ai-interviews?filter=expired&from=2026-11-01");
});
