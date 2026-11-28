import test from "node:test";
import assert from "node:assert/strict";

import {
  employerMetrics,
  funnel,
  initials,
  stackOf,
  isIndianEmployer,
  offerReply,
  pct,
  studentMetrics,
  trackCounts,
  trackOf,
  type BoardEmployer,
  type BoardMeeting,
  type BoardOffer,
  type BoardStudent,
} from "./dashboard-board-pure.ts";

const student = (id: string, o: Partial<BoardStudent> = {}): BoardStudent => ({
  id, name: id, email: `${id}@x.in`, phone: null, college: null, collegeId: null, year: null, branch: null, createdAt: null,
  lastSeenAt: null, activityHidden: false, online: false, track: null, profilePct: 0, profileComplete: false, aiStatus: "not_applied",
  pendingPayment: false, cgpaPending: false, openToWork: true, collegeLinked: false, membership: null, guarantee: null, score: null, ...o,
});
const offer = (id: string, internId: string, o: Partial<BoardOffer> = {}): BoardOffer => ({
  id, internId, employerId: "e-in", employer: "E", track: "internship", status: "sent", reply: "pending", hired: false, roleTitle: null, createdAt: null, ...o,
});
const meeting = (id: string, internId: string, stage: BoardMeeting["stage"]): BoardMeeting => ({ id, internId, employerId: "e-in", employer: "E", stage, startsAt: null });
const employer = (id: string, o: Partial<BoardEmployer> = {}): BoardEmployer => ({
  id, company: id, contact: null, email: null, phone: null, city: null, country: "India", indian: true, size: null, onboarded: false,
  viaDrive: false, inDriveNow: false, fte: "none", createdAt: null, ...o,
});

test("trackOf: a coding rating is tech, scored without one is non-tech, not scored is unknown", () => {
  assert.equal(trackOf({ ratings: { coding: 6, aptitude: 7 }, findternScore: 7 }), "tech");
  assert.equal(trackOf({ ratings: { communication: 8, aptitude: 7 }, findternScore: 7 }), "non_tech");
  assert.equal(trackOf({ ratings: { coding: "7" }, findternScore: 7 }), "non_tech"); // only a number counts
  assert.equal(trackOf({}), null);
  assert.equal(trackOf(null), null);
});

test("isIndianEmployer: by country, else by the +91 code", () => {
  assert.equal(isIndianEmployer("India", "+1"), true);
  assert.equal(isIndianEmployer(" india ", null), true);
  assert.equal(isIndianEmployer("Singapore", "+91"), false);
  assert.equal(isIndianEmployer(null, "+91"), true);
  assert.equal(isIndianEmployer("", "+44"), false);
});

test("offerReply: hired counts as accepted; sent and interview_scheduled wait for a reply", () => {
  assert.equal(offerReply("hired", true), "accepted");
  assert.equal(offerReply("accepted", false), "accepted");
  // processing = the student said yes and the employer is paying; completed = the internship finished. Neither waits.
  assert.equal(offerReply("processing", false), "accepted");
  assert.equal(offerReply("completed", false), "accepted");
  assert.equal(offerReply("sent", false), "pending");
  assert.equal(offerReply("interview_scheduled", false), "pending");
  assert.equal(offerReply("rejected", false), "rejected");
  assert.equal(offerReply("expired", false), "expired");
  assert.equal(offerReply("withdrawn", false), "withdrawn");
});

const data = () => ({
  students: [
    student("a", { track: "tech", aiStatus: "completed", profileComplete: true, guarantee: "active", collegeLinked: true }),
    student("b", { track: "non_tech", aiStatus: "completed", profileComplete: true, guarantee: "none", openToWork: false, online: true }),
    student("c", { track: "tech", aiStatus: "completed", guarantee: "ended", cgpaPending: true }),
    student("d", { aiStatus: "applied", pendingPayment: true }),
    student("e", { aiStatus: "scheduled" }),
  ],
  offers: [
    offer("o1", "a", { reply: "accepted", hired: true, status: "hired" }),
    offer("o2", "b", { track: "full_time", reply: "accepted", hired: true, status: "hired", employerId: "e-sg" }),
    offer("o3", "c", { reply: "rejected", status: "rejected" }),
    offer("o4", "c", { track: "full_time", reply: "rejected", status: "rejected" }),
    offer("o5", "a", { reply: "expired", status: "expired" }),
    offer("o6", "c", { reply: "pending" }),
  ],
  meetings: [meeting("m1", "a", "completed"), meeting("m2", "c", "expired"), meeting("m3", "b", "sent")],
  employers: [employer("e-in"), employer("e-sg", { country: "Singapore", indian: false })],
});

