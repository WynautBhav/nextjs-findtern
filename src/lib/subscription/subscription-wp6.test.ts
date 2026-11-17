import assert from "node:assert/strict";
import test from "node:test";

import { SUBSCRIPTION_DEFAULTS, subscriptionPriceMinor, subscriptionState } from "../employer-subscription.ts";
import { employerInvoice } from "../employer-invoice.ts";
import { isSubscriptionOrderRaw } from "../employer-subscription.ts";
import { orderProposalIds } from "../order-ids.ts";
import { applyGrant, applyRevoke, grantBodySchema, grantUntilProblem, istDayEnd, overrideAuditView, revokeBodySchema, revokeProblem } from "./grant.ts";
import { buildSubscriptionRows, filterCounts, filterSubscriptionRows, parseStatusFilter, subscriptionsCsv, type SubscriptionPaymentInput } from "./admin-list.ts";
import { isSubscriptionConfigBody, parseSubscriptionConfigPut, subscriptionConfigAuditMeta } from "./config-put.ts";
import { reusableOpenOrder, subscriptionCurrency, subscriptionLineLabel, subscriptionListMinor, subscriptionNotes, subscriptionRawBase } from "./order.ts";

const DAY = 86_400_000;
const NOW = new Date("2026-11-17T10:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);

// ---- price and currency ------------------------------------------------------------------------------------------

test("price: Rs 10,000 GST-inclusive, $100 by the 100 INR = 1 USD rule", () => {
  assert.equal(subscriptionListMinor(SUBSCRIPTION_DEFAULTS, "INR"), 1_000_000);
  assert.equal(subscriptionListMinor(SUBSCRIPTION_DEFAULTS, "USD"), 10_000);
  assert.equal(subscriptionListMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 1_250_000 }, "USD"), 12_500);
  assert.equal(subscriptionPriceMinor({ ...SUBSCRIPTION_DEFAULTS, priceInrMinor: 4_990_000 }, "USD"), 49_900);
});

test("currency follows the employer's country, never the client", () => {
  assert.equal(subscriptionCurrency({ country: "India" }), "INR");
  assert.equal(subscriptionCurrency({ country: "United States" }), "USD");
  assert.equal(subscriptionCurrency({ countryCode: "+91", phoneNumber: "9876543210" }), "INR");
  assert.equal(subscriptionCurrency({ countryCode: "+44", phoneNumber: "7700900123" }), "USD");
  assert.equal(subscriptionCurrency({}), "USD");
});

// ---- order shape -------------------------------------------------------------------------------------------------

test("an order's notes carry no proposal ids, so nothing reads it as a hire", () => {
  const notes = subscriptionNotes({ employerId: "e1", periodDays: 365, listMinor: 1_000_000, amountMinor: 800_000, discountMinor: 200_000 });
  const raw = { ...subscriptionRawBase({ periodDays: 365, currency: "INR" }), notes };
  assert.deepEqual(orderProposalIds(raw), []);
  assert.equal(isSubscriptionOrderRaw(raw), true);
  assert.equal(raw.kind, "employer_subscription");
  assert.equal(raw.periodDays, 365);
  assert.equal(raw.currency, "INR");
  assert.equal(notes.purpose, "employer_subscription");
  assert.equal(notes.discountAmountMinor, 200_000);
  assert.equal(notes.listAmountMinor, 1_000_000);
});

