import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { AUDIT_ACTIONS, actionLabel, redactMeta } from "./audit.ts";
import { describeAudit } from "./audit-details.ts";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

test("every audit action written in src has a human label", () => {
  const written = new Set<string>();
  for (const f of walk("src")) {
    const text = readFileSync(f, "utf8");
    if (!text.includes("recordAdminAudit(")) continue;
    for (const m of text.matchAll(/action:\s*"([a-z_]+\.[a-z_]+)"/g)) written.add(m[1]);
  }
  assert.ok(written.size >= 25, `found only ${written.size} actions`);
  for (const a of written) assert.ok(a in AUDIT_ACTIONS, `no label for ${a}`);
  for (const a of Object.keys(AUDIT_ACTIONS)) assert.notEqual(actionLabel(a), a);
});

test("details summary hides passwords and masks account numbers", () => {
  const meta = { password: "Hunter2!", newPassword: "x", token: "t", bankAccountNumber: "123456789012", note: "paid to a/c 987654321098", nested: { secret: "s", ok: 1 } };
  const out = describeAudit("test.action", meta);
  for (const leak of ["Hunter2!", "123456789012", "987654321098", '"s"']) assert.ok(!out.includes(leak), `leaked ${leak}`);
  assert.ok(out.includes("9012") && out.includes("[hidden]") && out.includes("ok"));
  assert.deepEqual(redactMeta({ a: [{ passwordHash: "h" }] }), { a: [{ passwordHash: "[hidden]" }] });
});

test("phone numbers and payout references are kept; only account-number keys are masked", () => {
  const out = redactMeta({ phoneNumber: { from: "9876543210", to: "9123456780" }, referenceId: "412345678901", note: "call 9876543210, UTR 412345678901" }) as Record<string, unknown>;
  assert.deepEqual(out, { phoneNumber: { from: "9876543210", to: "9123456780" }, referenceId: "412345678901", note: "call 9876543210, UTR 412345678901" });
  assert.deepEqual(redactMeta({ accountHolder: "Asha Rao", fullAccountNumbers: true }), { accountHolder: "Asha Rao", fullAccountNumbers: true });
});

test("catches api keys, authorization, cookies and sessions, but not a boolean flag", () => {
  const out = redactMeta({ apiKey: "sk_live_abc", api_key: "k", authorization: "Bearer xyz", Authorisation: "b", cookie: "ft_sid=abc", session: "s", credentials: { u: "x" }, credentialsReset: true }) as Record<string, unknown>;
  for (const k of ["apiKey", "api_key", "authorization", "Authorisation", "cookie", "session", "credentials"]) assert.equal(out[k], "[hidden]", k);
  assert.equal(out.credentialsReset, true);
});

test("numeric, spaced and bank-nested account numbers are masked", () => {
  assert.deepEqual(redactMeta({ accountNumber: 123456789012 }), { accountNumber: "••••9012" });
  assert.deepEqual(redactMeta({ acct: "1234 5678 9012" }), { acct: "••••9012" });
  assert.deepEqual(redactMeta({ bank: { number: 123456789012, name: "HDFC" } }), { bank: { number: "••••9012", name: "HDFC" } });
  assert.deepEqual(redactMeta({ note: "a/c 1234 5678 9012" }), { note: "a/c ••••9012" });
  assert.deepEqual(redactMeta({ note: "Account no: 123456789012 paid" }), { note: "Account ••••9012 paid" });
  assert.deepEqual(redactMeta({ number: 123456789012 }), { number: 123456789012 }); // no bank parent, not an account
});

test("an account number inside a { from, to } diff, an array or a nested object shows only its last 4 digits", () => {
  const diff = { bankAccountNumber: { from: "123456789012", to: "987654321098" } };
  assert.deepEqual(redactMeta(diff), { bankAccountNumber: { from: "••••9012", to: "••••1098" } });
  assert.deepEqual(redactMeta({ changes: { accountNumber: { from: 123456789012, to: null } } }), { changes: { accountNumber: { from: "••••9012", to: null } } });
  assert.deepEqual(redactMeta({ bank: { number: { from: "123456789012", to: "987654321098" } } }), { bank: { number: { from: "••••9012", to: "••••1098" } } });
  assert.deepEqual(redactMeta({ accountNumber: { list: ["123456789012"], deep: { v: "987654321098" } } }), { accountNumber: { list: ["••••9012"], deep: { v: "••••1098" } } });
  // Secrets inside an account key stay hidden; booleans and nulls are left alone.
  assert.deepEqual(redactMeta({ accountNumber: { from: null, token: "t", ok: true } }), { accountNumber: { from: null, token: "[hidden]", ok: true } });
  // Siblings of an account key are untouched.
  assert.deepEqual(redactMeta({ accountNumber: { from: "123456789012", to: "987654321098" }, phone: { from: "9876543210", to: "9123456780" } }), {
    accountNumber: { from: "••••9012", to: "••••1098" },
    phone: { from: "9876543210", to: "9123456780" },
  });
  const shown = describeAudit("college.update", diff);
  for (const leak of ["123456789012", "987654321098"]) assert.ok(!shown.includes(leak), `leaked ${leak}`);
  assert.equal(shown, "Bank account number: ••••9012 → ••••1098");
  const shownChanges = describeAudit("contact.update", { changes: { accountNumber: { from: "123456789012", to: "987654321098" } } });
  assert.ok(!/123456789012|987654321098/.test(shownChanges) && shownChanges.includes("9012"));
});

