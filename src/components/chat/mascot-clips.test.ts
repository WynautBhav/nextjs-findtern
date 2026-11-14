import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { test } from "node:test";

import { CLIP_BUDGET_BYTES, PAGE_CLIPS, clipDir, needsTile } from "./mascot-clips.ts";

const root = new URL("../../../public", import.meta.url).pathname;
const size = (clip: keyof typeof PAGE_CLIPS, rel: string) => {
  const p = `${root}${clipDir(clip)}/${rel}`;
  assert.ok(existsSync(p), `missing ${rel}`);
  return statSync(p).size;
};

for (const clip of Object.keys(PAGE_CLIPS) as (keyof typeof PAGE_CLIPS)[]) {
  test(`${clip}: every file exists and is within budget`, () => {
    for (const v of [clip, `${clip}-sm`]) {
      assert.ok(size(clip, `${v}.mp4`) <= CLIP_BUDGET_BYTES.mp4, `${v}.mp4 over budget`);
    }
    assert.ok(size(clip, `${clip}.webm`) <= CLIP_BUDGET_BYTES.webm, `${clip}.webm over budget`);
    assert.ok(size(clip, `${clip}-sm.webm`) <= CLIP_BUDGET_BYTES.smWebm, `${clip}-sm.webm over budget`);
    for (const p of [`${clip}-start.webp`, `${clip}-end.webp`]) assert.ok(size(clip, p) <= CLIP_BUDGET_BYTES.poster, `${p} over budget`);
    // One owl per page: what a visitor downloads (desktop webm + start poster) stays under 450KB.
    assert.ok(size(clip, `${clip}.webm`) + size(clip, `${clip}-start.webp`) <= 450 * 1024);
  });
}

test("every clip is registered with the directory its files live in", () => {
  assert.equal(clipDir("pricing-coffee"), "/media/mascot/marketing");
  assert.equal(clipDir("map-404"), "/media/mascot/m");
  assert.equal(Object.keys(PAGE_CLIPS).length, 11);
});

test("only clips flattened on the light stage colour get a tile", () => {
  assert.equal(needsTile("pricing-coffee"), true);
  assert.equal(needsTile("hero-point"), false);
  assert.equal(needsTile("hired-celebrate"), true);
});
