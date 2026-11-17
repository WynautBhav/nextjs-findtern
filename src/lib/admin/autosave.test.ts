import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTOSAVE_DELAY_MS, createAutosave } from "./autosave.ts";

const A = createAutosave<string>((a, b) => a === b);
type S = ReturnType<typeof A.init>;
type Act = Parameters<typeof A.reduce>[1];
const run = (s: S, ...acts: Act[]) => acts.reduce((st, a) => A.reduce(st, a), s);

test("the debounce is about a second and a bit", () => {
  assert.ok(AUTOSAVE_DELAY_MS >= 1000 && AUTOSAVE_DELAY_MS <= 1500);
});

test("edit -> pending -> fire -> saving -> ok -> saved, then settles to idle", () => {
  let s = A.init("100");
  assert.equal(A.status(s), "idle");
  s = run(s, { type: "edit", draft: "120" });
  assert.equal(A.status(s), "pending");
  assert.equal(A.wantsFire(s), true);
  s = run(s, { type: "fire" });
  assert.equal(A.status(s), "saving");
  assert.equal(s.sending, "120");
  s = run(s, { type: "ok" });
  assert.equal(A.status(s), "saved");
  assert.equal(s.saved, "120");
  s = run(s, { type: "settle" });
  assert.equal(A.status(s), "idle");
});

test("editing back to the saved value is not a change: nothing to save", () => {
  const s = run(A.init("100"), { type: "edit", draft: "120" }, { type: "edit", draft: "100" });
  assert.equal(A.status(s), "idle");
  assert.equal(A.wantsFire(s), false);
  assert.equal(A.reduce(s, { type: "fire" }).sending, null);
});

test("an invalid draft is never saved, and says why; fixing it makes it pending again", () => {
  let s = run(A.init("100"), { type: "edit", draft: "abc", invalid: "Enter a price in rupees." });
  assert.equal(A.status(s), "invalid");
  assert.equal(s.invalid, "Enter a price in rupees.");
  assert.equal(A.wantsFire(s), false);
  s = run(s, { type: "fire" });
  assert.equal(s.sending, null, "fire is refused while invalid");
  s = run(s, { type: "edit", draft: "130" });
  assert.equal(A.status(s), "pending");
  assert.equal(s.invalid, null);
});

test("saves are serialised: edits during a save wait, then go out as the next save", () => {
  let s = run(A.init("100"), { type: "edit", draft: "110" }, { type: "fire" });
  s = run(s, { type: "edit", draft: "115" });
  assert.equal(A.status(s), "saving");
  assert.equal(A.wantsFire(s), false, "no second request while one is in flight");
  const during = A.reduce(s, { type: "fire" });
  assert.equal(during.sending, "110", "the in-flight value is not replaced");
  assert.equal(during.seq, s.seq, "and no new request is started");
  s = run(s, { type: "ok" });
  assert.equal(s.saved, "110");
  assert.equal(A.status(s), "pending");
  s = run(s, { type: "fire" });
  assert.equal(s.sending, "115");
  s = run(s, { type: "ok" });
  assert.equal(A.status(s), "saved");
  assert.equal(s.saved, "115");
});

test("a failed save keeps the draft, shows the server message, and does not retry on its own", () => {
  let s = run(A.init("100"), { type: "edit", draft: "110" }, { type: "fire" }, { type: "fail", message: "Plan not found" });
  assert.equal(A.status(s), "error");
  assert.equal(s.error, "Plan not found");
  assert.equal(s.draft, "110");
  assert.equal(s.saved, "100");
  assert.equal(A.wantsFire(s), false);
  assert.equal(run(s, { type: "fire" }).sending, null);
  // Retry sends the same draft again.
  const seq = s.seq;
  s = run(s, { type: "retry" });
  assert.equal(A.status(s), "saving");
  assert.equal(s.sending, "110");
  assert.equal(s.seq, seq + 1);
  s = run(s, { type: "ok" });
  assert.equal(A.status(s), "saved");
});

test("editing after a failure clears the error and resumes autosave", () => {
  const s = run(A.init("100"), { type: "edit", draft: "110" }, { type: "fire" }, { type: "fail", message: "x" }, { type: "edit", draft: "111" });
  assert.equal(A.status(s), "pending");
  assert.equal(s.error, null);
  assert.equal(A.wantsFire(s), true);
});

