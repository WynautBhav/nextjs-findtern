import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isLockedApi, lockedPageName } from "../intern-lock.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the intern nav (stage, locked and More lists) has no Open roles entry", () => {
  const layout = read("app/intern/layout.tsx");
  assert.doesNotMatch(layout, /Open roles/i);
  assert.doesNotMatch(layout, /\/intern\/opportunities/);
  assert.doesNotMatch(layout, /\bCompass\b/);
  // The phone bar before payment still carries five tabs, the fifth being Messages.
  const locked = layout.slice(layout.indexOf("const LOCKED_STAGE_NAV"), layout.indexOf("const MORE_NAV"));
  assert.equal((locked.match(/href: "/g) ?? []).length, 5);
  assert.match(locked, /\/intern\/messages/);
  // Before the profile is complete: Home, Complete profile, Documents, Your profile, Offers (Documents and Your profile locked).
  const pre = layout.slice(layout.indexOf("const PRECOMPLETE_STAGE_NAV"), layout.indexOf("/**\n * The intern shell."));
  assert.equal((pre.match(/href: "/g) ?? []).length, 5);
  assert.match(pre, /\/intern\/onboarding/);
});

test("/intern/opportunities and its detail route are redirect stubs to the dashboard", () => {
  for (const f of ["app/intern/opportunities/page.tsx", "app/intern/opportunities/[id]/page.tsx"]) {
    const src = read(f);
    assert.match(src, /redirect\("\/intern\/dashboard"\)/, f);
    assert.doesNotMatch(src, /getDb|loadInternData|projectById/, f);
  }
});

test("no other source file links into the removed intern pages or says See open roles", () => {
  const files = [
    "app/intern/dashboard/page.tsx",
    "app/intern/proposals/page.tsx",
    "app/intern/interviews/page.tsx",
    "components/messaging/messages-shell.tsx",
    "components/intern/home/dashboard-cards.tsx",
    "components/intern/college-live.tsx",
    "lib/emails.ts",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /\/intern\/opportunities/, f);
    assert.doesNotMatch(src, /See (all )?open roles/i, f);
  }
});

test("the saved-roles API and the lock rules for the removed pages are gone", () => {
  assert.equal(existsSync(join(SRC, "app/api/intern/saved-projects/route.ts")), false);
  assert.equal(lockedPageName("/intern/opportunities"), null);
  assert.equal(isLockedApi("/api/intern/saved-projects"), false);
});

test("an empty Offers, Messages or Interviews page gives the intern no button to press", () => {
  const offers = read("app/intern/proposals/page.tsx");
  const offersEmpty = offers.slice(offers.indexOf('title="No offers yet"'), offers.indexOf('title="No offers yet"') + 600);
  assert.doesNotMatch(offersEmpty.split("/>")[0], /next=/);
  const iv = read("app/intern/interviews/page.tsx");
  const ivEmpty = iv.slice(iv.indexOf('title="No company interviews yet"'), iv.indexOf('title="No company interviews yet"') + 400);
  assert.doesNotMatch(ivEmpty.split("/>")[0], /next=/);
  const msg = read("components/messaging/messages-shell.tsx");
  assert.doesNotMatch(msg, /Check your profile/);
});
