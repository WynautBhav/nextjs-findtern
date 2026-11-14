import assert from "node:assert/strict";
import { test } from "node:test";

import { busyState, clipFor, isOneShot, looksLikeLookup, looksLikeThanks, replyState } from "./mascot-state.ts";

test("every state maps to a clip; only greet, eureka, thumbs, oops and bye are one-shots", () => {
  assert.equal(clipFor("idle"), "idle");
  assert.equal(clipFor("greeting"), "greet");
  assert.equal(clipFor("thinking"), "think");
  assert.equal(clipFor("searching"), "search");
  assert.equal(clipFor("celebrating"), "eureka");
  assert.equal(clipFor("typing"), "typing");
  assert.equal(clipFor("thanked"), "thumbs");
  assert.equal(clipFor("oops"), "oops");
  assert.equal(clipFor("bye"), "bye");
  assert.equal(clipFor("sleepy"), "sleepy");
  assert.deepEqual(
    (["idle", "greet", "think", "search", "eureka", "typing", "thumbs", "oops", "bye", "sleepy"] as const).filter(isOneShot),
    ["greet", "eureka", "thumbs", "oops", "bye"],
  );
});

test("lookup-style questions pick the search clip, the rest think", () => {
  assert.equal(busyState("What does it cost for employers?"), "searching");
  assert.equal(busyState("Find me the pricing page"), "searching");
  assert.equal(busyState("How does the AI interview work?"), "thinking");
  assert.equal(looksLikeLookup("Is placement guaranteed?"), false);
});

test("thanks gets a thumbs-up and beats the first-reply cheer", () => {
  assert.equal(looksLikeThanks("thanks!"), true);
  assert.equal(looksLikeThanks("Thank you so much"), true);
  assert.equal(looksLikeThanks("TY"), true);
  assert.equal(looksLikeThanks("that's awesome"), true);
  assert.equal(looksLikeThanks("thanksgiving dates?"), false);
  assert.equal(looksLikeThanks("what is a pty?"), false);
  assert.equal(replyState("thanks!", true), "thanked");
  assert.equal(replyState("thanks!", false), "thanked");
  assert.equal(replyState("How does it work?", true), "celebrating");
  assert.equal(replyState("How does it work?", false), "idle");
});
