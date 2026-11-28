import assert from "node:assert/strict";
import { test } from "node:test";

import { meetingTrack } from "./offer-track.ts";

const intern = { offerDetails: { monthlyAmount: 26400, duration: "3m" }, currency: "INR" };
const ft = { offerDetails: { fullTimeOffer: { annualCtc: 650000 } }, currency: "INR" };

test("meetingTrack: linked offer > drive kind > Internship; the project's after-internship flag never decides", () => {
  assert.deepEqual(meetingTrack(null, null, true), { track: "internship", ftAfterInternship: true });
  assert.deepEqual(meetingTrack(null, null, false), { track: "internship", ftAfterInternship: false });
  assert.deepEqual(meetingTrack(null, "full_time", false), { track: "full_time", ftAfterInternship: false });
  assert.deepEqual(meetingTrack(null, "internship", true), { track: "internship", ftAfterInternship: true });
  assert.deepEqual(meetingTrack(intern, "full_time", true), { track: "internship", ftAfterInternship: true });
  assert.deepEqual(meetingTrack(ft, "internship", false), { track: "full_time", ftAfterInternship: false });
});
