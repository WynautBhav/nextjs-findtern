import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Source-level guards for the college-account promo redemption (WP4): the server decides, a failed match says one
 * thing, every attempt is throttled and audited with a masked code, one fee is settled once, and a college account
 * has no other way to pay. These read the files, so removing a rule fails here, not in review.
 */

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("promo route: intern-only mutation guard, strict body of one field, throttle before the redeem", () => {
  const route = strip(read("app/api/intern/college-promo/route.ts"));
  assert.match(route, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
  const body = route.slice(route.indexOf("const bodySchema"), route.indexOf("/**", route.indexOf("const bodySchema")) > 0 ? route.indexOf("export async function POST") : undefined);
  assert.match(body, /z\.object\(\{ code: z\.string\(\)\.max\(\d+\) \}\)\.strict\(\)/);
  assert.ok(!/accountType|collegeId|college_id|entryId|name|phone|email|declaredAdult/.test(body), "the body cannot carry an identity, a college, an account type or a consent flag");
  assert.ok(route.indexOf("takeCodeAttempt") > -1 && route.indexOf("takeCodeAttempt") < route.indexOf("redeemCollegePromo("), "throttle first");
  assert.ok(route.includes("clientIp") && route.includes("status: 429") && route.includes("Retry-After"));
  assert.ok(route.includes("maskCode(parsed.data.code)") && !/meta:[^}]*code:\s*parsed/.test(route), "audit logs a masked code only");
  assert.ok(route.includes("college_promo.attempt") && route.includes("college_promo.redeemed"));
});

test("promo route: the browser gets one message for a failed match; the reason and the mismatched fields go to the audit only", () => {
  const route = strip(read("app/api/intern/college-promo/route.ts"));
  const respond = route.slice(route.indexOf("if (!r.ok) return NextResponse.json"));
  assert.ok(!/r\.reason|r\.mismatch|mismatch/.test(respond), "the response never carries the reason or the failed fields");
  assert.match(respond, /\{ error: r\.error \}/);
  const lib = strip(read("lib/college/promo-redeem.ts"));
  // Every refusal that could teach a prober something is built by generic(), which is always COLLEGE_PROMO_FAIL / 400.
  assert.match(lib, /const generic = .*error: COLLEGE_PROMO_FAIL/);
  assert.ok(!/error: `[^`]*\$\{/.test(lib), "no refusal text is built from a field or a code");
});

test("redeem: account type, college and fee come from the database; identity from the users row", () => {
  const lib = strip(read("lib/college/promo-redeem.ts"));
  assert.ok(lib.includes("collegeAccountState(uid)"), "account type and college are read server-side");
  assert.ok(lib.includes("getInternActivationFeeMinor()"), "the fee is the admin setting");
  assert.ok(!/\b2499\b|\b2500\b|249900|250000/.test(lib), "no fee is hardcoded");
  assert.ok(lib.includes("schema.users.firstName") && lib.includes("schema.users.phoneNumber") && lib.includes("schema.users.emailVerified"));
  assert.ok(lib.includes("state.home !== \"college_unpaid\""), "only an unpaid college account may redeem");
  assert.ok(lib.includes("if (state.paid) return { ok: true, alreadyPaid: true"), "a retry after payment is a no-op success");
});

test("redeem: the match is required on both code kinds, before money is written", () => {
  const lib = strip(read("lib/college/promo-redeem.ts"));
  // Drive code: the identity check runs inside the redeem transaction, ahead of redeemDriveCode.
  assert.ok(lib.includes("verify: async (client: PgClient)") && lib.includes("driveEntryDecision("));
  const flow = strip(read("lib/drives/redeem-flow.ts"));
  assert.ok(flow.indexOf("await input.verify?.(client)") > -1 && flow.indexOf("await input.verify?.(client)") < flow.indexOf("redeemDriveCode(client"));
  // Promo code: decided from the quote and the roster before the order row exists.
  assert.ok(lib.indexOf("collegePromoDecision(") > -1 && lib.indexOf("collegePromoDecision(") < lib.indexOf("openOrder("));
  assert.ok(lib.includes("if (!d.ok) return generic(d.reason"));
});

