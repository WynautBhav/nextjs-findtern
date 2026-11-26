import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canCancel, canChoose, checkOffer, firstConflict, isLapsed, isRescheduleRequest, overlaps, reasonProblem, respondByFor, step, viewFor, type Fields, type MeetingState } from "./slots.ts";

const NOW = Date.parse("2026-11-20T06:00:00Z");
const H = 3_600_000;
const at = (hours: number) => new Date(NOW + hours * H);
const asState = (f: Fields): MeetingState => f;
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe("checkOffer", () => {
  it("accepts exactly three future quarter-hour slots and sorts them", () => {
    const r = must(checkOffer([at(30), at(5), at(24)], NOW));
    assert.deepEqual(r.slots.map((d) => d.getTime()), [at(5), at(24), at(30)].map((d) => d.getTime()));
  });
  it("refuses none, one, two and four with need_three_slots", () => {
    const code = (slots: Date[]) => (checkOffer(slots, NOW) as { code: string }).code;
    for (const n of [0, 1, 2, 4]) assert.equal(code(Array.from({ length: n }, (_, k) => at(5 + k))), "need_three_slots", String(n));
  });
  it("refuses past, off-quarter, duplicate and over-a-year", () => {
    const code = (slots: Date[]) => (checkOffer(slots, NOW) as { code: string }).code;
    assert.equal(code([at(-1), at(2), at(3)]), "slot_past");
    assert.equal(code([new Date(NOW + 5 * H + 7 * 60_000), at(6), at(7)]), "not_quarter_hour");
    assert.equal(code([at(5), at(5), at(7)]), "slot_duplicate");
    assert.equal(code([at(5), at(6), at(24 * 400)]), "slot_far");
  });
  it("respondBy is the earliest slot minus 2 h, or the slot itself when that is already past", () => {
    assert.equal(respondByFor([at(10), at(30)], NOW).getTime(), at(8).getTime());
    assert.equal(respondByFor([at(1), at(30)], NOW).getTime(), at(1).getTime());
  });
});

describe("propose -> choose", () => {
  const proposed = must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20), at(30)] }, NOW)).fields;
  it("a new offer is pending, round 1, proposed by the proposer", () => {
    assert.equal(proposed.status, "pending");
    assert.equal(proposed.round, 1);
    assert.equal(proposed.proposedBy, "employer");
    assert.equal(proposed.respondBy?.getTime(), at(8).getTime());
  });
  it("only the other side may pick", () => {
    assert.equal((step(asState(proposed), { type: "choose", by: "employer", slot: 1 }, NOW) as { code: string }).code, "own_offer");
    const r = must(step(asState(proposed), { type: "choose", by: "intern", slot: 2 }, NOW));
    assert.equal(r.fields.status, "scheduled");
    assert.equal(r.fields.selectedSlot, 2);
  });
  it("an intern can never propose: the state machine refuses it", () => {
    assert.equal((step(undefined, { type: "propose", by: "intern", slots: [at(10), at(20), at(30)] }, NOW) as { code: string }).code, "employer_only");
  });
  it("an employer offer of one or two times is refused", () => {
    assert.equal((step(undefined, { type: "propose", by: "employer", slots: [at(10)] }, NOW) as { code: string }).code, "need_three_slots");
    assert.equal((step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20)] }, NOW) as { code: string }).code, "need_three_slots");
  });
  it("a row an intern proposed before this rule is still picked by the employer", () => {
    const old: MeetingState = { status: "pending", proposedBy: "intern", round: 1, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
    assert.equal(must(step(old, { type: "choose", by: "employer", slot: 1 }, NOW)).fields.status, "scheduled");
    assert.equal((step(old, { type: "choose", by: "intern", slot: 1 }, NOW) as { code: string }).code, "own_offer");
  });
  it("a slot that was not offered, or has passed, is refused", () => {
    assert.equal((step(asState(proposed), { type: "choose", by: "intern", slot: 4 }, NOW) as { code: string }).code, "slot_not_offered");
    assert.equal((step(asState(proposed), { type: "choose", by: "intern", slot: 1 }, at(9).getTime()) as { code: string }).code, "lapsed");
  });
  it("a double pick is a 409-style refusal (not_pending)", () => {
    const booked = must(step(asState(proposed), { type: "choose", by: "intern", slot: 1 }, NOW)).fields;
    assert.equal((step(asState(booked), { type: "choose", by: "intern", slot: 2 }, NOW) as { code: string }).code, "not_pending");
  });
});