test("an open order is reused for the same code and currency, never for another, an old one or a finished one", () => {
  const sub = (over: Record<string, unknown> = {}) => ({
    orderId: "order_1", status: "created", createdAt: ago(0.001), amountMinor: 1_000_000, currency: "INR", gateway: null,
    raw: { kind: "employer_subscription", promo: undefined, ...over },
  });
  const want = { promoCode: null as string | null, currency: "INR" as const, now: NOW, openMinutes: 30 };
  const fresh = (d: number) => new Date(NOW.getTime() - d * 60_000);
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(5) }], want)?.orderId, "order_1");
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(31) }], want), null, "older than 30 minutes");
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(5), status: "paid" }], want), null);
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(5), currency: "USD" }], want), null);
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(5), raw: { kind: "employer_checkout" } }], want), null, "a hire order is never reused");
  assert.equal(reusableOpenOrder([{ ...sub({ promo: { promoCode: "PRO20" } }), createdAt: fresh(5) }], want), null, "an order with a code is not the one without");
  assert.equal(reusableOpenOrder([{ ...sub({ promo: { promoCode: "pro20" } }), createdAt: fresh(5) }], { ...want, promoCode: "PRO20" })?.orderId, "order_1");
  assert.equal(reusableOpenOrder([{ ...sub(), createdAt: fresh(5), gateway: "promo_full_waiver" }], want), null, "a waiver order settles at once and is never reused");
});

// ---- invoice -----------------------------------------------------------------------------------------------------

test("the invoice of a subscription order is one 'Findtern Pro subscription (365 days)' line, no hire", () => {
  const payment = {
    id: "p1", orderId: "order_1", invoiceNumber: "171126-1", status: "paid", paidAt: NOW, amountMinor: 1_000_000,
    raw: { ...subscriptionRawBase({ periodDays: 365, currency: "INR" }), notes: subscriptionNotes({ employerId: "e1", periodDays: 365, listMinor: 1_000_000, amountMinor: 1_000_000, discountMinor: 0 }) },
  };
  const inv = employerInvoice({ payment, allPayments: [payment], legacyPaid: [], hires: new Map() });
  assert.equal(inv.lines.length, 1);
  assert.equal(inv.lines[0].label, "Findtern Pro subscription (365 days)");
  assert.equal(inv.lines[0].amountMinor, 1_000_000);
  assert.equal(inv.description, "Findtern Pro subscription");
  assert.deepEqual(inv.hireNames, []);
  assert.deepEqual(inv.projects, []);
  assert.equal(inv.monthly, false);
  assert.equal(subscriptionLineLabel(1), "Findtern Pro subscription (1 day)");
});

test("an invoice for a promo subscription shows the code and the saving; the line is the amount charged", () => {
  const payment = {
    id: "p2", orderId: "order_2", invoiceNumber: "171126-2", status: "paid", paidAt: NOW, amountMinor: 800_000,
    raw: { ...subscriptionRawBase({ periodDays: 365, currency: "INR" }), promo: { promoCode: "PRO20", discountMinor: 200_000 }, notes: subscriptionNotes({ employerId: "e1", periodDays: 365, listMinor: 1_000_000, amountMinor: 800_000, discountMinor: 200_000 }) },
  };
  const inv = employerInvoice({ payment, allPayments: [payment], legacyPaid: [], hires: new Map() });
  assert.equal(inv.lines[0].amountMinor, 800_000);
  assert.deepEqual(inv.promo, { code: "PRO20", discountMinor: 200_000 });
});

test("hire invoices are unchanged: a raw without the subscription kind builds the same lines as before", () => {
  const payment = { id: "p3", orderId: "o3", invoiceNumber: "171126-3", status: "paid", paidAt: NOW, amountMinor: 500_000, raw: { notes: { proposalIds: ["x"], paymentMode: "total" } } };
  const inv = employerInvoice({ payment, allPayments: [payment], legacyPaid: [], hires: new Map() });
  assert.equal(inv.description, "Intern hiring services");
  assert.deepEqual(inv.lines, []);
});

// ---- config save -------------------------------------------------------------------------------------------------

