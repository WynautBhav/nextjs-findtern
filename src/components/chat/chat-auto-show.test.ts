import assert from "node:assert/strict";
import { test } from "node:test";

import { launcherLift, launcherPlacement, mayAutoShow } from "./chat-auto-show.ts";

const idle = { typing: false, uploading: false };

test("a plain page with nothing active may show the nudge", () => {
  assert.equal(mayAutoShow({ pathname: "/", ...idle }), true);
  assert.equal(mayAutoShow({ pathname: "/pricing", ...idle }), true);
  assert.equal(mayAutoShow({ pathname: null, ...idle }), true);
});

test("never while a field has focus or a file picker is open", () => {
  assert.equal(mayAutoShow({ pathname: "/", typing: true, uploading: false }), false);
  assert.equal(mayAutoShow({ pathname: "/", typing: false, uploading: true }), false);
});

test("never on onboarding, auth, profile-edit or contact routes", () => {
  for (const p of ["/intern/onboarding", "/employer/onboarding/", "/login", "/signup", "/intern/profile", "/intern/settings", "/intern/documents", "/employer/account", "/contact"]) {
    assert.equal(mayAutoShow({ pathname: p, ...idle }), false, p);
  }
});

test("routes that only share a prefix are not forms", () => {
  assert.equal(mayAutoShow({ pathname: "/intern-nda", ...idle }), true);
  assert.equal(mayAutoShow({ pathname: "/contactless", ...idle }), true);
});

test("intern onboarding is console-placed: no floating launcher beside the top bar's Ask Findy", () => {
  for (const p of ["/intern/onboarding", "/intern/onboarding/"]) {
    assert.deepEqual(launcherPlacement(p), { isForm: false, inApp: true, hasBottomNav: true, headerOnly: true });
  }
});

test("other forms keep the form placement; other intern pages stay header-only", () => {
  for (const p of ["/login", "/signup", "/employer/onboarding"]) assert.equal(launcherPlacement(p).isForm, true);
  assert.equal(launcherPlacement("/intern/dashboard").headerOnly, true);
  assert.equal(launcherPlacement("/college/roster").headerOnly, false);
  assert.equal(launcherPlacement("/pricing").inApp, false);
  assert.equal(launcherPlacement(null).isForm, false);
});

const rest = { left: 240, right: 376, top: 650, bottom: 698 };

test("launcherLift: no bars, a bar far above or a bar on the other side leaves the launcher where it is", () => {
  assert.equal(launcherLift(rest, []), 0);
  assert.equal(launcherLift(rest, [{ left: 16, right: 374, top: 300, bottom: 380 }]), 0);
  assert.equal(launcherLift(rest, [{ left: 16, right: 200, top: 640, bottom: 700 }]), 0);
});

test("launcherLift: a bar under the launcher raises it just above the bar's top edge", () => {
  const bar = { left: 16, right: 374, top: 600, bottom: 680 };
  const lift = launcherLift(rest, [bar]);
  assert.equal(rest.bottom - lift, bar.top - 8);
});

test("launcherLift: stacked bars are all cleared", () => {
  const lower = { left: 16, right: 374, top: 600, bottom: 680 };
  const upper = { left: 16, right: 374, top: 520, bottom: 590 };
  const lift = launcherLift(rest, [lower, upper]);
  assert.ok(rest.bottom - lift <= upper.top - 8);
});
