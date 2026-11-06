import { test } from "node:test";
import assert from "node:assert/strict";

const { isProfileSubmittedComplete } = await import("./profile-state.ts");

const docs = { hasPhoto: true, hasPanImage: true, hasAadhaarImage: false };
const row = (extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  city: "Pune",
  state: "Maharashtra",
  pinCode: "411001",
  skills: ["React", "SQL", "Excel", "Python"],
  locationTypes: ["remote"],
  preferredLocations: [],
  hasLaptop: true,
  extraData: {
    profileSubmittedAt: "2026-10-01T00:00:00.000Z",
    languages: [{ id: "l1", language: "english", level: "professional", read: true, write: true, speak: true }],
    emergencyPhone: "9812345678", emergencyName: "Asha Rao", emergencyRelation: "Mother", ndaAcceptedAt: "2026-10-01",
    academics: { qualificationLevel: "Bachelor", status: "Pursuing", institution: "ABC College", degree: "B.Tech", startYear: "2023" },
    ...extra,
  },
  aadhaarNumber: "234567890123",
  panNumber: "ABCDE1234F",
  ...over,
});

test("a null row is never complete", () => {
  assert.equal(isProfileSubmittedComplete(null, docs), false);
});

test("an empty row is not complete, submitted or not", () => {
  assert.equal(isProfileSubmittedComplete({ extraData: { profileSubmittedAt: "2026-10-01" } }, docs), false);
});

test("a filled but unsubmitted profile is not complete", () => {
  const r = row({ profileSubmittedAt: undefined });
  assert.equal(isProfileSubmittedComplete(r, docs), false);
});

test("a submitted profile missing the PAN image is not complete", () => {
  const r = row();
  assert.equal(isProfileSubmittedComplete(r, { ...docs, hasPanImage: false }), false);
});

test("a submitted profile missing academics is not complete", () => {
  const r = row({ academics: {} });
  assert.equal(isProfileSubmittedComplete(r, docs), false);
});

test("a submitted profile missing languages is not complete", () => {
  const r = row({ languages: [] });
  assert.equal(isProfileSubmittedComplete(r, docs), false);
});

test("a legacy scored row that is otherwise incomplete is still not complete", () => {
  assert.equal(isProfileSubmittedComplete({ extraData: { findternScore: 7 } }, docs), false);
});

test("a fully filled, submitted profile is complete", () => {
  assert.equal(isProfileSubmittedComplete(row(), docs), true);
});

test("a legacy scored row that is fully filled is complete without a submitted stamp", () => {
  assert.equal(isProfileSubmittedComplete(row({ profileSubmittedAt: undefined, findternScore: 7.5 }), docs), true);
});