test("config save: price above zero in whole paise, 1 to 1095 days, a real on/off", () => {
  const ok = parseSubscriptionConfigPut({ employerSubscription: { priceInrMinor: 1_000_000, durationDays: 365, enabled: true } });
  assert.deepEqual(ok, { ok: true, config: { priceInrMinor: 1_000_000, durationDays: 365, enabled: true } });
  for (const [name, body] of [
    ["zero price", { priceInrMinor: 0, durationDays: 365, enabled: true }],
    ["negative", { priceInrMinor: -5, durationDays: 365, enabled: true }],
    ["fractional price", { priceInrMinor: 100.5, durationDays: 365, enabled: true }],
    ["price too high", { priceInrMinor: 100_000_001, durationDays: 365, enabled: true }],
    ["zero days", { priceInrMinor: 1_000_000, durationDays: 0, enabled: true }],
    ["1096 days", { priceInrMinor: 1_000_000, durationDays: 1096, enabled: true }],
    ["fractional days", { priceInrMinor: 1_000_000, durationDays: 1.5, enabled: true }],
    ["enabled as text", { priceInrMinor: 1_000_000, durationDays: 365, enabled: "yes" }],
    ["missing enabled", { priceInrMinor: 1_000_000, durationDays: 365 }],
    ["string price", { priceInrMinor: "1000000", durationDays: 365, enabled: true }],
  ] as const) {
    assert.equal(parseSubscriptionConfigPut({ employerSubscription: body }).ok, false, name);
  }
  assert.equal(parseSubscriptionConfigPut({ employerSubscription: { priceInrMinor: 1, durationDays: 1095, enabled: false } }).ok, true);
  assert.equal(parseSubscriptionConfigPut(null).ok, false);
  assert.equal(isSubscriptionConfigBody({ employerSubscription: {} }), true);
  assert.equal(isSubscriptionConfigBody({ internActivationFeeMinor: 5 }), false);
});

test("config save audit: before and after in full, a from/to for each changed field, the derived USD price", () => {
  const meta = subscriptionConfigAuditMeta(undefined, { priceInrMinor: 1_250_000, durationDays: 365, enabled: false });
  assert.deepEqual(meta.before, SUBSCRIPTION_DEFAULTS);
  assert.deepEqual(meta.after, { priceInrMinor: 1_250_000, durationDays: 365, enabled: false });
  assert.deepEqual(meta.changes, { priceInrMinor: { from: 1_000_000, to: 1_250_000 }, enabled: { from: true, to: false } });
  assert.deepEqual(meta.usdMinor, { from: 10_000, to: 12_500 });
  assert.deepEqual(subscriptionConfigAuditMeta({ priceInrMinor: 1_000_000, durationDays: 365, enabled: true }, SUBSCRIPTION_DEFAULTS).changes, {});
});

// ---- grant and revoke --------------------------------------------------------------------------------------------

test("grant: the last day is an IST day; the end is 23:59:59.999 IST of it", () => {
  assert.equal(istDayEnd("2027-03-31")?.toISOString(), "2027-03-31T18:29:59.999Z");
  assert.equal(istDayEnd("2027-02-30"), null);
  assert.equal(istDayEnd("2027-13-01"), null);
  assert.equal(istDayEnd("tomorrow"), null);
  assert.ok(grantUntilProblem(istDayEnd("2026-11-16"), NOW), "past");
  assert.ok(grantUntilProblem(null, NOW));
  assert.equal(grantUntilProblem(istDayEnd("2027-11-17"), NOW), null);
  assert.ok(grantUntilProblem(istDayEnd("2031-01-01"), NOW), "more than three years");
});

test("grant and revoke bodies: a note is required", () => {
  assert.equal(grantBodySchema.safeParse({ employerId: "e1", until: "2027-03-31", note: "Pilot customer" }).success, true);
  assert.equal(grantBodySchema.safeParse({ employerId: "e1", until: "2027-03-31", note: "  " }).success, false);
  assert.equal(grantBodySchema.safeParse({ employerId: "e1", until: "2027-03-31" }).success, false);
  assert.equal(grantBodySchema.safeParse({ employerId: "e1", until: "31/03/2027", note: "ok ok" }).success, false);
  assert.equal(revokeBodySchema.safeParse({ employerId: "e1", note: "Chargeback" }).success, true);
  assert.equal(revokeBodySchema.safeParse({ employerId: "e1", note: "" }).success, false);
  assert.equal(revokeBodySchema.safeParse({ note: "Chargeback" }).success, false);
});