describe("conflicts", () => {
  it("overlap is strictly less than 30 minutes apart", () => {
    assert.equal(overlaps(at(10).getTime(), at(10).getTime() + 29 * 60_000), true);
    assert.equal(overlaps(at(10).getTime(), at(10).getTime() - 29 * 60_000), true);
    assert.equal(overlaps(at(10).getTime(), at(10).getTime() + 30 * 60_000), false);
  });
  it("a pick that clashes with either party's other meeting is refused; the others still work", () => {
    const f = must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20), at(25)] }, NOW)).fields;
    const busy = [at(10).getTime() + 15 * 60_000];
    assert.equal((step(asState(f), { type: "choose", by: "intern", slot: 1, busy }, NOW) as { code: string }).code, "conflict");
    assert.equal(must(step(asState(f), { type: "choose", by: "intern", slot: 2, busy }, NOW)).fields.selectedSlot, 2);
    assert.equal(firstConflict(at(10).getTime(), []), null);
  });
});

describe("the intern cannot reschedule (the employer re-offers, the intern only picks, declines or cancels)", () => {
  const a = () => must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20), at(30)] }, NOW)).fields;
  // A request an intern made before reschedule was removed: pending, no times, intern-marked. Still shown, and the employer answers it.
  const legacyRequest = (): MeetingState => ({ status: "pending", proposedBy: "intern", round: 2, slot1: null, slot2: null, slot3: null, respondBy: null });
  it("an intern reschedule request is refused on an open offer, a booked meeting and a lapsed offer; nothing changes", () => {
    const booked = must(step(asState(a()), { type: "choose", by: "intern", slot: 1 }, NOW)).fields;
    for (const s of [asState(a()), asState(booked), { ...asState(a()), respondBy: at(-1) }]) {
      const r = step(s, { type: "request_reschedule", by: "intern", reason: "Exam that day" }, NOW) as { ok: boolean; code: string };
      assert.equal(r.ok, false);
      assert.equal(r.code, "intern_reschedule_removed");
    }
  });
  it("it is refused for the employer too, and on a closed meeting", () => {
    assert.equal((step(asState(a()), { type: "request_reschedule", by: "employer" }, NOW) as { code: string }).code, "intern_reschedule_removed");
    assert.equal((step(asState({ ...a(), status: "cancelled" }), { type: "request_reschedule", by: "intern" }, NOW) as { code: string }).code, "intern_reschedule_removed");
  });
  it("the intern cannot offer times by any route", () => {
    assert.equal((step(asState(a()), { type: "reschedule", by: "intern", slots: [at(40), at(41), at(42)] }, NOW) as { code: string }).code, "employer_only");
  });
  it("an old request still reads as a request: nobody can choose from it; the employer re-offers exactly three (round + 1, back to employer, note cleared)", () => {
    const b = legacyRequest();
    assert.equal(isRescheduleRequest(b), true);
    assert.equal((step(b, { type: "choose", by: "employer", slot: 1 }, NOW) as { code: string }).code, "awaiting_times");
    assert.equal((step(b, { type: "reschedule", by: "employer", slots: [at(40), at(41)] }, NOW) as { code: string }).code, "need_three_slots");
    const c = must(step(b, { type: "reschedule", by: "employer", slots: [at(40), at(41), at(42)] }, NOW)).fields;
    assert.equal(c.proposedBy, "employer");
    assert.equal(c.round, 3);
    assert.equal(c.cancelReason, null);
    assert.equal(must(step(asState(c), { type: "choose", by: "intern", slot: 2 }, NOW)).fields.status, "scheduled");
  });
  it("the employer's re-offer is checked for clashes like a new one", () => {
    const r = step(legacyRequest(), { type: "reschedule", by: "employer", slots: [at(40), at(41), at(42)], busy: [at(41).getTime()] }, NOW) as { code: string };
    assert.equal(r.code, "conflict");
  });
});

describe("expire", () => {
  const open: MeetingState = { status: "pending", proposedBy: "employer", round: 1, slot1: at(10), slot2: at(20), slot3: null, respondBy: at(8) };
  it("lapses at respondBy even though a slot is still ahead", () => {
    assert.equal(isLapsed(open, at(7).getTime()), false);
    assert.equal(isLapsed(open, at(8).getTime()), true);
    assert.equal(must(step(open, { type: "expire" }, at(9).getTime())).fields.status, "expired");
  });
  it("legacy rows (no respondBy) lapse when every slot has started", () => {
    const legacy: MeetingState = { status: "pending", slot1: at(10), slot2: at(20), slot3: null };
    assert.equal(isLapsed(legacy, at(15).getTime()), false);
    assert.equal(isLapsed(legacy, at(21).getTime()), true);
  });
  it("a booked or already-decided meeting never lapses; a lapsed offer cannot be picked", () => {
    assert.equal(isLapsed({ ...open, status: "scheduled", selectedSlot: 1 }, at(99).getTime()), false);
    assert.equal((step(open, { type: "expire" }, NOW) as { code: string }).code, "not_lapsed");
    assert.equal((canChoose(open, "intern", at(9).getTime()) as { code: string }).code, "lapsed");
  });
});