test("an immediate edit (a switch) fires without waiting for the debounce", () => {
  const s = run(A.init("off"), { type: "edit", draft: "on", immediate: true });
  assert.equal(s.fireNow, true);
  assert.equal(A.reduce(run(A.init("off"), { type: "edit", draft: "on" }), { type: "fire" }).fireNow, false);
  assert.equal(A.reduce(s, { type: "fire" }).fireNow, false, "consumed once it fires");
});

test("undo reverts to the previous server value, as its own save, once", () => {
  let s = run(A.init("100"), { type: "edit", draft: "120" }, { type: "fire" }, { type: "ok" });
  assert.equal(s.prev, "100");
  s = run(s, { type: "undo" });
  assert.equal(s.draft, "100");
  assert.equal(s.fireNow, true);
  assert.equal(A.status(s), "pending");
  s = run(s, { type: "fire" });
  assert.equal(s.sending, "100");
  s = run(s, { type: "ok" });
  assert.equal(s.saved, "100");
  assert.equal(s.prev, null, "no redo/undo ping-pong");
  assert.equal(A.status(s), "saved");
  assert.equal(run(s, { type: "undo" }), s, "nothing left to undo");
});

test("undo is refused while a save is in flight", () => {
  const s = run(A.init("100"), { type: "edit", draft: "120" }, { type: "fire" });
  assert.equal(run(s, { type: "undo" }), s);
});

test("undo also drops edits typed since (the draft goes back to the previous server value)", () => {
  const s = run(A.init("100"), { type: "edit", draft: "120" }, { type: "fire" }, { type: "ok" }, { type: "edit", draft: "999" }, { type: "undo" });
  assert.equal(s.draft, "100");
});

test("discard drops a failed or invalid draft back to the saved value", () => {
  let s = run(A.init("100"), { type: "edit", draft: "110" }, { type: "fire" }, { type: "fail", message: "x" }, { type: "discard" });
  assert.equal(A.status(s), "idle");
  assert.equal(s.draft, "100");
  s = run(A.init("100"), { type: "edit", draft: "zz", invalid: "bad" }, { type: "discard" });
  assert.equal(A.status(s), "idle");
  assert.equal(s.invalid, null);
  // Not while saving.
  const saving = run(A.init("100"), { type: "edit", draft: "110" }, { type: "fire" });
  assert.equal(run(saving, { type: "discard" }), saving);
});

test("a refresh from the server never clobbers local edits, but adopts a changed value when clean", () => {
  const dirty = run(A.init("100"), { type: "edit", draft: "110" });
  assert.equal(run(dirty, { type: "sync", value: "105" }), dirty);
  const failed = run(dirty, { type: "fire" }, { type: "fail", message: "x" });
  assert.equal(run(failed, { type: "sync", value: "105" }), failed);
  const clean = run(A.init("100"), { type: "sync", value: "105" });
  assert.equal(clean.draft, "105");
  assert.equal(clean.saved, "105");
  assert.equal(clean.prev, null);
  // Our own save echoing back is a no-op.
  const saved = run(A.init("100"), { type: "edit", draft: "120" }, { type: "fire" }, { type: "ok" });
  assert.equal(run(saved, { type: "sync", value: "120" }).prev, "100", "undo is kept");
});

test("ok / fail with nothing in flight are ignored", () => {
  const s = A.init("100");
  assert.equal(run(s, { type: "ok" }), s);
  assert.equal(run(s, { type: "fail", message: "x" }), s);
});

test("unsaved: only while pending, saving, failed or invalid (the beforeunload warning)", () => {
  const idle = A.init("1");
  const pending = run(idle, { type: "edit", draft: "2" });
  const saving = run(pending, { type: "fire" });
  const failed = run(saving, { type: "fail", message: "x" });
  const invalid = run(idle, { type: "edit", draft: "z", invalid: "bad" });
  const saved = run(saving, { type: "ok" });
  assert.deepEqual([idle, pending, saving, failed, invalid, saved].map(A.unsaved), [false, true, true, true, true, false]);
});
