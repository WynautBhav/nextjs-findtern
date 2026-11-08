import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { shapeEvent } from "../realtime/events.ts";
import { presenceText, presenceView } from "../presence-logic.ts";
import { visibilityBody } from "../presence-input.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
  );

describe("hidden candidates never leak last seen", () => {
  const NOW = Date.now();
  const hidden = { showActivity: false, lastSeenAt: new Date(NOW - 1_000) };

  it("the serialized view and label hold no timestamp, whatever the heartbeat age", () => {
    for (const age of [0, 1_000, 3_600_000, 86_400_000 * 5]) {
      const v = presenceView({ ...hidden, lastSeenAt: new Date(NOW - age) }, NOW);
      assert.equal(JSON.stringify(v), '{"state":"hidden"}');
      assert.equal(presenceText(v, NOW), null);
    }
  });

  it("presence.changed and other SSE frames carry no presence", () => {
    const frame = shapeEvent({ id: 9, type: "presence.changed", payload: { userId: "intern-1", lastSeenAt: hidden.lastSeenAt, online: true } });
    assert.ok(!/lastSeen|online|intern-1/.test(frame), frame);
    const msg = shapeEvent({ id: 10, type: "message.new", payload: { threadId: "t", counterpartOnline: true, nested: { last_seen_at: "x" } } });
    assert.ok(!/online|last_seen/i.test(msg), msg);
  });

  it("the presence queries select last_seen_at behind the show_activity CASE", () => {
    for (const f of ["lib/presence.ts", "lib/messaging/store.ts"]) {
      const s = read(f);
      assert.match(s, /CASE WHEN \$\{\w+\.showActivity\} THEN \$\{\w+\.lastSeenAt\} ELSE NULL END/, f);
      assert.doesNotMatch(s, /\.select\(\)\s*\.from\((schema\.)?(up|p|schema\.userPresence)\)/, `${f} selects every presence column`);
    }
  });

  it("no employer-facing screen or API serializes a raw last-seen timestamp", () => {
    // The drive page reads college_presence only to compute a boolean, which it blanks for hidden students.
    const allow = new Set([join("app", "employer", "drives", "[id]", "page.tsx")]);
    const offenders = ["app/employer", "app/api/employer", "app/api/threads", "components/employer", "components/messaging", "app/api/realtime"]
      .flatMap(walk)
      .filter((f) => !allow.has(f) && /last_?seen/i.test(read(f)));
    assert.deepEqual(offenders, []);
    const drive = read(join("app", "employer", "drives", "[id]", "page.tsx"));
    assert.match(drive, /showActivity, false/);
    assert.match(drive, /online: !hidingIds\.has\(s\.userId\)/);
  });

  it("the threads route and the realtime stream apply the same rules (store.listThreads, shapeEvent)", () => {
    assert.match(read("app/api/threads/route.ts"), /listThreads\(/);
    assert.match(read("app/api/realtime/stream/route.ts"), /shapeEvent\(r\)/);
  });
});

describe("POST /api/intern/presence-visibility", () => {
  const route = read("app/api/intern/presence-visibility/route.ts");

  it("is session-user only: intern role, CSRF guard, verdict read, no id from the client", () => {
    assert.match(route, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
    assert.match(route, /if \(!guard\.ok\) return guard\.response;/);
    assert.match(route, /userId: uid/);
    assert.doesNotMatch(route, /params|searchParams|body\.userId|parsed\.data\.userId/);
  });

  it("is rate limited and writes only the caller's row", () => {
    assert.match(route, /new RateLimiter\(/);
    assert.match(route, /status: 429/);
    assert.match(route, /target: schema\.userPresence\.userId/);
  });

  it("validates the body: strict boolean, no extra keys, no user id", () => {
    assert.ok(visibilityBody.safeParse({ showActivity: true }).success);
    assert.ok(visibilityBody.safeParse({ showActivity: false }).success);
    for (const bad of [{}, null, "true", { showActivity: "yes" }, { showActivity: 1 }, { showActivity: true, userId: "someone-else" }, { show: true }]) {
      assert.ok(!visibilityBody.safeParse(bad).success, JSON.stringify(bad));
    }
  });
});

describe("heartbeat", () => {
  it("never writes show_activity (a beat cannot undo a hide)", () => {
    assert.doesNotMatch(read("app/api/presence/heartbeat/route.ts"), /showActivity/);
  });
});
