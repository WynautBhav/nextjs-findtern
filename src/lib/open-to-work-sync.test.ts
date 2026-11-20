import assert from "node:assert/strict";
import test from "node:test";

import { announceOpenToWork, storedOpenToWork, subscribeOpenToWork } from "./open-to-work-sync.ts";

test("storedOpenToWork trusts the server's value over the request", () => {
  assert.equal(storedOpenToWork({ ok: true, openToWork: false }, true), false); // staff-hidden: turning on is a no-op
  assert.equal(storedOpenToWork({ ok: true, openToWork: true }, false), true);
});

test("storedOpenToWork falls back to the request when the body has no flag", () => {
  assert.equal(storedOpenToWork({ ok: true }, true), true);
  assert.equal(storedOpenToWork(null, false), false);
  assert.equal(storedOpenToWork({ openToWork: "yes" }, true), true);
});

test("every subscriber follows an announcement, in both directions", () => {
  const bus = new EventTarget();
  const banner: boolean[] = [];
  const toggle: boolean[] = [];
  subscribeOpenToWork((v) => banner.push(v), bus);
  subscribeOpenToWork((v) => toggle.push(v), bus);
  announceOpenToWork(true, bus);
  announceOpenToWork(false, bus);
  assert.deepEqual(banner, [true, false]);
  assert.deepEqual(toggle, [true, false]);
});

test("unsubscribe stops updates", () => {
  const bus = new EventTarget();
  const seen: boolean[] = [];
  const off = subscribeOpenToWork((v) => seen.push(v), bus);
  announceOpenToWork(true, bus);
  off();
  announceOpenToWork(false, bus);
  assert.deepEqual(seen, [true]);
});

test("non-boolean payloads are ignored", () => {
  const bus = new EventTarget();
  const seen: boolean[] = [];
  subscribeOpenToWork((v) => seen.push(v), bus);
  bus.dispatchEvent(new CustomEvent("findtern:open-to-work", { detail: "x" }));
  assert.deepEqual(seen, []);
});
