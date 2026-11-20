import assert from "node:assert/strict";
import { test } from "node:test";

import { launcherPlacement, mayAutoShow } from "./chat-auto-show.ts";

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
