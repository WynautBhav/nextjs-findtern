import assert from "node:assert/strict";
import { test } from "node:test";

import { canDecide, hybridSplit, internOfferKey, joiningInstant, offerGroup, offerWasEdited, shiftInIst } from "./intern-offer-view.ts";

const now = new Date("2026-10-19T06:00:00Z"); // 19 Oct, 11:30 IST
const internship = (extra: Record<string, unknown> = {}) => ({ roleTitle: "Design intern", startDate: "2026-11-01", ...extra });
const fullTime = (extra: Record<string, unknown> = {}) => ({
  ...internship(extra),
  fullTimeOffer: { jobTitle: "Designer", annualCtc: 600000, jobMode: "onsite" },
});

test("an open offer waits on the intern until its joining date", () => {
  assert.equal(internOfferKey({ status: "sent", offerDetails: internship() }, now), "sent");
  assert.ok(canDecide("sent"));
  // INW-17: it closes ON the joining date, not the day after.
  assert.equal(internOfferKey({ status: "sent", offerDetails: internship({ startDate: "2026-10-19" }) }, now), "lapsed");
  assert.equal(internOfferKey({ status: "sent", offerDetails: internship({ startDate: "2026-10-20" }) }, now), "sent");
  assert.equal(offerGroup("lapsed"), "closed");
  assert.ok(!canDecide("lapsed"));
});

test("processing reads as accepted (INW-21)", () => {
  assert.equal(internOfferKey({ status: "processing", offerDetails: internship() }, now), "accepted");
  assert.equal(offerGroup("accepted"), "active");
  assert.ok(!canDecide("accepted"));
});

test("an accepted full-time offer is the hire (INW-13)", () => {
  assert.equal(internOfferKey({ status: "accepted", offerDetails: fullTime() }, now), "fulltime_hired");
  assert.equal(internOfferKey({ status: "accepted", offerDetails: internship() }, now), "accepted");
  assert.equal(internOfferKey({ status: "accepted", hiredAt: new Date(), offerDetails: internship() }, now), "hired");
  assert.equal(internOfferKey({ status: "hired", offerDetails: internship({ startDate: "2026-01-01" }) }, now), "hired");
});

test("closed states pass through", () => {
  for (const s of ["rejected", "withdrawn", "expired"] as const) {
    assert.equal(internOfferKey({ status: s, offerDetails: internship() }, now), s);
    assert.equal(offerGroup(s), "closed");
  }
});

test("Updated badge only on an open offer the employer changed (INW-15)", () => {
  const created = new Date("2026-10-10T10:00:00Z");
  const base = { status: "sent", createdAt: created, offerDetails: internship() };
  assert.equal(offerWasEdited({ ...base, updatedAt: created }), false);
  assert.equal(offerWasEdited({ ...base, updatedAt: new Date(created.getTime() + 5_000) }), false);
  assert.equal(offerWasEdited({ ...base, updatedAt: new Date("2026-10-12T10:00:00Z") }), true);
  assert.equal(offerWasEdited({ ...base, offerDetails: internship({ reopenedAfterEditAt: "2026-10-12T10:00:00Z" }) }), true);
  assert.equal(offerWasEdited({ ...base, status: "accepted", updatedAt: new Date("2026-10-12T10:00:00Z") }), false);
});

test("hybrid split reads both the new and the legacy keys (INW-14)", () => {
  assert.deepEqual(hybridSplit({ wfoDays: 3, wfhDays: 2 }), { office: 3, home: 2 });
  assert.deepEqual(hybridSplit({ workFromOfficeDays: 2, workFromHomeDays: 3 }), { office: 2, home: 3 });
  assert.equal(hybridSplit({}), null);
  assert.equal(hybridSplit(null), null);
});

test("shift times convert to IST on the joining date", () => {
  assert.equal(shiftInIst("09:00", "18:00", "Asia/Kolkata", "2026-11-02"), "9:00 AM - 6:00 PM IST");
  // New York, 9 to 5: EST in November, EDT in July.
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-11-02"), "7:30 PM - 3:30 AM (next day) IST");
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-07-06"), "6:30 PM - 2:30 AM (next day) IST");
  // Dubai, overnight shift.
  assert.equal(shiftInIst("22:00", "06:00", "Asia/Dubai", "2026-11-02"), "11:30 PM - 7:30 AM (next day) IST");
  assert.equal(shiftInIst("", "17:00", "Asia/Kolkata", null), null);
});

test("a shift that crosses midnight in IST moves the joining date and is marked", () => {
  const istDay = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d) : null);
  // New York winter (EST, UTC-5): 9 Nov 2 PM-11 PM is 10 Nov 12:30 AM-9:30 AM IST.
  assert.equal(shiftInIst("14:00", "23:00", "America/New_York", "2026-11-09"), "12:30 AM (next day) - 9:30 AM (next day) IST");
  assert.equal(istDay(joiningInstant("14:00", "23:00", "America/New_York", "2026-11-09")), "2026-11-10");
  // New York summer (EDT, UTC-4): 9 Jul 3 PM-11 PM is 10 Jul 12:30 AM-8:30 AM IST.
  assert.equal(shiftInIst("15:00", "23:00", "America/New_York", "2026-07-09"), "12:30 AM (next day) - 8:30 AM (next day) IST");
  assert.equal(istDay(joiningInstant("15:00", "23:00", "America/New_York", "2026-07-09")), "2026-07-10");
  // Same wall clock on either side of the DST change lands an hour apart in IST.
  assert.equal(shiftInIst("14:00", "23:00", "America/New_York", "2026-07-09"), "11:30 PM - 8:30 AM (next day) IST");
  // An IST employer: no shift, no markers.
  assert.equal(shiftInIst("09:00", "18:00", "Asia/Kolkata", "2026-11-09"), "9:00 AM - 6:00 PM IST");
  assert.equal(istDay(joiningInstant("09:00", "18:00", "Asia/Kolkata", "2026-11-09")), "2026-11-09");
  // East of India: Tokyo 8 AM is 4:30 AM IST the same day; 5 AM is 1:30 AM IST.
  assert.equal(shiftInIst("01:00", "09:00", "Asia/Tokyo", "2026-11-09"), "9:30 PM (previous day) - 5:30 AM IST");
  assert.equal(joiningInstant("", "09:00", "Asia/Tokyo", "2026-11-09"), null);
});
