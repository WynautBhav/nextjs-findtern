import assert from "node:assert/strict";
import { test } from "node:test";

import { saveFailureMessage } from "./fetch-error.ts";

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

test("a network failure (TypeError) reads as a connection problem, never 'Failed to fetch'", () => {
  assert.equal(saveFailureMessage(new TypeError("Failed to fetch")), OFFLINE);
  assert.equal(saveFailureMessage(new TypeError("NetworkError when attempting to fetch resource.")), OFFLINE);
});

test("the server's own message is kept", () => {
  assert.equal(saveFailureMessage(new Error("This project is closed.")), "This project is closed.");
});

test("a non-Error throw and an empty message fall back", () => {
  assert.equal(saveFailureMessage("boom"), OFFLINE);
  assert.equal(saveFailureMessage(new Error("")), OFFLINE);
});
