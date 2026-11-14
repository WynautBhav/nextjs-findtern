import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isNavLocked,
  isLockedApi,
  isOpenInternPage,
  lockEnabled,
  lockedHref,
  lockedPageName,
  lockVerdict,
  needsLookup,
  normalizePath,
  unlockReason,
  type UnlockFacts,
  type UnlockState,
} from "./intern-lock.ts";

const none: UnlockFacts = { paidRow: false, legacyPaid: false, hasProposal: false, hasCompanyInterview: false };

describe("unlockReason: who is unlocked", () => {
  it("an intern who has not paid and has nothing else is locked", () => assert.equal(unlockReason(none), null));
  it("a paid intern_payments row unlocks (card, promo, TPO code, drive code, admin mark-paid all write one)", () =>
    assert.equal(unlockReason({ ...none, paidRow: true }), "paid"));
  it("the legacy extra_data.payment.isPaid flag unlocks", () => assert.equal(unlockReason({ ...none, legacyPaid: true }), "paid"));
  it("paid wins over grandfathered", () => assert.equal(unlockReason({ ...none, paidRow: true, hasProposal: true }), "paid"));
  it("grandfathered: an offer / accepted / hired proposal", () => assert.equal(unlockReason({ ...none, hasProposal: true }), "grandfathered"));
  it("grandfathered: an interview with a company", () => assert.equal(unlockReason({ ...none, hasCompanyInterview: true }), "grandfathered"));
});

describe("lockEnabled: the kill switch", () => {
  it("is ON by default and for any unrecognised value", () => {
    assert.equal(lockEnabled({}), true);
    assert.equal(lockEnabled({ INTERN_PAYMENT_LOCK: "" }), true);
    assert.equal(lockEnabled({ INTERN_PAYMENT_LOCK: "on" }), true);
    assert.equal(lockEnabled({ INTERN_PAYMENT_LOCK: "1" }), true);
    assert.equal(lockEnabled({ INTERN_PAYMENT_LOCK: "banana" }), true);
  });
  it("turns off only on an explicit off value", () => {
    for (const v of ["off", "OFF", " 0 ", "false", "disabled", "no"]) assert.equal(lockEnabled({ INTERN_PAYMENT_LOCK: v }), false, v);
  });
});

describe("normalizePath", () => {
  it("drops query, hash and trailing slash, lower-cases", () => {
    assert.equal(normalizePath("/Intern/Documents/?a=1#x"), "/intern/documents");
    assert.equal(normalizePath("/intern//documents//"), "/intern/documents");
  });
  it("resolves dot segments, encoded dots, backslashes and double encoding", () => {
    assert.equal(normalizePath("/intern/documents/../proposals"), "/intern/proposals");
    assert.equal(normalizePath("/intern/documents/%2e%2e/proposals"), "/intern/proposals");
    assert.equal(normalizePath("/intern/documents/%252e%252e/proposals"), "/intern/proposals");
    assert.equal(normalizePath("/intern/documents\\..\\proposals"), "/intern/proposals");
    assert.equal(normalizePath("/intern/documents/%2e%2e%2fproposals"), "/intern/proposals");
  });
  it("refuses what it cannot read safely", () => {
    assert.equal(normalizePath("/intern/%E0%A4%A"), null);
    assert.equal(normalizePath("/intern/doc%00uments"), null);
  });
});

describe("isOpenInternPage: the allowlist", () => {
  const open = [
    "/intern",
    "/intern/",
    "/intern/dashboard",
    "/intern/dashboard/",
    "/intern/onboarding",
    "/intern/onboarding/step-2",
    "/intern/documents",
    "/intern/documents/open",
    "/intern/profile",
    "/intern/settings",
    "/intern/settings?tab=bank",
    "/intern/settings#college",
    "/intern/notifications",
    "/intern/locked",
    "/intern/guarantee",
    "/intern/college",
    "/intern/bank-details",
    "/intern/Dashboard", // the router 404s the wrong case; the rule must never be stricter than "open"
    "/intern/documents?next=/intern/proposals",
  ];
  const locked = [
    "/intern/proposals",
    "/intern/proposals/123",
    "/intern/messages",
    "/intern/interviews",
    "/intern/record",
    "/intern/timesheets",
    "/intern/timesheets?sheet=1",
    "/intern/earnings",
    "/intern/Proposals",
    "/intern/PROPOSALS/",
    "/intern/documents/../proposals", // path traversal out of an open page
    "/intern/documents/%2e%2e/proposals",
    "/intern/documents/%252e%252e/messages",
    "/intern/dashboard/..%2fearnings",
    "/intern/documentsx", // prefix lookalike
    "/intern/profile-x/record",
    "/intern/dashboardproposals",
    "/intern/unknown-new-page", // default is locked: a new page is closed until someone opens it on purpose
    "/employer/dashboard",
    "/",
    "",
  ];
  for (const p of open) it(`open: ${p}`, () => assert.equal(isOpenInternPage(p), true));
  for (const p of locked) it(`locked: ${p || "(empty)"}`, () => assert.equal(isOpenInternPage(p), false));
  it("an unreadable path is not open", () => assert.equal(isOpenInternPage("/intern/documents/%E0%A4%A"), false));
});

