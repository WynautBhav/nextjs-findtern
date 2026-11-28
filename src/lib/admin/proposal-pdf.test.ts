import assert from "node:assert/strict";
import { test } from "node:test";

import { pdfSafe, proposalPdfFilename, proposalPdfText } from "./proposal-pdf.ts";
import type { DrawerProposal } from "./proposal-drawer-data.ts";

const base: DrawerProposal = {
  id: "pr-1",
  candidate: "Ananya Iyer",
  internId: "i-1",
  email: "ananya@jklu.edu.in",
  phone: "9829000010",
  company: "Kestrel Studio",
  employerId: "e-1",
  project: "Frontend Intern",
  typeLabel: "Internship proposal",
  ppo: false,
  outcome: { label: "Expired", tone: "neutral", expired: true },
  expiryLabel: "Start date passed",
  flow: "Direct offer",
  sent: "27 Nov 2026, 12:53 PM IST",
  pay: { label: "Stipend ₹13,200/mo", employerMonthly: "₹26,400", internStipend: "₹13,200" },
  offerDetails: { duration: "3m", startDate: "2026-12-01", mode: "hybrid", city: "Jaipur", state: "Rajasthan", timezone: "Asia/Kolkata", monthlyAmount: 26400 },
  currency: "INR",
  steps: [{ key: "sent", label: "Sent", at: "27 Nov 2026, 12:53 PM IST" }],
  interview: null,
};

const rows = (t: ReturnType<typeof proposalPdfText>) => Object.fromEntries(t.sections.flatMap((s) => s.rows));

test("proposalPdfText: internship offer in the drawer's words", () => {
  const t = proposalPdfText({ id: "pr-1", kind: "Internship", drawer: base }, "28 Nov 2026");
  const r = rows(t);
  assert.equal(t.title, "Findtern proposal");
  assert.match(t.subtitle, /pr-1/);
  assert.equal(r.Name, "Ananya Iyer");
  assert.equal(r.Email, "ananya@jklu.edu.in");
  assert.equal(r.Type, "Internship");
  assert.equal(r.Outcome, "Expired (Start date passed)");
  assert.equal(r["Employer pays"], "₹26,400 a month");
  assert.equal(r["Intern stipend"], "₹13,200 a month");
  assert.equal(r.Duration, "3 months");
  assert.equal(r["Start date"], "2026-12-01");
  assert.equal(r["Work mode"], "Hybrid");
  assert.equal(r.City, "Jaipur, Rajasthan");
  assert.equal(r.Sent, "27 Nov 2026, 12:53 PM IST");
  assert.ok(t.sections.some((s) => s.heading === "Timeline"));
  assert.ok(!t.sections.some((s) => s.heading === "Linked interview"));
});

test("proposalPdfText: full-time offer shows the CTC and the interview", () => {
  const ft: DrawerProposal = {
    ...base,
    pay: { label: "CTC ₹6,50,000", employerMonthly: null, internStipend: null },
    offerDetails: { fullTimeOffer: { annualCtc: 650000, jobMode: "onsite", jobLocationCity: "Pune", jobLocationState: "Maharashtra", startDate: "2027-01-04" } },
    interview: { status: "completed", booked: "20 Nov 2026", slot: "22 Nov 2026, 11:00 AM (Asia/Kolkata)", link: null },
  };
  const r = rows(proposalPdfText({ id: "pr-2", kind: "PPO", drawer: ft }, "28 Nov 2026"));
  assert.equal(r.Pay, "CTC ₹6,50,000");
  assert.equal(r.Type, "PPO");
  assert.equal(r["Work mode"], "On-site");
  assert.equal(r.Location, "Pune, Maharashtra");
  assert.equal(r.Slot, "22 Nov 2026, 11:00 AM (Asia/Kolkata)");
  assert.equal(r.Duration, undefined);
});

test("pdfSafe: rupee, accents, dashes kept or replaced; other scripts never throw", () => {
  assert.equal(pdfSafe("₹13,200 a month"), "Rs 13,200 a month");
  assert.equal(pdfSafe("José – Zoë · ok"), "José – Zoë · ok");
  assert.equal(pdfSafe("Łukasz"), "?ukasz");
  assert.equal(pdfSafe("अनन्या Iyer"), "?????? Iyer");
  assert.equal(pdfSafe("line\nbreak"), "line break");
});

test("proposalPdfFilename: sanitised", () => {
  assert.equal(proposalPdfFilename("Ananya Iyer", "Kestrel Studio"), "proposal-ananya-iyer-kestrel-studio.pdf");
  assert.equal(proposalPdfFilename("Zoë \"; rm -rf", "A/B\\C"), "proposal-zoe-rm-rf-a-b-c.pdf");
  assert.equal(proposalPdfFilename("अनन्या", ""), "proposal-offer.pdf");
});