test("a grant stamps grantedAt, gives access to the day, and the same grant again changes nothing", () => {
  const until = istDayEnd("2027-03-31")!;
  const first = applyGrant(undefined, { until, note: "Pilot", by: "admin-1", now: NOW });
  assert.equal(first.changed, true);
  assert.equal(first.override?.grantedAt, NOW.toISOString());
  assert.equal(first.override?.grantedUntil, until.toISOString());
  const state = subscriptionState({ payments: [], override: first.override, now: NOW });
  assert.equal(state.active, true);
  assert.equal(state.endsAt, until.toISOString());
  const again = applyGrant(first.override, { until, note: "Pilot", by: "admin-1", now: ahead(1) });
  assert.equal(again.changed, false);
  assert.equal(again.override?.grantedAt, NOW.toISOString(), "a repeat does not move the stamp");
  const extended = applyGrant(first.override, { until: istDayEnd("2027-06-30")!, note: "Extended", by: "admin-2", now: ahead(1) });
  assert.equal(extended.changed, true);
});

test("revoke ends access now, voids earlier payments, writes no money, and a repeat is answered from the state", () => {
  const payment = { status: "paid", paidAt: ago(10), raw: { kind: "employer_subscription", periodDays: 365 } };
  const before = subscriptionState({ payments: [payment], override: null, now: NOW });
  assert.equal(before.active, true);
  assert.equal(revokeProblem(before), null);
  const override = applyRevoke(undefined, { note: "Chargeback", by: "admin-1", now: NOW });
  assert.equal(override.revokedAt, NOW.toISOString());
  const after = subscriptionState({ payments: [payment], override, now: NOW });
  assert.equal(after.status, "revoked");
  assert.equal(after.active, false);
  assert.ok(revokeProblem(after), "route answers revoked as already done before it gets here");
  assert.ok(revokeProblem(subscriptionState({ payments: [], override: null, now: NOW })));
  assert.ok(revokeProblem(subscriptionState({ payments: [{ ...payment, paidAt: ago(400) }], override: null, now: NOW })), "an expired one has nothing to revoke");
});

test("grant after revoke gives access again; revoke after that is a real change", () => {
  const revoked = applyRevoke(undefined, { note: "x", by: "a", now: ago(5) });
  const granted = applyGrant(revoked, { until: istDayEnd("2027-03-31")!, note: "Reinstated", by: "a", now: ago(1) });
  assert.equal(granted.changed, true);
  assert.equal(subscriptionState({ payments: [], override: granted.override, now: NOW }).active, true);
  const again = applyRevoke(granted.override, { note: "Again", by: "a", now: NOW });
  assert.equal(subscriptionState({ payments: [], override: again, now: NOW }).status, "revoked");
  assert.deepEqual(overrideAuditView(again), { grantedUntil: istDayEnd("2027-03-31")!.toISOString(), grantedAt: ago(1).toISOString(), revokedAt: NOW.toISOString() });
  assert.equal(overrideAuditView(null), null);
});

// ---- the admin list ----------------------------------------------------------------------------------------------

const emp = (id: string, name: string, email: string) => ({ id, name, companyEmail: email });
const pay = (over: Partial<SubscriptionPaymentInput> & { employerId: string; paidAt: Date }): SubscriptionPaymentInput => ({
  id: `row-${over.employerId}-${over.paidAt.getTime()}`, orderId: `order_${over.employerId}`, gateway: null, status: "paid", amountMinor: 1_000_000, currency: "INR",
  raw: { kind: "employer_subscription", periodDays: 365 }, ...over,
});

