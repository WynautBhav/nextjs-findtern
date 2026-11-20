import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canCancel, canChoose, canCounter, checkOffer, firstConflict, isLapsed, MAX_ROUNDS, overlaps, reasonProblem, respondByFor, step, viewFor, type Fields, type MeetingState } from "./slots.ts";

const NOW = Date.parse("2026-11-20T06:00:00Z");
const H = 3_600_000;
const at = (hours: number) => new Date(NOW + hours * H);
const asState = (f: Fields): MeetingState => f;
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe("checkOffer", () => {
  it("accepts 1-3 future quarter-hour slots and sorts them", () => {
    const r = must(checkOffer([at(30), at(5), at(24)], NOW));
    assert.deepEqual(r.slots.map((d) => d.getTime()), [at(5), at(24), at(30)].map((d) => d.getTime()));
    assert.equal(checkOffer([at(5)], NOW).ok, true);
  });
  it("refuses none, four, past, off-quarter, duplicate and over-a-year", () => {
    const code = (slots: Date[]) => (checkOffer(slots, NOW) as { code: string }).code;
    assert.equal(code([]), "no_slots");
    assert.equal(code([at(1), at(2), at(3), at(4)]), "too_many_slots");
    assert.equal(code([at(-1)]), "slot_past");
    assert.equal(code([new Date(NOW + 5 * H + 7 * 60_000)]), "not_quarter_hour");
    assert.equal(code([at(5), at(5)]), "slot_duplicate");
    assert.equal(code([at(24 * 400)]), "slot_far");
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
  it("an intern-proposed offer is picked by the employer", () => {
    const f = must(step(undefined, { type: "propose", by: "intern", slots: [at(10)] }, NOW)).fields;
    assert.equal(f.proposedBy, "intern");
    assert.equal(must(step(asState(f), { type: "choose", by: "employer", slot: 1 }, NOW)).fields.status, "scheduled");
    assert.equal((step(asState(f), { type: "choose", by: "intern", slot: 1 }, NOW) as { code: string }).code, "own_offer");
  });
  it("a slot that was not offered, or has passed, is refused", () => {
    const two = must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20)] }, NOW)).fields;
    assert.equal((step(asState(two), { type: "choose", by: "intern", slot: 3 }, NOW) as { code: string }).code, "slot_not_offered");
    assert.equal((step(asState(two), { type: "choose", by: "intern", slot: 1 }, at(9).getTime()) as { code: string }).code, "lapsed");
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
    const f = must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20)] }, NOW)).fields;
    const busy = [at(10).getTime() + 15 * 60_000];
    assert.equal((step(asState(f), { type: "choose", by: "intern", slot: 1, busy }, NOW) as { code: string }).code, "conflict");
    assert.equal(must(step(asState(f), { type: "choose", by: "intern", slot: 2, busy }, NOW)).fields.selectedSlot, 2);
    assert.equal(firstConflict(at(10).getTime(), []), null);
  });
});

describe("counter-offers", () => {
  it("flips the proposer, adds a round and replaces the slots", () => {
    const a = must(step(undefined, { type: "propose", by: "employer", slots: [at(10), at(20), at(30)] }, NOW)).fields;
    const b = must(step(asState(a), { type: "counter", by: "intern", slots: [at(40), at(41)] }, NOW)).fields;
    assert.equal(b.proposedBy, "intern");
    assert.equal(b.round, 2);
    assert.equal(b.status, "pending");
    assert.equal(b.slot3, null);
    // now the employer answers, the intern cannot counter their own offer
    assert.equal((step(asState(b), { type: "counter", by: "intern", slots: [at(50)] }, NOW) as { code: string }).code, "own_offer");
    const c = must(step(asState(b), { type: "counter", by: "employer", slots: [at(60)] }, NOW)).fields;
    assert.equal(c.round, 3);
    assert.equal(c.proposedBy, "employer");
  });
  it(`the ${MAX_ROUNDS}rd round cannot be countered; picking still works`, () => {
    const last: MeetingState = { status: "pending", proposedBy: "employer", round: MAX_ROUNDS, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
    assert.equal((canCounter(last, "intern", NOW) as { code: string }).code, "max_rounds");
    assert.equal(canChoose(last, "intern", NOW).ok, true);
  });
  it("an empty or invalid counter is refused and changes nothing", () => {
    const a: MeetingState = { status: "pending", proposedBy: "employer", round: 1, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
    assert.equal((step(a, { type: "counter", by: "intern", slots: [] }, NOW) as { code: string }).code, "no_slots");
    assert.equal((step(a, { type: "counter", by: "intern", slots: [at(-2)] }, NOW) as { code: string }).code, "slot_past");
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
  it("a booked or already-decided meeting never lapses; a lapsed offer cannot be picked or countered", () => {
    assert.equal(isLapsed({ ...open, status: "scheduled", selectedSlot: 1 }, at(99).getTime()), false);
    assert.equal((step(open, { type: "expire" }, NOW) as { code: string }).code, "not_lapsed");
    assert.equal((canChoose(open, "intern", at(9).getTime()) as { code: string }).code, "lapsed");
    assert.equal((canCounter(open, "intern", at(9).getTime()) as { code: string }).code, "lapsed");
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
  it("a reason is required", () => {
    assert.equal((step(booked, { type: "cancel", by: "intern", reason: " " }, NOW) as { code: string }).code, "reason_required");
    assert.notEqual(reasonProblem("x".repeat(301)), null);
    assert.equal(reasonProblem("Not available"), null);
  });
  it("cannot cancel once started or when already closed", () => {
    assert.equal((canCancel(booked, at(10).getTime()) as { code: string }).code, "started");
    assert.equal((canCancel({ ...booked, status: "completed" }, NOW) as { code: string }).code, "not_open");
  });
  it("either side may reschedule a booked meeting (new offer, round 1, proposer = the mover)", () => {
    const f = must(step(booked, { type: "reschedule", by: "intern", slots: [at(50)] }, NOW)).fields;
    assert.equal(f.status, "pending");
    assert.equal(f.proposedBy, "intern");
    assert.equal(f.round, 1);
    assert.equal(f.selectedSlot, null);
  });
  it("on an open offer only its proposer revises (same round); the other side counters instead", () => {
    const open: MeetingState = { status: "pending", proposedBy: "employer", round: 2, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
    assert.equal(must(step(open, { type: "reschedule", by: "employer", slots: [at(12)] }, NOW)).fields.round, 2);
    assert.equal((step(open, { type: "reschedule", by: "intern", slots: [at(12)] }, NOW) as { code: string }).code, "use_counter");
  });
});

describe("viewFor", () => {
  const open: MeetingState = { status: "pending", proposedBy: "employer", round: 1, slot1: at(10), slot2: null, slot3: null, respondBy: at(8) };
  it("tells each side whose turn it is", () => {
    assert.equal(viewFor(open, "intern", NOW).turn, "yours");
    assert.equal(viewFor(open, "employer", NOW).turn, "theirs");
    assert.equal(viewFor(open, "intern", NOW).canCounter, true);
    assert.equal(viewFor(open, "employer", NOW).canChoose, false);
    assert.equal(viewFor({ ...open, status: "scheduled", selectedSlot: 1 }, "intern", NOW).turn, "none");
    assert.equal(viewFor(open, "intern", at(9).getTime()).lapsed, true);
  });
});
