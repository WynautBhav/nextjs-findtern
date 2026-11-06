import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FAQ_EMPLOYER } from "./content/faq.ts";
import { PRICING_PLANS } from "./content/home.ts";
import type { Proposal } from "./db/schema.ts";
import { toEmployerProposal } from "./employer-proposal-view.ts";
import { emails } from "./emails.ts";
import { hireInvoiceLines } from "./invoice-lines.ts";
import { buildOffer, parseOffer } from "./offer.ts";

const ROOT = join(import.meta.dirname, "..", "..");
// Owner rule (6 Nov 2026): an employer never sees what the intern is paid.
const PAY = /stipend|bonus|payout/i;

const offerRaw = buildOffer({
  currency: "INR",
  roleTitle: "Designer",
  mode: "remote",
  startDate: "2026-11-09",
  duration: "3m",
  monthlyHours: 160,
  hourlyRateMinor: 10_000,
  perHireMinor: 500_000,
  candidateScore: 7,
});

test("the stored offer really carries the intern's stipend (so the strip below is meaningful)", () => {
  assert.ok("internStipendMonthly" in offerRaw);
});

test("the proposal an employer's browser gets has no stipend, bonus or payout field", () => {
  const row = {
    id: "p1",
    status: "hired",
    internId: "i1",
    employerId: "e1",
    offerDetails: offerRaw,
    completionBonusAt: new Date("2026-10-01T00:00:00Z"),
    completionBonusBy: "admin",
  } as unknown as Proposal;
  const out = toEmployerProposal(row);
  assert.doesNotMatch(JSON.stringify(out), PAY);
  // what the employer screens still read survives
  assert.equal(out.id, "p1");
  assert.equal((out.offerDetails as Record<string, unknown>).monthlyAmount, offerRaw.monthlyAmount);
});

test("payment reminder email to the employer never mentions the intern's pay", () => {
  for (const type of ["upcoming", "due", "overdue"] as const) {
    for (const dueToday of [true, false]) {
      const m = emails.paymentReminder({ name: "Acme", type, k: 2, amount: "₹16,000", dueOn: "8 Nov 2026", dueToday, intern: "Asha Rao" });
      assert.doesNotMatch(JSON.stringify(m), PAY, `${type} ${dueToday}`);
    }
  }
});

test("employer invoice lines never say stipend", () => {
  const offer = parseOffer(offerRaw, "INR");
  const base = { who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer };
  const sets = [
    hireInvoiceLines({ ...base, monthly: false, paymentIndex: 0, postpaid: "fee" }),
    hireInvoiceLines({ ...base, monthly: true, paymentIndex: 0, postpaid: 2 }),
    hireInvoiceLines({ ...base, monthly: false, paymentIndex: 0 }),
    hireInvoiceLines({ ...base, monthly: true, paymentIndex: 0 }),
  ];
  for (const line of sets.flat()) assert.doesNotMatch(`${line.label} ${line.detail ?? ""}`, PAY);
});

test("employer-facing content and the chatbot do not state intern pay", () => {
  const amounts = /stipend|bonus|payout|₹\s?8,000|₹\s?15,000/i;
  for (const f of FAQ_EMPLOYER) assert.doesNotMatch(`${f.question} ${f.answer}`, amounts, f.question);
  for (const p of PRICING_PLANS) assert.doesNotMatch(JSON.stringify(p), amounts, p.slug);
  // knowledge.ts imports through the "@/" alias, which node:test cannot resolve: read the source.
  assert.match(readFileSync(join(ROOT, "src/lib/chatbot/knowledge.ts"), "utf8"), /Never state intern stipend or completion-bonus amounts/);
});

function walk(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

test("source guard: employer code, checkout and employer marketing never reference intern pay", () => {
  const dirs = ["src/app/employer", "src/components/employer", "src/app/api/employer"];
  const files = [
    ...dirs.flatMap((d) => walk(join(ROOT, d))),
    ...[
      "src/components/payments/checkout-summary.tsx",
      "src/components/marketing/pricing-content.tsx",
      "src/app/(marketing)/employers/page.tsx",
      "src/lib/invoice-lines.ts",
    ].map((f) => join(ROOT, f)),
  ].filter((f) => /\.tsx?$/.test(f));
  assert.ok(files.length > 20);
  // `stipendMinor` (an internal name for the employer's own monthly line) is not whole-word "stipend".
  const banned = /internStipend|fixedInternStipend|completionBonus|WhereMoneyGoes|\bstipends?\b/i;
  for (const f of files) {
    const hit = stripComments(readFileSync(f, "utf8")).match(banned);
    assert.equal(hit, null, `${f.slice(ROOT.length)} mentions "${hit?.[0]}"`);
  }
});

test("employer proposal routes answer with id and status only, never the whole row", () => {
  for (const f of [
    "src/app/api/employer/[id]/proposals/route.ts",
    "src/app/api/employer/[id]/full-time-offer/route.ts",
    "src/app/api/proposals/[id]/status/route.ts",
  ]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.doesNotMatch(src, /json\(\{ proposal(: updated)? \}/, f);
  }
});