const rowsFixture = () =>
  buildSubscriptionRows({
    employers: [emp("a", "Acme Labs", "hr@acme.test"), emp("b", "Beta Co", "pay@beta.test"), emp("c", "Cobalt", "hi@cobalt.test"), emp("d", "Delta", "d@delta.test"), emp("e", "Echo", "e@echo.test"), emp("f", "Foxtrot", "f@fox.test")],
    payments: [
      pay({ employerId: "a", paidAt: ago(10) }), // active, 355 days left
      pay({ employerId: "b", paidAt: ago(345) }), // expiring in 20 days
      pay({ employerId: "c", paidAt: ago(400) }), // expired
      pay({ employerId: "d", paidAt: ago(20), gateway: "promo_full_waiver", amountMinor: 0 }), // promo, active
      pay({ employerId: "f", paidAt: ago(10), status: "created" }), // never paid: not listed
      { ...pay({ employerId: "a", paidAt: ago(3) }), raw: { notes: { proposalIds: ["p1"] } }, id: "hire-order" }, // a hire: never listed
    ],
    overrides: {
      e: { grantedUntil: ahead(60).toISOString(), grantedAt: ago(1).toISOString(), by: "admin-1", note: "Pilot" },
      b: {} as never,
    },
    config: SUBSCRIPTION_DEFAULTS,
    now: NOW,
  });

test("list: one row per employer with a paid subscription or an override; hire orders and unpaid orders are not rows", () => {
  const rows = rowsFixture();
  assert.deepEqual(rows.map((r) => r.company).sort(), ["Acme Labs", "Beta Co", "Cobalt", "Delta", "Echo"]);
  const by = Object.fromEntries(rows.map((r) => [r.company, r]));
  assert.equal(by["Acme Labs"].status, "active");
  assert.equal(by["Acme Labs"].source, "paid");
  assert.equal(by["Acme Labs"].amountMinor, 1_000_000);
  assert.equal(by["Acme Labs"].orderRef, "order_a");
  assert.equal(by["Beta Co"].status, "expiring");
  assert.equal(by["Beta Co"].daysLeft, 20);
  assert.equal(by["Cobalt"].status, "expired");
  assert.equal(by["Delta"].source, "promo");
  assert.equal(by["Delta"].amountMinor, 0);
  assert.equal(by["Echo"].source, "manual");
  assert.equal(by["Echo"].amountMinor, null);
  assert.equal(by["Echo"].paymentRowId, null);
  assert.equal(by["Echo"].note, "Pilot");
  assert.equal(by["Echo"].active, true);
});

test("list: a revoked employer reads Revoked and keeps the voided order for reference", () => {
  const rows = buildSubscriptionRows({
    employers: [emp("a", "Acme Labs", "hr@acme.test")],
    payments: [pay({ employerId: "a", paidAt: ago(10) })],
    overrides: { a: { revokedAt: ago(1).toISOString(), by: "admin-1", note: "Chargeback" } },
    config: SUBSCRIPTION_DEFAULTS,
    now: NOW,
  });
  assert.equal(rows[0].status, "revoked");
  assert.equal(rows[0].active, false);
  assert.equal(rows[0].orderRef, "order_a");
  assert.equal(rows[0].note, "Chargeback");
});

test("list: the off switch hides nothing from admin (statuses are what each employer holds)", () => {
  const rows = buildSubscriptionRows({ employers: [emp("a", "Acme", "a@a.test")], payments: [pay({ employerId: "a", paidAt: ago(10) })], overrides: {}, config: { ...SUBSCRIPTION_DEFAULTS, enabled: false }, now: NOW });
  assert.equal(rows[0].status, "active");
});

test("list: a renewal while active stacks from the current end and the row shows the latest order", () => {
  const rows = buildSubscriptionRows({
    employers: [emp("a", "Acme", "a@a.test")],
    payments: [pay({ employerId: "a", paidAt: ago(300), orderId: "old" }), pay({ employerId: "a", paidAt: ago(2), orderId: "renewal" })],
    overrides: {},
    config: SUBSCRIPTION_DEFAULTS,
    now: NOW,
  });
  assert.equal(rows[0].orderRef, "renewal");
  assert.equal(rows[0].endsAt, new Date(ago(300).getTime() + 730 * DAY).toISOString());
  assert.equal(rows[0].startedAt, ago(300).toISOString());
});