test("studentMetrics: every count is its list, and the pairs split their whole", () => {
  const m = studentMetrics(data());
  const n = (k: keyof typeof m) => m[k].ids.length;
  assert.equal(n("signedUp"), 5);
  assert.equal(n("profileComplete"), 2);
  assert.equal(n("aiApplied"), 5 - 0); // applied, scheduled and the three completed
  assert.equal(n("pendingPayment"), 1);
  assert.equal(n("aiScheduled"), 1);
  assert.equal(n("aiInterviewed"), 3);
  assert.equal(n("openToWork") + n("hidden"), n("signedUp"));
  assert.equal(n("collegeLinked") + n("individual"), n("signedUp"));
  assert.equal(n("onlineNow"), 1);
  assert.equal(n("cgpaPending"), 1);
  assert.deepEqual(m.offersAwaiting.ids, ["o6"]);
  assert.deepEqual(m.meetingsAwaiting.ids, ["m3"]);
  assert.deepEqual([m.meetsCompleted.ids, m.meetsExpired.ids], [["m1"], ["m2"]]);
  assert.deepEqual([m.internshipAccepted.ids, m.internshipRejected.ids], [["o1"], ["o3"]]);
  assert.deepEqual([m.fullTimeAccepted.ids, m.fullTimeRejected.ids], [["o2"], ["o4"]]);
  assert.deepEqual(m.offersExpired.ids, ["o5"]);
  assert.deepEqual([m.hiredInternship.ids, m.hiredFullTime.ids], [["a"], ["b"]]);
  assert.equal(n("hiredInternship") + n("hiredFullTime"), n("hired"));
  assert.deepEqual([m.workIndia.ids, m.workAbroad.ids], [["a"], ["b"]]);
  assert.equal(n("workIndia") + n("workAbroad"), n("hired"));
  assert.deepEqual([m.guaranteeActive.ids, m.guaranteeEnded.ids, m.guaranteeNone.ids], [["a"], ["c"], ["b"]]);
  assert.equal(n("guaranteeActive") + n("guaranteeEnded") + n("guaranteeNone"), n("aiInterviewed"));
  assert.equal(m.offersAwaiting.kind, "offers");
  assert.equal(m.meetsCompleted.kind, "meetings");
});

test("studentMetrics: the tech filter narrows students and their offers and meetings", () => {
  const m = studentMetrics(data(), "tech");
  assert.deepEqual(m.signedUp.ids, ["a", "c"]);
  assert.deepEqual(m.internshipRejected.ids, ["o3"]);
  assert.deepEqual(m.fullTimeAccepted.ids, []); // b's offer is non-tech
  assert.deepEqual(m.meetingsAwaiting.ids, []);
  const nt = studentMetrics(data(), "non_tech");
  assert.deepEqual(nt.signedUp.ids, ["b"]);
  assert.deepEqual(nt.workAbroad.ids, ["b"]);
});

test("trackCounts: tech + non-tech + not yet interviewed = all", () => {
  assert.deepEqual(trackCounts(data().students), { all: 5, tech: 2, non_tech: 1, unknown: 2 });
});

test("employerMetrics: pairs split the signups, sizes cover every employer, offers count proposals", () => {
  const employers = [
    employer("e1", { onboarded: true, viaDrive: true, inDriveNow: true, size: "11-50", fte: "approved" }),
    employer("e2", { onboarded: true, size: "1000+", fte: "applied", indian: false, country: "UAE" }),
    employer("e3", { size: "weird" }),
  ];
  const m = employerMetrics({ employers, offers: data().offers });
  assert.equal(m.signedUp.ids.length, 3);
  assert.equal(m.onboarded.ids.length, 2);
  assert.deepEqual([m.viaDrive.ids, m.direct.ids], [["e1"], ["e2", "e3"]]);
  assert.deepEqual([m.indian.ids, m.foreign.ids], [["e1", "e3"], ["e2"]]);
  assert.deepEqual(m.inDriveNow.ids, ["e1"]);
  assert.deepEqual([m.fteApproved.ids, m.fteRequested.ids], [["e1"], ["e2"]]);
  assert.equal(m.sizes.reduce((s, b) => s + b.list.ids.length, 0), 3);
  assert.deepEqual(m.sizes.find((b) => b.bucket === "Not given")!.list.ids, ["e3"]);
  assert.deepEqual([m.internshipOffers.ids.length, m.fullTimeOffers.ids.length], [4, 2]);
  assert.deepEqual([m.hiredInternship.ids, m.hiredFullTime.ids], [["o1"], ["o2"]]);
});

