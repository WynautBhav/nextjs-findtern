import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseSlotState,
  pickSlotToken,
  slotFromParam,
  slotOwner,
  slotScopes,
} from "./google-connections-core.ts";

const row = (refreshToken: string | null, scope: string | null = null) => ({ refreshToken, scope });

test("slotOwner: defaults and env overrides", () => {
  assert.equal(slotOwner("calendar"), "admin");
  assert.equal(slotOwner("drive"), "admin:drive");
  assert.equal(slotOwner("calendar", { FINDTERN_GOOGLE_TOKEN_OWNER_ID: "cal-x" }), "cal-x");
  assert.equal(slotOwner("drive", { FINDTERN_GOOGLE_DRIVE_TOKEN_OWNER_ID: "drv-x" }), "drv-x");
  assert.equal(slotOwner("drive", { FINDTERN_GOOGLE_TOKEN_OWNER_ID: "cal-x" }), "admin:drive");
  assert.equal(slotOwner("drive", { FINDTERN_GOOGLE_DRIVE_TOKEN_OWNER_ID: "" }), "admin:drive");
});

test("slotScopes: calendar still asks for Drive too, drive asks for Drive only", () => {
  assert.deepEqual(slotScopes("calendar"), [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
  ]);
  assert.deepEqual(slotScopes("drive"), ["https://www.googleapis.com/auth/drive.file"]);
});

test("pickSlotToken: drive prefers its own row", () => {
  const picked = pickSlotToken("drive", row("own-rt", "s1"), row("cal-rt", "s2"));
  assert.deepEqual(picked, { refreshToken: "own-rt", scope: "s1", source: "own" });
});

test("pickSlotToken: drive falls back to the calendar row when it has no refresh token", () => {
  for (const own of [null, undefined, row(null), row("")]) {
    assert.deepEqual(pickSlotToken("drive", own, row("cal-rt", "s2")), {
      refreshToken: "cal-rt",
      scope: "s2",
      source: "calendar-fallback",
    });
  }
});

test("pickSlotToken: calendar never falls back and ignores a drive row", () => {
  assert.equal(pickSlotToken("calendar", null, row("cal-rt")), null);
  assert.deepEqual(pickSlotToken("calendar", row("cal-rt", "s"), row("other")), {
    refreshToken: "cal-rt",
    scope: "s",
    source: "own",
  });
});

test("pickSlotToken: nothing connected gives null", () => {
  assert.equal(pickSlotToken("drive", null, null), null);
  assert.equal(pickSlotToken("drive", row(null), row(null)), null);
});

test("parseSlotState: reads drive, defaults to calendar on anything else", () => {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  assert.deepEqual(parseSlotState(enc({ role: "drive", nonce: "n1" })), { slot: "drive", nonce: "n1" });
  assert.deepEqual(parseSlotState(enc({ role: "calendar", nonce: "n2" })), { slot: "calendar", nonce: "n2" });
  assert.deepEqual(parseSlotState(enc({ role: "admin", nonce: 5 })), { slot: "calendar", nonce: undefined });
  assert.deepEqual(parseSlotState("%%%not-json"), { slot: "calendar" });
  assert.deepEqual(parseSlotState(null), { slot: "calendar" });
});

test("slotFromParam: only 'drive' selects drive", () => {
  assert.equal(slotFromParam("drive"), "drive");
  assert.equal(slotFromParam("calendar"), "calendar");
  assert.equal(slotFromParam("DRIVE"), "calendar");
  assert.equal(slotFromParam(null), "calendar");
});