test("redeem: one fee settles once (same per-intern lock as the order route and the drive redeem), through the existing paid row", () => {
  const lib = strip(read("lib/college/promo-redeem.ts"));
  assert.ok(lib.includes("pg_advisory_xact_lock(hashtext($1))") && lib.includes("`intern-pay:${uid}`"), "drive path takes the per-intern lock before reading the entry");
  assert.ok(lib.indexOf("pg_advisory_xact_lock") < lib.indexOf("driveEntryDecision("), "lock before the check");
  const open = strip(read("lib/intern-order-open.ts"));
  assert.ok(open.includes("withLock(`intern-pay:${internId}`") && open.includes("isInternPaid(internId, tx)"), "promo path: check-and-insert under the same lock");
  assert.ok(lib.includes("openOrder(uid") && lib.includes("settleInternOrder("), "the existing settlement writes the paid row");
  assert.ok(lib.includes("alreadyPaid"), "the second tab gets the paid state, not an error");
  const db = strip(read("lib/drives/redeem-db.ts"));
  assert.ok(db.includes("BIND_ENTRY_SQL") && db.includes("intern_id IS NULL OR intern_id = $2"), "a roster entry binds to one student");
});

test("the payment lock lifts from the paid row alone: locked is never cached", () => {
  const unlock = strip(read("lib/intern-unlock.ts"));
  assert.ok(unlock.includes("intern_payments WHERE intern_id = ${uid} AND status = 'paid'"));
  assert.ok(/unlockedAt\.delete\(uid\);\s*return "locked"/.test(unlock), "a locked answer is not remembered");
});

test("a college account's fee has no other door: card order, drive-code redeem and claim answer 409 until it switches", () => {
  for (const f of ["app/api/intern/[id]/payment/razorpay/order/route.ts", "app/api/intern/drive-codes/redeem/route.ts", "app/api/intern/drive-codes/claim/route.ts"]) {
    const s = strip(read(f));
    assert.ok(s.includes("collegeAccountPayBlock("), `${f} must refuse a college account`);
    assert.ok(s.indexOf("collegeAccountPayBlock(") > s.indexOf("requireMutation("), `${f}: after the guard`);
  }
  const acct = strip(read("lib/college/account-state.ts"));
  assert.ok(acct.includes("s.home === \"college_unpaid\"") && acct.includes("status: 409"));
});

test("switching: server-side, audited, never trusts the browser, the college link is not touched", () => {
  const route = strip(read("app/api/intern/account-type/route.ts"));
  assert.match(route, /requireMutation\(\{ req, roles: \["intern"\] \}\)/);
  assert.ok(route.includes("decideAccountType(") && route.includes("hasCodeVerifiedMembership(uid)") && route.includes("isInternPaid(uid)"));
  assert.ok(route.includes("account_type.switch"));
  assert.ok(!/collegeMemberships|leaveCollege|internPayments/.test(route), "a switch changes the account type and nothing else");
});

test("Home: the college Home has no pay path; the 'Find your college' line is gone; individual stays as it was", () => {
  const page = strip(read("app/intern/dashboard/page.tsx"));
  assert.ok(!page.includes("Find your college") && !page.includes("Is your college on Findtern"));
  assert.ok(page.includes("collegeUnpaid ? (") && page.indexOf("<CollegePromoCard") < page.indexOf("<ActivationCard"), "the promo card replaces the payment form");
  assert.ok(page.includes("collegeAccountState(session.uid)"));
  assert.ok(page.includes("feeLabel={formatMoney(activationFeeMinor"), "the fee the confirmation names is the admin setting");
  const gs = strip(read("components/intern/getting-started.tsx"));
  assert.ok(gs.includes("showFee(stage) && !collegeAccount"), "a college account never shows the fee tile");
});

test("promo card: labelled field, error tied with aria-describedby, one live region, the always-visible way out", () => {
  const c = strip(read("components/intern/college-promo-card.tsx"));
  assert.ok(c.includes("htmlFor={inputId}") && c.includes("aria-describedby={msgId}") && c.includes('aria-live="polite"'));
  assert.ok(c.includes("Don&apos;t have a promo code? Switch to an individual account"));
  assert.ok(c.includes("Your college has paid your fee. You are all set."));
  assert.ok(c.includes('type: "individual"') && c.includes("setConfirmSwitch(true)"), "switching asks first");
  assert.ok(c.includes('className="rise ') || c.includes('"rise '), "the success state uses the 300 ms reduced-motion-safe entrance");
  assert.ok(!/\b2499\b|\b2500\b|₹/.test(c), "no price in the card");
  assert.ok(!c.includes("declaredAdult") && !c.includes("accountType"), "the browser sends a code only");
});