describe("cancel and reschedule", () => {
  const booked: MeetingState = { status: "scheduled", proposedBy: "employer", round: 1, slot1: at(10), slot2: null, slot3: null, selectedSlot: 1 };
  it("either side cancels with a reason; the reason is stored trimmed and the actor recorded", () => {
    for (const by of ["employer", "intern"] as const) {
      const f = must(step(booked, { type: "cancel", by, reason: "  Clash with an exam  " }, NOW)).fields;
      assert.equal(f.status, "cancelled");
      assert.equal(f.cancelledBy, by);
      assert.equal(f.cancelReason, "Clash with an exam");
    }
  });
  it("a reason is optional: blank cancels with no reason stored; a typed one is a few words, at most 300 characters", () => {
    const f = must(step(booked, { type: "cancel", by: "employer", reason: "  " }, NOW)).fields;
    assert.equal(f.status, "cancelled");
    assert.equal(f.cancelReason, null);
    assert.equal(reasonProblem(undefined), null);
    assert.equal(reasonProblem(""), null);
    assert.notEqual(reasonProblem("ok"), null);
    assert.notEqual(reasonProblem("x".repeat(301)), null);
    assert.equal(reasonProblem("Not available"), null);
  });
  it("a reason keeps its line breaks (trimmed at the ends only)", () => {
    const f = must(step(booked, { type: "cancel", by: "intern", reason: " Exam clash.\nCan we talk next week? " }, NOW)).fields;
    assert.equal(f.cancelReason, "Exam clash.\nCan we talk next week?");
  });
  it("cannot cancel once started or when already closed", () => {
    assert.equal((canCancel(booked, at(10).getTime()) as { code: string }).code, "started");
    assert.equal((canCancel({ ...booked, status: "completed" }, NOW) as { code: string }).code, "not_open");
  });
  it("the employer reschedules a booked meeting with three new times (round + 1, proposer employer); the intern cannot", () => {
    const f = must(step(booked, { type: "reschedule", by: "employer", slots: [at(50), at(51), at(52)] }, NOW)).fields;
    assert.equal(f.status, "pending");
    assert.equal(f.proposedBy, "employer");
    assert.equal(f.round, 2);
    assert.equal(f.selectedSlot, null);
    assert.equal((step(booked, { type: "reschedule", by: "intern", slots: [at(50), at(51), at(52)] }, NOW) as { code: string }).code, "employer_only");
  });
  it("on an open offer the employer revises with three new times", () => {
    const open: MeetingState = { status: "pending", proposedBy: "employer", round: 2, slot1: at(10), slot2: at(11), slot3: at(12), respondBy: at(8) };
    assert.equal(must(step(open, { type: "reschedule", by: "employer", slots: [at(20), at(21), at(22)] }, NOW)).fields.round, 3);
  });
});

describe("viewFor", () => {
  const open: MeetingState = { status: "pending", proposedBy: "employer", round: 1, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
  it("tells each side whose turn it is", () => {
    assert.equal(viewFor(open, "intern", NOW).turn, "yours");
    assert.equal(viewFor(open, "employer", NOW).turn, "theirs");
    assert.equal(viewFor(open, "intern", NOW).canReschedule, false);
    assert.equal(viewFor(open, "employer", NOW).canReschedule, true);
    assert.equal(viewFor(open, "employer", NOW).canChoose, false);
    assert.equal(viewFor({ ...open, status: "scheduled", selectedSlot: 1 }, "intern", NOW).turn, "none");
    assert.equal(viewFor(open, "intern", at(9).getTime()).lapsed, true);
  });
  it("an old reschedule request is the employer's move, not the intern's", () => {
    const req: MeetingState = { status: "pending", proposedBy: "intern", round: 2, slot1: null, slot2: null, slot3: null, respondBy: null };
    assert.equal(viewFor(req, "intern", NOW).requested, true);
    assert.equal(viewFor(req, "intern", NOW).canChoose, false);
    assert.equal(viewFor(req, "intern", NOW).canCancel, true);
    assert.equal(viewFor(req, "employer", NOW).canReschedule, true);
  });
});