test("list filters: Active holds everyone with access, Expiring the 30-day subset; search by company or email", () => {
  const rows = rowsFixture();
  const names = (status: Parameters<typeof filterSubscriptionRows>[1]["status"], q?: string) => filterSubscriptionRows(rows, { status, q }).map((r) => r.company).sort();
  assert.deepEqual(names("all"), ["Acme Labs", "Beta Co", "Cobalt", "Delta", "Echo"]);
  assert.deepEqual(names("active"), ["Acme Labs", "Beta Co", "Delta", "Echo"]);
  assert.deepEqual(names("expiring"), ["Beta Co"]);
  assert.deepEqual(names("expired"), ["Cobalt"]);
  assert.deepEqual(names("revoked"), []);
  assert.deepEqual(names("all", "ACME"), ["Acme Labs"]);
  assert.deepEqual(names("all", "beta.test"), ["Beta Co"]);
  assert.deepEqual(names("active", "cobalt"), []);
  assert.deepEqual(filterCounts(rows), { all: 5, active: 4, expiring: 1, expired: 1, revoked: 0 });
  assert.equal(parseStatusFilter("expired"), "expired");
  assert.equal(parseStatusFilter("<script>"), "all");
  assert.equal(parseStatusFilter(null), "all");
});

test("list order: what ends soonest first among the live, then expired, then revoked", () => {
  const rows = rowsFixture();
  assert.deepEqual(rows.map((r) => r.company), ["Beta Co", "Echo", "Delta", "Acme Labs", "Cobalt"]);
});

test("CSV: header, one line per row, IST dates, money as a decimal, formula-looking text neutralised", () => {
  const rows = buildSubscriptionRows({
    employers: [emp("a", "=HYPERLINK(\"x\")", "hr@acme.test")],
    payments: [pay({ employerId: "a", paidAt: ago(10) })],
    overrides: {},
    config: SUBSCRIPTION_DEFAULTS,
    now: NOW,
  });
  const csv = subscriptionsCsv(rows).replace(/^\uFEFF/, "").split("\r\n");
  assert.equal(csv[0], "Company,Email,Plan,Status,Started (IST),Ends (IST),Days left,Source,Amount,Currency,Order,Note");
  assert.ok(csv[1].startsWith(`"'=HYPERLINK(""x"")",hr@acme.test,Findtern Pro,active,2026-11-07,2027-11-07,355,Paid,10000.00,INR,order_a,`), csv[1]);
});

// ---- the editor's draft ------------------------------------------------------------------------------------------

import { draftFromConfig, subscriptionDraftEq, usdPreviewMinor, validateSubscriptionDraft } from "./draft.ts";

test("draft: rupees in, paise out; USD preview is the derived dollar price", () => {
  const d = draftFromConfig(SUBSCRIPTION_DEFAULTS);
  assert.deepEqual(d, { price: "10000", days: "365", enabled: true });
  assert.deepEqual(validateSubscriptionDraft(d), { ok: true, config: SUBSCRIPTION_DEFAULTS });
  assert.deepEqual(validateSubscriptionDraft({ price: "9999.50", days: "30", enabled: false }), { ok: true, config: { priceInrMinor: 999_950, durationDays: 30, enabled: false } });
  assert.equal(usdPreviewMinor("10000"), 10_000);
  assert.equal(usdPreviewMinor("12500"), 12_500);
  assert.equal(usdPreviewMinor("abc"), null);
  assert.equal(usdPreviewMinor("0"), null);
});

test("draft: every refusal names the field and says what to do", () => {
  const bad = (price: string, days: string) => validateSubscriptionDraft({ price, days, enabled: true });
  for (const [price, days, field] of [["", "365", "price"], ["0", "365", "price"], ["-5", "365", "price"], ["1e5", "365", "price"], ["10000", "", "days"], ["10000", "0", "days"], ["10000", "1096", "days"], ["10000", "1.5", "days"], ["10000", "abc", "days"], ["99999999", "365", "price"]] as const) {
    const r = bad(price, days);
    assert.equal(r.ok, false, `${price}/${days}`);
    if (!r.ok) assert.equal(r.field, field, `${price}/${days}`);
  }
  assert.equal(bad("10000", "1095").ok, true);
  assert.equal(bad("10000", "1").ok, true);
});