/** One representative meta per recordAdminAudit call site, shaped as the route builds it. */
const CALL_SITE_META: Record<keyof typeof AUDIT_ACTIONS, Record<string, unknown>> = {
  "account.update": { fields: ["name", "email"] },
  "impersonate.start": { adminEmail: "ops@findtern.in", targetEmail: "hr@acme.test" },
  "impersonate.stop": { targetEmail: "hr@acme.test" },
  "export.interns": { columns: ["name", "email"], rows: 12, fullAccountNumbers: true, filters: { type: "payouts", q: "asha" } },
  "export.audit_log": { rows: 40, filters: { action: "pricing.update", from: "2026-11-01", to: "2026-11-05" } },
  "export.users": { rows: 30, filters: { role: "intern" } },
  "export.payouts": { view: "dues", rows: 5, filters: { status: "pending" } },
  "export.hired": { rows: 7, filters: { month: "2026-10" } },
  "payout.resend_email": { payoutId: "p-1" },
  "payout.mark_paid": { internId: "i-1", amountMinor: 300000, referenceId: "412345678901" },
  "refund.create": { created: 3, review: 1 },
  "refund.initiate": { refundId: "r-1", amountMinor: 250000, idempotencyKey: "k-1" },
  "refund.reconcile": { refundId: "r-1", from: "initiated", to: "refunded", gatewayRefundId: "rfnd_1", gatewayStatus: "processed", gatewayAmountMinor: 250000, storedAmountMinor: 250000 },
  "refund.webhook": { refundId: "r-1", from: "initiated", to: "refunded", gatewayRefundId: "rfnd_1", reason: "drive_entitlement_after_payment", trigger: "razorpay webhook" },
  "refund.employer_recorded": { orderId: "o-1", gatewayRefundId: "rfnd_1", amountMinor: 1000000, currency: "INR", refundedAfterMinor: 1000000, paidMinor: 2900000, trigger: "razorpay webhook" },
  "export.payments": { rows: 12, filters: { status: "paid" } },
  "payment.duplicate_flagged": { orderId: "order_1", paymentId: "pay_2", amountMinor: 3520000, currency: "INR" },
  "payment.amount_mismatch": { orderId: "order_1", paymentId: "pay_2", reason: "amount_mismatch", expectedMinor: 3520000, paidMinor: 100, expectedCurrency: "INR", paidCurrency: "INR" },
  "pricing.update": { plan: "Standard", changes: { monthlyPriceMinor: { from: 100000, to: 120000 }, featureList: { from: ["a"], to: ["a", "b"] } } },
  "settings.update": { value: { from: 99900, to: 149900 } },
  "identity.reveal": { field: "phone" },
  "contact.update": { phone: { from: "9876543210", to: "9123456780" }, bankAccountNumber: { from: "123456789012", to: "987654321098" }, accountHolder: { from: "Asha Rao", to: "Asha R" } },
  "college.password_reset": { collegeId: "c-1", email: "tpo@college.test" },
  "college.create": { name: "IIT X", isPartner: true },
  "college.update": { changes: { name: { from: "IIT X", to: "IIT Y" }, aisheCode: { from: "C-1", to: "C-2" } } },
  "college.partner_toggle": { isPartner: { from: false, to: true } },
  "college.tpo_code_create": { code: "TPO123", maxUsages: 100 },
  "college.tpo_cap_update": { maxUsages: { from: 100, to: 150 } },
  "college.seat_batch_create": { batchId: "b-1", seats: 300, amountMinor: 24000000 },
  "college.seat_batch_paid": { batchId: "b-1", seats: 300, method: "bank", referenceId: "UTR412345678901", invoiceNumber: "061126-1", capAfter: 300 },
  "college.seat_batch_void": { batchId: "b-1", seats: 300 },
  "college.billing_update": { changes: { gstin: { from: null, to: "08ABCDE1234F1Z5" }, state: { from: null, to: "Rajasthan" } } },
  "college.payout_paid": { payoutId: "po-1", amountMinor: 150000, referenceId: "UTR412345678902" },
  "college.payout_reject": { payoutId: "po-1", amountMinor: 150000, reason: "Bank details do not match" },
  "college.bank_reveal": { collegeId: "c-1" },
  "role.create": { key: "exec_sales", name: "Sales exec", permissions: ["interns:read"] },
  "role.update": { changes: { permissions: { from: ["interns:read"], to: ["interns:read", "roles:write"] } } },
  "role.delete": { name: "Sales exec", key: "exec_sales" },
  "staff.create": { name: "Ravi", email: "ravi@findtern.in", role: "exec_sales" },
  "staff.update": { role: { from: "exec_sales", to: "admin" }, credentialsReset: true },
  "staff.delete": { name: "Ravi", email: "ravi@findtern.in", role: "exec_sales" },
  "user.activate": {},
  "user.deactivate": {},
  "promo.create": { code: "FB1INT10", discountType: "percentage", discountValue: 10, appliesTo: "employer", maxUsages: 50 },
  "promo.update": { code: "FB1INT10", discountType: "percentage", changes: { discountValue: { from: 10, to: 15 } } },
  "promo.delete": { code: "FB1INT10" },
  "promo.full_waiver_created": { codeTail: "JKMN", appliesTo: "employer", maxUsages: 1, validUntil: "2026-11-24T10:00:00.000Z" },
  "promo.full_waiver_redeemed": { orderId: "waiver_1", promoCodeId: "p-1", codeTail: "JKMN", accountId: "e-1", audience: "employer", amountWaivedMinor: 3520000, currency: "INR" },
  "intern.activation_marked_paid": { orderId: "ord_1", amountMinor: 49900, reference: "UTR412345678901" },
  "intern.marked_completed": { proposalId: "pr-1", bonusMinor: 100000 },
  "intern.completed_auto": { proposalId: "pr-1", timesheetId: "t-1", approverRole: "employer", bonusMinor: 100000 },
  "intern.approval_update": { approvalStatus: { from: "Pending", to: "Approved" } },
  "intern.ratings_update": { communication: 8, coding: 7, aptitude: 6, interview: 9, findternScore: { from: 7, to: 8 } },
  "intern.academics_update": { changes: { score: { from: "", to: "8.4" }, scoreType: { from: "", to: "cgpa" } }, offers: 1 },
  "intern.ratings_import": { rows: 20, updated: 18, failed: 2 },
  "interview.ai_link_added": { interviewId: "i1", host: "app.incruiter.com", changed: false },
  "company.update": { isActive: false, internationalFteStatus: { from: "none", to: "approved" } },
  "company.delete": { email: "hr@acme.test" },
  "intern.visibility": { visibility: "hidden", count: 2, ids: ["i-1", "i-2"] },
  "intern.skills_update": { skills: ["React", "SQL", "Excel", "Python"] },
  "payout.create": { internId: "i-1", proposalId: "pr-1", amountMinor: 800000, method: "bank", scheduledFor: "2026-12-01", months: 1 },
  "order.invoice_resent": { employerId: "e-1", invoiceNumber: "171126-01" },
  "payout.update": { internId: "i-1", amountMinor: 800000, statusFrom: "pending", statusTo: "failed", referenceFrom: "UTR1", referenceTo: "UTR2", noteChanged: true },
  "order.marked_received": { employerId: "e-1", amountMinor: 1760000 },
  "cms.create": { type: "blog", fields: ["title", "slug"] },
  "cms.update": { type: "blog", fields: ["title"] },
  "cms.delete": { type: "faq" },
  "notification.send": { title: "Hello", type: "custom", count: 12, interns: 10, employers: 2 },
  "message.mark_read": { isRead: true, count: 1, ids: ["m-1"] },
  "message.delete": { count: 1, ids: ["m-1"] },
  "ndc.create": { title: "Clause 1" },
  "ndc.update": { fields: ["title"] },
  "ndc.delete": {},
  "campaign.send": { orderId: "o-1", campaignId: "c-1", recipients: 120 },
  "campaign.resend": { orderId: "o-1", outboxId: "x-1", newOutboxId: "x-2" },
  "drive_order.create": { orderId: "o-1" },
  "drive_order.paid": { orderId: "o-1" },
  "drive_import.preview": { importId: "i-1" },
  "drive_import.confirm": { importId: "i-1" },
  "identity_review.decide": { reviewId: "r-1" },
  "project.approve": { projectName: "x" },
  "project.reject": { projectName: "x", reason: "x" },
  "project.takedown": { projectName: "x", reason: "x" },
  "project.restore": { projectName: "x" },
  "proposal.takedown_withdraw": { projectId: "p-1", projectName: "x", internId: "i-1", previousStatus: "sent" },
  "proposal.expired_unpaid": { proposalId: "pr-1", employerId: "e-1", internId: "i-1", startDate: "2026-11-23", reason: "unpaid_past_start" },
  "proposal.expired_no_reply": { proposalId: "pr-1", employerId: "e-1", internId: "i-1", startDate: "2026-11-23", reason: "no_reply_past_start" },
  "interview.expired": { interviewId: "iv-1", employerId: "e-1", internId: "i-1", previousStatus: "scheduled", reason: "time_passed_not_completed", endedAt: "2026-11-18T09:15:00Z" },
  "cgpa.verified": { internId: "i-1", semester: 5, claimedScore: "8.2" },
  "cgpa.marked_incorrect": { internId: "i-1", semester: 5, claimedScore: "8.9", correctedScore: "7.9", note: "Marksheet shows 7.9" },
  "subscription.granted": { employerId: "e-1", grantedUntil: "2027-11-17T00:00:00.000Z", note: "pilot customer" },
  "subscription.revoked": { employerId: "e-1", note: "chargeback" },
  "subscription.config_updated": { changes: { priceInrMinor: { from: 1000000, to: 1200000 }, durationDays: { from: 365, to: 365 }, enabled: { from: true, to: true } } },
  "roster_import.purge": { deleted: 3, batch: 200, retentionDays: 30, expiredBefore: "2026-11-08T00:00:00.000Z" },
  "college.admin_create": { collegeAdminId: "ca-1", name: "Asha", email: "tpo@college.test" },
  "terms.publish": { document: "Intern Terms", title: "Intern Terms" },
  "account.password_change": {},
  "college_code.attempt": { outcome: "no_match", codeMask: "FT7•••••", shapeOk: true, ip: "203.0.113.9" },
  "college_code.joined": { outcome: "joined", codeMask: "FT7•••••", shapeOk: true, ip: "203.0.113.9" },
  "college_promo.attempt": { outcome: "identity", kind: "drive", codeMask: "ABC•••••••", ip: "203.0.113.9", mismatch: ["phone"] },
  "college_promo.redeemed": { outcome: "redeemed", kind: "drive", codeMask: "ABC•••••••", ip: "203.0.113.9" },
  "account_type.switch": { from: "college", to: "individual" },
  "auth.admin_login": { ip: "203.0.113.9" },
  "auth.admin_logout": {},
  "export.companies": { rows: 8, filters: { type: "companies", status: "active" } },
  "export.projects": { rows: 5, filters: { type: "projects", status: "active" } },
  "export.proposals": { rows: 14, filters: { type: "proposals", status: "hired" } },
  "export.cgpa": { rows: 3, filters: { filter: "pending", q: "" } },
  "cgpa.employer_confirmed": { internId: "i-1", proposalId: "pr-1", employerId: "e-1", correctedScore: "7.9" },
  "proposal.hired": { proposalId: "pr-1", employerId: "e-1", internId: "i-1", orderId: "ord-1", paymentRowId: "pay-1" },
};

