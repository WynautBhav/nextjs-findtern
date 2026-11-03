import assert from "node:assert/strict";
import { test } from "node:test";

import { canDecide, hybridSplit, internOfferKey, joiningDayIst, joiningInstant, offerGroup, offerWasEdited, shiftInIst } from "./intern-offer-view.ts";

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

test("shift times convert to IST on the joining date, marked like the employer side", () => {
  assert.equal(shiftInIst("09:00", "18:00", "Asia/Kolkata", "2026-11-02"), "9:00 am – 6:00 pm IST");
  // New York, 9 to 5: EST in November, EDT in July.
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-11-02"), "7:30 pm – 3:30 am (next day) IST");
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-07-06"), "6:30 pm – 2:30 am (next day) IST");
  // Dubai, overnight shift.
  assert.equal(shiftInIst("22:00", "06:00", "Asia/Dubai", "2026-11-02"), "11:30 pm – 7:30 am (next day) IST");
  assert.equal(shiftInIst("", "17:00", "Asia/Kolkata", null), null);
});

test("the start is never marked; the end only when its IST day differs from the start's", () => {
  const istDay = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d) : null);
  // New York winter (EST): 9 Nov 2 PM-11 PM is 10 Nov 12:30 AM-9:30 AM IST: both on the same IST day, so no marker.
  assert.equal(shiftInIst("14:00", "23:00", "America/New_York", "2026-11-09"), "12:30 am – 9:30 am IST");
  assert.equal(istDay(joiningInstant("14:00", "23:00", "America/New_York", "2026-11-09")), "2026-11-10");
  // New York summer (EDT): 9 Jul 3 PM-11 PM is 10 Jul 12:30 AM-8:30 AM IST.
  assert.equal(shiftInIst("15:00", "23:00", "America/New_York", "2026-07-09"), "12:30 am – 8:30 am IST");
  assert.equal(istDay(joiningInstant("15:00", "23:00", "America/New_York", "2026-07-09")), "2026-07-10");
  // Same wall clock on either side of the DST change lands an hour apart in IST; this one crosses IST midnight.
  assert.equal(shiftInIst("14:00", "23:00", "America/New_York", "2026-07-09"), "11:30 pm – 8:30 am (next day) IST");
  // An IST employer: no shift, no markers.
  assert.equal(shiftInIst("09:00", "18:00", "Asia/Kolkata", "2026-11-09"), "9:00 am – 6:00 pm IST");
  assert.equal(istDay(joiningInstant("09:00", "18:00", "Asia/Kolkata", "2026-11-09")), "2026-11-09");
  // East of India: Tokyo 1 AM-9 AM is 9:30 PM the day before to 5:30 AM IST. The start is not marked "(previous day)".
  assert.equal(shiftInIst("01:00", "09:00", "Asia/Tokyo", "2026-11-09"), "9:30 pm – 5:30 am (next day) IST");
  assert.equal(istDay(joiningInstant("01:00", "09:00", "Asia/Tokyo", "2026-11-09")), "2026-11-08");
  assert.equal(joiningInstant("", "09:00", "Asia/Tokyo", "2026-11-09"), null);
});

test("there is no joining date without a real start date", () => {
  assert.equal(joiningInstant("09:00", "17:00", "Asia/Tokyo", null), null);
  assert.equal(joiningInstant("09:00", "17:00", "Asia/Tokyo", "TBD"), null);
  assert.equal(joiningDayIst("09:00", "17:00", "Asia/Tokyo", null), null);
  assert.equal(joiningDayIst("09:00", "17:00", "Asia/Tokyo", "TBD"), null);
  assert.equal(joiningDayIst("14:00", "23:00", "America/New_York", "2026-11-09"), "2026-11-10");
});

test("an invalid clock time is rejected, not rolled into the next day", () => {
  assert.equal(joiningInstant("25:00", "17:00", "Asia/Kolkata", "2026-11-09"), null);
  assert.equal(shiftInIst("09:00", "09:60", "Asia/Kolkata", "2026-11-09"), null);
  assert.equal(shiftInIst("9:00", "17:00", "Asia/Kolkata", "2026-11-09"), "9:00 am – 5:00 pm IST");
});

test("DST change days: the zone's offset on that day applies", () => {
  // Fall back, 1 Nov 2026 (NY): 9-5 is EST all day (UTC-5) after the 2 AM change; 1:30 AM is the first (EDT) occurrence.
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-11-01"), "7:30 pm – 3:30 am (next day) IST");
  assert.equal(shiftInIst("01:30", "03:30", "America/New_York", "2026-11-01"), "11:00 am – 2:00 pm IST");
  // Spring forward, 8 Mar 2026 (NY): 9-5 is EDT (UTC-4).
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-03-08"), "6:30 pm – 2:30 am (next day) IST");
  // 2:30 AM does not exist that day. It is pinned as read today (as 1:30 AM EST, 12:00 pm IST), not rejected.
  assert.equal(shiftInIst("02:30", "04:00", "America/New_York", "2026-03-08"), "12:00 pm – 1:30 pm IST");
});
