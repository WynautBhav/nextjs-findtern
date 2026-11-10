import { test } from "node:test";
import assert from "node:assert/strict";

const { isChunkLoadError, claimChunkReload, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } = await import("./chunk-error.ts");

function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test("recognises chunk failures from webpack, Turbopack and native dynamic import", () => {
  const named = new Error("x");
  named.name = "ChunkLoadError";
  assert.equal(isChunkLoadError(named), true);
  assert.equal(isChunkLoadError(new Error("Loading chunk 123 failed.\n(error: https://x/_next/static/chunks/123.js)")), true);
  assert.equal(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/0abc.js from module 42")), true);
  assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/a.js")), true);
  assert.equal(isChunkLoadError(new Error("error loading dynamically imported module")), true);
});

test("does not treat ordinary errors as chunk failures", () => {
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(new TypeError("Failed to fetch")), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError("ChunkLoadError"), false);
});

test("the automatic reload is claimed once, then refused inside the window, so it cannot loop", () => {
  const s = memory();
  const t0 = 1_000_000;
  assert.equal(claimChunkReload(s, t0), true);
  assert.equal(s.data.get(CHUNK_RELOAD_KEY), String(t0));
  assert.equal(claimChunkReload(s, t0 + 1), false);
  assert.equal(claimChunkReload(s, t0 + CHUNK_RELOAD_WINDOW_MS - 1), false);
  assert.equal(claimChunkReload(s, t0 + CHUNK_RELOAD_WINDOW_MS), true); // a later deploy in the same tab may reload again
});

test("without usable storage there is no guard, so no automatic reload", () => {
  assert.equal(claimChunkReload(null), false);
  const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(claimChunkReload(throwing), false);
});
