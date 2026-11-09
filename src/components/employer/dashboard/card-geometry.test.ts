import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fitSegments, MAX_SEGMENTS, ringArc, tintFor, TINTS } from "./card-geometry.ts";

describe("tintFor", () => {
  it("is stable per id", () => assert.equal(tintFor("abc"), tintFor("abc")));
  it("spreads uuids over all six tints", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(tintFor(`${i.toString(16).padStart(8, "0")}-91aa-4c0d-8f5e-1b7c2d9e0a11`));
    assert.equal(seen.size, TINTS.length);
  });
});

describe("fitSegments", () => {
  it("5 skills, 3 hit: 88px, 3 lit", () => assert.deepEqual(fitSegments(3, 5), { n: 5, filled: 3, width: 88 }));
  it("never lights more than it draws", () => assert.equal(fitSegments(9, 5).filled, 5));
  it("caps long lists and fixes their width", () => assert.deepEqual(fitSegments(2, 40), { n: MAX_SEGMENTS, filled: 2, width: 142 }));
  it("handles nothing asked for", () => assert.deepEqual(fitSegments(0, 0), { n: 0, filled: 0, width: -2 }));
});

describe("ringArc", () => {
  it("is score / 10 of the circumference", () => {
    const { arc, circumference } = ringArc(7.5, 26);
    assert.ok(Math.abs(arc / circumference - 0.75) < 1e-9);
  });
  it("clamps and survives NaN", () => {
    assert.equal(ringArc(14, 10).arc, ringArc(10, 10).arc);
    assert.equal(ringArc(Number.NaN, 10).arc, 0);
    assert.equal(ringArc(-3, 10).arc, 0);
  });
});
