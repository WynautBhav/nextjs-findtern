import assert from "node:assert/strict";
import { test } from "node:test";

import { cardImageLocked, lockedIdField } from "./id-lock.ts";

test("a saved Aadhaar or PAN number cannot be changed by the intern", () => {
  const stored = { aadhaarNumber: "2345 6789 0123", panNumber: "ABCDE1234F" };
  assert.equal(lockedIdField(stored, { aadhaarNumber: "234567890999" }), "aadhaarNumber");
  assert.equal(lockedIdField(stored, { panNumber: "ZZZZZ9999Z" }), "panNumber");
});

test("sending the same number again, or leaving it out, is not a change", () => {
  const stored = { aadhaarNumber: "2345 6789 0123", panNumber: "ABCDE1234F" };
  assert.equal(lockedIdField(stored, { aadhaarNumber: "234567890123", panNumber: "abcde1234f" }), null);
  assert.equal(lockedIdField(stored, {}), null);
  assert.equal(lockedIdField(stored, { aadhaarNumber: "", panNumber: "" }), null);
});

test("with nothing saved yet, any number may be entered", () => {
  assert.equal(lockedIdField(null, { aadhaarNumber: "234567890123", panNumber: "ABCDE1234F" }), null);
  assert.equal(lockedIdField({ aadhaarNumber: null, panNumber: "" }, { aadhaarNumber: "234567890123", panNumber: "ABCDE1234F" }), null);
});

test("a card image on file cannot be replaced; other kinds and a first upload are untouched", () => {
  const doc = { aadhaarImageName: "a.webp", panImageName: null };
  assert.equal(cardImageLocked("aadhaar", doc), true);
  assert.equal(cardImageLocked("pan", doc), false);
  assert.equal(cardImageLocked("pan", { panImageName: "p.webp" }), true);
  assert.equal(cardImageLocked("aadhaar", null), false);
  assert.equal(cardImageLocked("profile_photo", { aadhaarImageName: "a.webp", panImageName: "p.webp" }), false);
});

test("both intern routes enforce the lock (the form alone is not enough)", async () => {
  const { readFileSync } = await import("node:fs");
  const save = readFileSync("src/app/api/intern/onboarding/route.ts", "utf8");
  assert.match(save, /lockedIdField\(existing, body\)/);
  const upload = readFileSync("src/app/api/uploads/route.ts", "utf8");
  assert.match(upload, /cardImageLocked\(kindName, /);
});

test("a malformed legacy number is not locked, so the intern can correct it", () => {
  assert.equal(lockedIdField({ aadhaarNumber: "12345" }, { aadhaarNumber: "234567890123" }), null);
  assert.equal(lockedIdField({ panNumber: "BAD" }, { panNumber: "ABCDE1234F" }), null);
});

test("a legacy Aadhaar starting with 0 or 1 does not lock, so the intern can correct it to a real one", () => {
  assert.equal(lockedIdField({ aadhaarNumber: "123456789012" }, { aadhaarNumber: "234567890123" }), null);
  assert.equal(lockedIdField({ aadhaarNumber: "0123 4567 8901" }, { aadhaarNumber: "234567890123" }), null);
  assert.equal(lockedIdField({ aadhaarNumber: "234567890123" }, { aadhaarNumber: "345678901234" }), "aadhaarNumber");
});
