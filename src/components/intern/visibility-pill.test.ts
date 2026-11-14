import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { visibilityState } from "./visibility-state.ts";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("tone to state: closed is hidden (red), live is live (green), the rest never blinks", () => {
  assert.equal(visibilityState("closed"), "hidden");
  assert.equal(visibilityState("live"), "live");
  assert.equal(visibilityState("waiting"), "waiting");
  assert.equal(visibilityState("neutral"), "waiting");
});

test("the pill keeps its text label, hides the decoration from assistive tech, is red/green by token", () => {
  const src = read("components/intern/visibility-pill.tsx");
  assert.match(src, /\n      \{children\}\n/, "the label is rendered");
  assert.ok(!/<span className="[^"]*(status-halo|bg-current)[^"]*"[^>]*>\s*\{children\}/.test(src), "nothing is painted behind the text");
  assert.equal((src.match(/<span aria-hidden/g) ?? []).length, 1, "the dot box (halo and dot) is decoration");
  assert.match(src, /hidden: "bg-danger-soft text-danger/);
  assert.match(src, /live: "bg-success-soft text-success/);
  assert.ok(!/\banimate-(pulse|ping|bounce)\b/.test(src), "only the reduced-motion-safe classes");
});

test("the blink is opacity only, slow, ease-in-out, and attached only when motion is allowed", () => {
  const css = read("app/globals.css");
  for (const name of ["status-blink", "status-halo"]) {
    const kf = css.slice(css.indexOf(`@keyframes ${name}`), css.indexOf("}\n\n", css.indexOf(`@keyframes ${name}`)));
    assert.ok(kf.length > 20, `${name} keyframes exist`);
    assert.ok(!/transform|scale|translate|width|height|margin|top|left/.test(kf), `${name} animates opacity only`);
  }
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .status-blink"));
  assert.match(block.slice(0, 260), /\.status-blink \{\s*animation: status-blink 2s ease-in-out infinite;/);
  assert.match(block.slice(0, 260), /\.status-halo \{\s*animation: status-halo 2s ease-in-out infinite;/);
  assert.ok(!/\.status-(blink|halo)[^{]*\{[^}]*\}/.test(css.replace(block.slice(0, 260), "")), "no unconditional rule attaches the animation");
});

test("Home uses it, the banner's dot is red and blinks, and the profile page and view are untouched", () => {
  assert.match(read("app/intern/dashboard/page.tsx"), /<VisibilityPill state=\{visibilityState\(profileStatus\.tone\)\}>/);
  const banner = read("components/intern/hidden-profile-banner.tsx");
  assert.ok(banner.includes("status-blink") && banner.includes("bg-danger") && !banner.includes("motion-safe:animate-ping"));
  assert.ok(banner.includes("Your profile is hidden from employers"), "the words stay");
});
