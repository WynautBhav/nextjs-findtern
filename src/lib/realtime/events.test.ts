import test from "node:test";
import assert from "node:assert/strict";

import { backoffMs, parseCursor, shapeEvent } from "./events.ts";

test("parseCursor accepts digits only", () => {
  assert.equal(parseCursor("42"), 42);
  assert.equal(parseCursor("-1"), null);
  assert.equal(parseCursor("4x"), null);
  assert.equal(parseCursor(null), null);
});
test("shapeEvent builds an SSE frame and cannot be split by newlines in type", () => {
  assert.equal(shapeEvent({ id: 7, type: "message.new", payload: { a: 1 } }), 'id: 7\nevent: message.new\ndata: {"a":1}\n\n');
  assert.ok(!shapeEvent({ id: 1, type: "x\ndata: evil", payload: {} }).includes("\ndata: evil"));
});
test("backoff doubles and caps", () => {
  assert.deepEqual([0, 1, 2, 10].map((n) => backoffMs(n)), [1000, 2000, 4000, 30000]);
});
