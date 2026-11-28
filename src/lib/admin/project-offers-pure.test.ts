import assert from "node:assert/strict";
import { test } from "node:test";

import { filterOffers, offersCsvFilename, offerBucket, offerChips, offerCounts, offerKind, offerPdf, offersCsv, type OfferListRow } from "./project-offers-pure.ts";

const now = new Date("2026-11-28T06:00:00Z");
const future = { startDate: "2099-01-01", monthlyAmount: 26400, duration: "3m" };

test("offerKind: internship, full-time, PPO", () => {
  assert.equal(offerKind(future, "INR"), "Internship");
  assert.equal(offerKind({ fullTimeOffer: { annualCtc: 600000 } }, "INR"), "Full-time");
  assert.equal(offerKind({ fullTimeOffer: { annualCtc: 600000, baseProposalId: "p0" } }, "INR"), "PPO");
});

test("offerPdf: only a full-time offer with an uploaded letter has a PDF, whatever its status", () => {
  assert.deepEqual(offerPdf(future, "INR"), { available: false, reason: "Internship offers have no PDF letter" });
  assert.deepEqual(offerPdf({ fullTimeOffer: { annualCtc: 600000 } }, "INR"), { available: false, reason: "No offer letter was uploaded" });
  assert.deepEqual(offerPdf({ fullTimeOffer: { annualCtc: 600000, offerLetterKey: "letters/a.pdf" } }, "INR"), { available: true });
  assert.deepEqual(offerPdf({ fullTimeOffer: { offerLetterUrl: "/uploads/b.pdf" } }, "INR"), { available: true });
});

test("row counts equal the pop-up rows and the Hired chip (not 1 of 1); drafts never count", () => {
  const raw = [
    { status: "sent", hiredAt: null, offerDetails: future, currency: "INR" },
    { status: "hired", hiredAt: new Date("2026-11-01"), offerDetails: future, currency: "INR" },
    { status: "completed", hiredAt: null, offerDetails: future, currency: "INR" },
    { status: "rejected", hiredAt: null, offerDetails: future, currency: "INR" },
    { status: "withdrawn", hiredAt: null, offerDetails: future, currency: "INR" },
    { status: "accepted", hiredAt: null, offerDetails: future, currency: "INR" },
    { status: "draft", hiredAt: null, offerDetails: future, currency: "INR" },
  ];
  const rows = raw.flatMap((r) => {
    const bucket = offerBucket(r, now);
    return bucket ? [{ bucket }] : [];
  });
  const counts = offerCounts(rows);
  assert.deepEqual(counts, { sent: 6, hires: 2 });
  const chips = offerChips(rows);
  assert.equal(chips[0]!.count, counts.sent);
  assert.equal(chips.find((c) => c.key === "hired")!.count, counts.hires);
  for (const c of chips) assert.equal(filterOffers(rows, c.key).length, c.count);
  assert.equal(chips.reduce((n, c) => (c.key === "all" ? n : n + c.count), 0), counts.sent);
});

test("offersCsv: the pop-up's columns for the rows given, formula-safe", () => {
  const rows: OfferListRow[] = [
    { candidate: "Asha Rao", email: "asha@x.in", phone: "+91 98765 43210", kind: "Internship", bucket: "hired", pay: "Stipend ₹13,200/mo", sent: "27 Nov 2026" },
    { candidate: "=cmd", email: null, phone: null, kind: "PPO", bucket: "pending", pay: "CTC ₹6,00,000", sent: "28 Nov 2026" },
  ];
  const csv = offersCsv(rows);
  assert.deepEqual(csv[0], ["Student", "Email", "Phone", "Offer type", "Outcome", "Pay", "Sent"]);
  assert.equal(csv.length, 3);
  assert.deepEqual(csv[1], ["Asha Rao", "asha@x.in", "+91 98765 43210", "Internship", "Hired", '"Stipend ₹13,200/mo"', "27 Nov 2026"]);
  assert.equal(csv[2]![0], "'=cmd");
  assert.equal(csv[2]![5], '"CTC ₹6,00,000"');
});

test("offersCsvFilename: safe", () => {
  assert.equal(offersCsvFilename("Frontend Intern", "all"), "offers-frontend-intern.csv");
  assert.equal(offersCsvFilename('UI/UX "Design"; x', "hired"), "offers-ui-ux-design-x-hired.csv");
  assert.equal(offersCsvFilename("", "all"), "offers-project.csv");
});