test("draft equality ignores how a number is typed", () => {
  assert.equal(subscriptionDraftEq({ price: "10000", days: "365", enabled: true }, { price: "10000.00", days: "0365", enabled: true }), true);
  assert.equal(subscriptionDraftEq({ price: "10000", days: "365", enabled: true }, { price: "10000", days: "365", enabled: false }), false);
  assert.equal(subscriptionDraftEq({ price: "10000", days: "365", enabled: true }, { price: "9999", days: "365", enabled: true }), false);
});

// ---- the employer page's words -----------------------------------------------------------------------------------

import { buyLabel, renewalNote, statusLine, statusView, UNLOCKS } from "./view.ts";

test("the page names each status as the brief does", () => {
  const s = (status: "none" | "active" | "expiring" | "expired" | "revoked", over = {}) => ({ active: status === "active" || status === "expiring", status, endsAt: "2027-03-31T18:29:59.999Z", daysLeft: status === "active" ? 100 : status === "expiring" ? 12 : null, ...over });
  assert.deepEqual(statusView(s("none", { endsAt: null })), { label: "None", tone: "neutral" });
  assert.deepEqual(statusView(s("active")), { label: "Active", tone: "paid" });
  assert.deepEqual(statusView(s("expiring")), { label: "Expiring in 12 days", tone: "waiting" });
  assert.equal(statusView(s("expiring", { daysLeft: 1 })).label, "Expiring in 1 day");
  assert.deepEqual(statusView(s("expired")), { label: "Expired", tone: "closed" });
  assert.deepEqual(statusView(s("revoked", { endsAt: null })), { label: "Revoked", tone: "closed" });
  assert.match(statusLine(s("active")), /unlocked on Candidates\. Renewing adds days/);
  assert.match(statusLine(s("expiring")), /Renew before the end date/);
  assert.match(statusLine(s("expired")), /ended on 31 Mar 2027/);
  assert.match(statusLine(s("none", { endsAt: null })), /not subscribed/);
  assert.equal(buyLabel(s("active")), "Renew Findtern Pro");
  assert.equal(buyLabel(s("expiring")), "Renew Findtern Pro");
  assert.equal(buyLabel(s("expired")), "Renew Findtern Pro");
  assert.equal(buyLabel(s("none", { endsAt: null })), "Buy Findtern Pro");
  assert.equal(buyLabel(s("revoked", { endsAt: null })), "Buy Findtern Pro");
  assert.deepEqual([...UNLOCKS], ["CGPA filter", "College filter and sort"]);
});

test("renewal note: stacks from the end while active, starts at payment otherwise", () => {
  const active = { active: true, status: "active" as const, endsAt: "2027-03-31T18:29:59.999Z", daysLeft: 100 };
  assert.match(renewalNote(active, 365), /adds 365 days to your current end date.*New end date: 30 Mar 2028/);
  const none = { active: false, status: "none" as const, endsAt: null, daysLeft: null };
  assert.match(renewalNote(none, 365), /as soon as the payment is confirmed and runs for 365 days from then/);
});

import { addIstDays, istToday } from "./grant.ts";

test("IST day helpers for the grant form", () => {
  assert.equal(istToday(new Date("2026-11-17T20:00:00Z")), "2026-11-18", "after 18:30 UTC it is already tomorrow in India");
  assert.equal(istToday(new Date("2026-11-17T10:00:00Z")), "2026-11-17");
  assert.equal(addIstDays("2026-11-17", 30), "2026-12-17");
  assert.equal(addIstDays("2026-12-20", 365), "2027-12-20");
  assert.equal(addIstDays("2027-02-27", 2), "2027-03-01");
  assert.equal(grantUntilProblem(istDayEnd(addIstDays(istToday(NOW), 1095)), NOW), null, "the form's own maximum is accepted");
  assert.ok(grantUntilProblem(istDayEnd(addIstDays(istToday(NOW), 1100)), NOW));
});