test("every call site's meta passes the redaction check: nothing sensitive leaks, nothing readable is lost", () => {
  assert.deepEqual(Object.keys(CALL_SITE_META).sort(), Object.keys(AUDIT_ACTIONS).sort(), "add a representative meta for each new audit action");
  for (const [action, meta] of Object.entries(CALL_SITE_META)) {
    // What a route really sends is stored unchanged unless it holds an account number.
    const stored = redactMeta(meta) as Record<string, unknown>;
    const hasAccount = JSON.stringify(meta).includes("123456789012");
    if (!hasAccount) assert.deepEqual(stored, meta, `${action}: redaction changed a harmless meta`);
    const flat = JSON.stringify(stored) + describeAudit(action, meta);
    assert.ok(!flat.includes("123456789012") && !flat.includes("987654321098"), `${action}: account number leaked`);

    // The same meta with secrets and account numbers planted in the usual shapes: none may survive.
    const planted = {
      ...meta,
      password: "Hunter2!",
      changes: { ...(meta.changes as object | undefined), password: { from: "oldPass1", to: "newPass2" }, accountNumber: { from: "123456789012", to: "987654321098" } },
      bank: { accountNumber: "123456789012" },
    };
    const out = JSON.stringify(redactMeta(planted)) + describeAudit(action, planted);
    for (const leak of ["Hunter2!", "oldPass1", "newPass2", "123456789012", "987654321098"]) assert.ok(!out.includes(leak), `${action}: leaked ${leak}`);
  }
});
