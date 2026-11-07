import test from "node:test";
import assert from "node:assert/strict";
import { dialSegments, singleSegment, clamp10, meanOf } from "./score-dial-geometry.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test("clamp10", () => {
  assert.equal(clamp10(-3), 0);
  assert.equal(clamp10(12), 10);
  assert.equal(clamp10(null), 0);
  assert.equal(clamp10(undefined), 0);
  assert.equal(clamp10(NaN), 0);
  assert.equal(clamp10(7.5), 7.5);
});

test("four segments in order, starting at 12 o'clock with gap", () => {
  const s = dialSegments({ axes: {}, r: 10, gap: 8 });
  assert.deepEqual(s.map((x) => x.key), ["communication", "coding", "aptitude", "interview"]);
  assert.equal(s.length, 4);
  close(s[0].rotate, 4);
  close(s[1].rotate, 94);
  close(s[3].rotate, 274);
  close(s[0].length, 2 * Math.PI * 10 * (82 / 360));
});

test("null axes have a track and zero fill", () => {
  const s = dialSegments({ axes: { communication: null, coding: 5 }, r: 20, gap: 6 });
  assert.equal(s[0].fillLength, 0);
  assert.ok(s[0].length > 0);
  assert.equal(s[2].fillLength, 0);
  close(s[1].fillLength, s[1].length / 2);
});

test("fill proportional and clamped", () => {
  const s = dialSegments({ axes: { communication: 10, coding: 20, aptitude: -1, interview: 2.5 }, r: 30, gap: 6 });
  close(s[0].fillLength, s[0].length);
  close(s[1].fillLength, s[1].length);
  assert.equal(s[2].fillLength, 0);
  close(s[3].fillLength, s[3].length / 4);
});

test("zero gap segments tile the ring", () => {
  const s = dialSegments({ axes: {}, r: 12, gap: 0 });
  close(s.reduce((a, x) => a + x.length, 0), s[0].circumference);
});

test("singleSegment is a full ring", () => {
  const s = singleSegment({ score: 8, r: 10 });
  close(s.length, s.circumference);
  close(s.fillLength, s.circumference * 0.8);
  assert.equal(singleSegment({ score: 99, r: 10 }).fillLength, s.circumference);
});

test("meanOf", () => {
  assert.equal(meanOf({}), null);
  close(meanOf({ coding: 4, aptitude: 8, interview: null })!, 6);
});
