import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

// Renders the real component per state in a tsx child process (JSX and the `@/` alias need it).
const root = join(import.meta.dirname, "..", "..", "..");
const html = JSON.parse(
  execFileSync(process.execPath, ["--import", "tsx", "src/components/intern/interview-join.render.tsx"], { cwd: root, encoding: "utf8" }).trim().split("\n").pop()!,
) as Record<string, string>;

// Class names carry "disabled:" variants, so look at the attribute, not the word.
const disabled = (s: string) => /<button[^>]*\sdisabled=""/.test(s);
const hasJoinButton = (s: string) => /<button[^>]*>(?:<svg[^>]*><\/svg>)?Join meeting<\/button>/.test(s.replace(/<svg.*?<\/svg>/g, "<svg></svg>"));

test("too early: a disabled Join meeting button and when it opens", () => {
  assert.ok(disabled(html.too_early));
  assert.match(html.too_early, /Join meeting/);
  assert.match(html.too_early, /Join opens at 3:15 PM IST \(in 30 min\)/);
  assert.match(html.too_early, /data-join-state="too_early"/);
  assert.match(html.too_early, /aria-describedby="[^"]+"/, "the reason is tied to the button");
});

test("15 minutes before the start and mid-interview: an enabled Join meeting button", () => {
  for (const key of ["open", "mid"]) {
    assert.ok(hasJoinButton(html[key]), key);
    assert.ok(!disabled(html[key]), key);
    assert.match(html[key], /data-join-state="open"/);
  }
});

test("no link yet: disabled, says it is waiting for the company", () => {
  assert.ok(disabled(html.no_link));
  assert.match(html.no_link, /Waiting for the company to share a meeting link/);
});

test("ended: no button, says so", () => {
  assert.doesNotMatch(html.ended, /<button/);
  assert.match(html.ended, /This interview has ended/);
});

test("cancelled, completed, no selected slot: nothing at all", () => {
  for (const key of ["cancelled", "completed", "no_slot"]) assert.equal(html[key], "", key);
});

test("the meeting link itself is never in the markup (it opens only after the rules)", () => {
  for (const key of Object.keys(html)) assert.doesNotMatch(html[key], /meet\.google\.com/, key);
});
