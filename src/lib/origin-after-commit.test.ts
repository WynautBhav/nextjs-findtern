import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { driveShareUrl } from "./college/drive-input.ts";
import { linkTo, tryPublicOrigin } from "./origin.ts";

const PROD_NO_ORIGIN = { NODE_ENV: "production" } as Record<string, string | undefined>;
const PROD_WITH_ORIGIN = { NODE_ENV: "production", PUBLIC_ORIGIN: "https://findtern.in/" };

test("production without PUBLIC_ORIGIN: linkTo and tryPublicOrigin return null, never throw", () => {
  assert.equal(tryPublicOrigin(PROD_NO_ORIGIN), null);
  assert.equal(linkTo("/intern/dashboard", PROD_NO_ORIGIN), null);
  assert.equal(linkTo("/intern/dashboard", { ...PROD_NO_ORIGIN, PUBLIC_ORIGIN: "not a url" }), null);
});

test("with PUBLIC_ORIGIN the link is absolute and has no double slash", () => {
  assert.equal(linkTo("/intern/dashboard", PROD_WITH_ORIGIN), "https://findtern.in/intern/dashboard");
});

test("drive share link: absolute with an origin, site-relative without (the token only exists in this response)", () => {
  assert.equal(driveShareUrl("https://findtern.in", "tok"), "https://findtern.in/drive/tok");
  assert.equal(driveShareUrl(null, "tok"), "/drive/tok");
  assert.equal(driveShareUrl(tryPublicOrigin(PROD_NO_ORIGIN), "tok"), "/drive/tok");
});

// The four call sites run after a write has committed. No DB route harness, so pin the wiring:
// none may call the throwing origin() from emails.ts again.
const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("post-commit call sites no longer use the throwing origin()", () => {
  for (const p of [
    "lib/college/meetings.ts",
    "lib/college/nudge.ts",
    "app/api/college/drives/route.ts",
    "app/api/college/drives/[id]/link/route.ts",
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /\borigin\(\)/, p);
    assert.doesNotMatch(src, /import \{[^}]*\borigin\b[^}]*\} from "@\/lib\/emails"/, p);
    assert.match(src, /linkTo\(|tryPublicOrigin\(/, p);
  }
});

test("nudge and meeting emails are dropped, not thrown, when there is no link", () => {
  assert.match(read("lib/college/nudge.ts"), /link === null\s*\? undefined/);
  assert.match(read("lib/college/meetings.ts"), /dashboard === null \? undefined/);
});