test("employerMetrics: the journey counts companies, each stop inside the one before", () => {
  const employers = [employer("e-in", { onboarded: true }), employer("e-sg", { onboarded: true, indian: false }), employer("e-x")];
  const m = employerMetrics({ employers, offers: data().offers });
  assert.deepEqual(m.sentOffer.ids, ["e-in", "e-sg"]);
  assert.deepEqual(m.madeHire.ids, ["e-in", "e-sg"]);
  assert.deepEqual([m.hiredOnInternship.ids, m.hiredOnFullTime.ids], [["e-in"], ["e-sg"]]);
  // a company with offers but no hire is not in madeHire
  const m2 = employerMetrics({ employers, offers: data().offers.filter((o) => o.id !== "o2") });
  assert.deepEqual(m2.madeHire.ids, ["e-in"]);
  assert.deepEqual(m2.sentOffer.ids, ["e-in"]);
});

test("pct: null on a zero base", () => {
  assert.equal(pct(1, 0), null);
  assert.equal(pct(1, 3), 33);
});

test("studentMetrics: each offer type splits its total into accepted, rejected, expired, withdrawn and waiting", () => {
  const offers = [
    offer("i1", "a", { reply: "accepted" }),
    offer("i2", "a", { reply: "accepted" }),
    offer("i3", "a", { reply: "rejected" }),
    offer("i4", "a", { reply: "expired" }),
    offer("i5", "a", { reply: "withdrawn" }),
    offer("i6", "a", { reply: "pending" }),
    offer("f1", "a", { track: "full_time", reply: "withdrawn" }),
    offer("f2", "a", { track: "full_time", reply: "accepted" }),
    offer("x1", "nobody", { reply: "accepted" }), // not one of the students: left out
  ];
  const m = studentMetrics({ students: [student("a")], offers, meetings: [], employers: [] });
  assert.deepEqual(m.internshipAll.ids, ["i1", "i2", "i3", "i4", "i5", "i6"]);
  assert.deepEqual(
    [m.internshipAccepted.ids, m.internshipRejected.ids, m.internshipExpired.ids, m.internshipWithdrawn.ids, m.internshipWaiting.ids],
    [["i1", "i2"], ["i3"], ["i4"], ["i5"], ["i6"]],
  );
  assert.deepEqual([m.fullTimeAll.ids, m.fullTimeWithdrawn.ids, m.fullTimeExpired.ids], [["f1", "f2"], ["f1"], []]);
  for (const t of ["internship", "fullTime"] as const) {
    const parts = (["Accepted", "Rejected", "Expired", "Withdrawn", "Waiting"] as const).reduce((s, k) => s + m[`${t}${k}`].ids.length, 0);
    assert.equal(parts, m[`${t}All`].ids.length, `${t} parts add up to the total`);
  }
});

test("initials: letters and digits only, so brackets and dots never show", () => {
  assert.equal(initials("Acme (Test)"), "AT");
  assert.equal(initials("Meridian Labs (old)"), "MO");
  assert.equal(initials("(Beta) Corp"), "BC");
  assert.equal(initials("ishita"), "I");
  assert.equal(initials("  "), "·");
});

test("stackOf: at most 10 blocks, the 10th becomes +N when more are left", () => {
  const ids = (k: number) => Array.from({ length: k }, (_, i) => `e${i}`);
  assert.deepEqual(stackOf(ids(3)), { shown: ids(3), more: 0 });
  assert.deepEqual(stackOf(ids(10)), { shown: ids(10), more: 0 });
  assert.deepEqual(stackOf(ids(24)), { shown: ids(9), more: 15 });
  assert.equal(stackOf(ids(24)).shown.length + 1, 10);
});

test("funnel: a station counts everyone who got this far, so stopped always equals waiting", () => {
  // c and d finished the AI interview without a complete profile; e is only signed up.
  const f = funnel([
    ["a", "b", "c", "d", "e"], // signed up
    ["a", "b"], // profile complete
    ["a", "c", "d"], // AI interviewed
    ["c"], // hired
  ]);
  assert.deepEqual(f.map((s) => s.reached.length), [5, 4, 3, 1]);
  assert.deepEqual(f[1].reached, ["a", "b", "c", "d"]);
  assert.deepEqual(f[1].skipped, ["c", "d"]); // moved on without a complete profile
  assert.deepEqual(f.map((s) => s.waiting), [["e"], ["b"], ["a", "d"], []]);
  for (let i = 0; i < f.length - 1; i++) {
    assert.equal(f[i].reached.length - f[i + 1].reached.length, f[i].waiting.length, `stop ${i}: drop = waiting`);
    assert.ok(f[i + 1].reached.every((id) => f[i].reached.includes(id)), `stop ${i + 1} is inside stop ${i}`);
  }
  // A clean, nested funnel is unchanged.
  const clean = funnel([["a", "b"], ["a"]]);
  assert.deepEqual([clean[0].reached, clean[0].skipped, clean[1].reached], [["a", "b"], [], ["a"]]);
});
