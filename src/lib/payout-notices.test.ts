import assert from "node:assert/strict";
import { test } from "node:test";

import { emails, renderEmail } from "./emails.ts";
import { internNotificationHref } from "./notification-href.ts";

test("completion bonus email names the bonus and links to intern earnings", () => {
  const c = emails.completionBonusPaid({ internName: "Asha", role: "Data Analyst", amount: "₹2,500" });
  assert.match(c.subject, /Completion bonus transferred/);
  assert.deepEqual(c.facts, [["Amount", "₹2,500"]]);
  assert.match(c.cta?.url ?? "", /\/intern\/earnings$/);
  assert.match(renderEmail(c).text, /Data Analyst/);
  assert.doesNotMatch(renderEmail(c).text, /stipend/i);
});

test("a completion bonus notification opens intern earnings", () => {
  assert.equal(internNotificationHref("completion_bonus_paid", { payoutId: "x" }), "/intern/earnings");
  assert.equal(internNotificationHref("stipend_paid", {}), "/intern/earnings");
});