describe("isLockedApi: what an unpaid intern is refused", () => {
  const refused = [
    "/api/proposals/1/status",
    "/api/proposals/1/offer-letter",
    "/api/interviews/1/select-slot",
    "/api/timesheets/1",
    "/api/threads",
    "/api/threads/1/messages",
    "/api/threads/1/read",
    "/api/intern/timesheets",
    "/api/intern/timesheets/1/submit",
    "/api/intern/abc/payouts",
    "/api/PROPOSALS/1/status",
    "/api/proposals/",
    "/api/proposals/../proposals/1",
    "/api/intern/drive-codes/../timesheets",
    "/api/intern/timesheets/%2e%2e/timesheets",
  ];
  const allowed = [
    "/api/intern/onboarding",
    "/api/intern/avatar",
    "/api/intern/college",
    "/api/intern/drive-codes/redeem",
    "/api/intern/drive-codes/claim",
    "/api/intern/abc/payment/razorpay/order",
    "/api/intern/abc/payment/razorpay/verify",
    "/api/intern/abc/payment/promo",
    "/api/uploads",
    "/api/notifications",
    "/api/notifications/read-all",
    "/api/users/abc/change-password",
    "/api/support/feedback",
    "/api/terms/accept",
    "/api/auth/logout",
    "/api/presence/heartbeat",
    "/api/proposalsx", // lookalike, not under /api/proposals
  ];
  for (const p of refused) it(`refused: ${p}`, () => assert.equal(isLockedApi(p), true));
  for (const p of allowed) it(`allowed: ${p}`, () => assert.equal(isLockedApi(p), false));
});

describe("lockVerdict: state x path", () => {
  const v = (pathname: string, state: UnlockState, isApi = false, enabled = true) => lockVerdict({ pathname, isApi, enabled, state });

  it("locked intern: open pages allow, locked pages redirect", () => {
    assert.equal(v("/intern/dashboard", "locked"), "allow");
    assert.equal(v("/intern/documents/", "locked"), "allow");
    assert.equal(v("/intern/profile", "locked"), "allow");
    assert.equal(v("/intern/proposals", "locked"), "redirect_locked");
    assert.equal(v("/intern/documents/../proposals", "locked"), "redirect_locked");
  });
  it("unlocked intern (paid, college-redeemed or grandfathered) reaches everything", () => {
    for (const p of ["/intern/proposals", "/intern/messages", "/intern/timesheets", "/intern/record/x"]) assert.equal(v(p, "unlocked"), "allow");
    assert.equal(v("/api/threads", "unlocked", true), "allow");
  });
  it("API: locked is a 403, unknown is a 503 (fails closed), open APIs are untouched", () => {
    assert.equal(v("/api/proposals/1/status", "locked", true), "deny_locked");
    assert.equal(v("/api/threads", "unknown", true), "deny_unverified");
    assert.equal(v("/api/intern/abc/payment/razorpay/order", "locked", true), "allow");
    assert.equal(v("/api/intern/abc/payment/razorpay/order", "unknown", true), "allow");
    assert.equal(v("/api/intern/onboarding", "locked", true), "allow");
  });
  it("page: a failed lookup fails OPEN (the page's own reads still need the database)", () => {
    assert.equal(v("/intern/proposals", "unknown"), "allow");
  });
  it("kill switch off: everything allowed, no lookup", () => {
    assert.equal(v("/intern/proposals", "locked", false, false), "allow");
    assert.equal(v("/api/threads", "locked", true, false), "allow");
    assert.equal(needsLookup({ pathname: "/intern/proposals", isApi: false, enabled: false }), false);
  });
  it("open pages and open APIs never need a lookup", () => {
    assert.equal(needsLookup({ pathname: "/intern/dashboard", isApi: false, enabled: true }), false);
    assert.equal(needsLookup({ pathname: "/api/uploads", isApi: true, enabled: true }), false);
    assert.equal(needsLookup({ pathname: "/intern/record", isApi: false, enabled: true }), true);
    assert.equal(needsLookup({ pathname: "/api/proposals/1/status", isApi: true, enabled: true }), true);
  });
});

describe("nav and locked page helpers", () => {
  it("nav: locks everything but the open pages, only before payment", () => {
    assert.equal(isNavLocked("/intern/proposals", false), true);
    assert.equal(isNavLocked("/intern/messages", false), true);
    assert.equal(isNavLocked("/intern/dashboard", false), false);
    assert.equal(isNavLocked("/intern/documents", false), false);
    assert.equal(isNavLocked("/intern/profile", false), false);
    assert.equal(isNavLocked("/intern/settings", false), false);
    assert.equal(isNavLocked("/intern/notifications", false), false);
    assert.equal(isNavLocked("/intern/proposals", true), false);
  });
  it("locked page: from only picks a label from a fixed list, never a redirect target", () => {
    assert.equal(lockedPageName("/intern/proposals/12"), "Offers");
    assert.equal(lockedPageName("https://evil.example/intern/proposals"), null);
    assert.equal(lockedPageName("/intern/whatever"), null);
    assert.equal(lockedHref("/intern/proposals/12?x=1"), "/intern/locked?from=%2Fintern%2Fproposals%2F12");
    assert.equal(lockedHref("//evil.example"), "/intern/locked");
    assert.equal(lockedHref(), "/intern/locked");
  });
});
