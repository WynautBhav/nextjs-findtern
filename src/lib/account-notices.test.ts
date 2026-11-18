import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3201";
const { accountNoticeEmail, sendAccountNotice, shouldNotify, uniqueAddresses, DISABLED_SUBJECT, ENABLED_SUBJECT, inBatches } = await import("./account-notices.ts");
const { SITE } = await import("./content/site.ts");

test("only a real change of state sends a mail", () => {
  assert.equal(shouldNotify(true, false), true);
  assert.equal(shouldNotify(false, true), true);
  assert.equal(shouldNotify(false, false), false);
  assert.equal(shouldNotify(true, true), false);
});

test("subjects are exact", () => {
  assert.equal(DISABLED_SUBJECT, "Your Findtern account has been disabled");
  assert.equal(ENABLED_SUBJECT, "Your Findtern account is active again");
  for (const kind of ["employer", "intern", "college"] as const) {
    assert.equal(accountNoticeEmail({ kind, active: false, name: "X" }).subject, DISABLED_SUBJECT);
    assert.equal(accountNoticeEmail({ kind, active: true, name: "X" }).subject, ENABLED_SUBJECT);
  }
});

test("employer disabled mail: exact sentence, admin email, mailto CTA", () => {
  const c = accountNoticeEmail({ kind: "employer", active: false, name: "Northwind Labs", greetingName: "Arjun" });
  assert.equal(
    c.lines[0],
    `Your company account Northwind Labs on Findtern has been disabled by our team. You will not be able to sign in until it is re-enabled. Please contact ${SITE.adminEmail}.`,
  );
  assert.deepEqual(c.cta, { label: "Contact admin", url: `mailto:${SITE.adminEmail}` });
  assert.equal(c.greeting, "Hi Arjun,");
  assert.equal(c.tone, "alert");
});

test("intern and college copy are adapted, not the company sentence", () => {
  const i = accountNoticeEmail({ kind: "intern", active: false, name: "" });
  assert.ok(i.lines[0].startsWith("Your Findtern account has been disabled by our team."));
  assert.ok(!i.lines[0].includes("company"));
  const c = accountNoticeEmail({ kind: "college", active: false, name: "IIT Test" });
  assert.ok(c.lines[0].startsWith("The Findtern placement console account for IIT Test has been disabled"));
});

test("re-enabled mail points at the right sign-in", () => {
  const e = accountNoticeEmail({ kind: "employer", active: true, name: "Northwind Labs" });
  assert.equal(e.cta?.url, "http://127.0.0.1:3201/login?as=employer");
  assert.ok(e.lines[0].includes("is active again"));
});

test("recipients are deduplicated case-insensitively", () => {
  assert.deepEqual(uniqueAddresses(["A@x.in", "a@X.in", " ", null, "b@x.in"]), ["A@x.in", "b@x.in"]);
});

test("send: one mail per distinct address; log mode is neither emailed nor failed", async () => {
  const sent: string[] = [];
  const r = await sendAccountNotice(
    { kind: "employer", active: false, name: "N", to: [{ email: "hr@n.in" }, { email: "HR@n.in" }, { email: "owner@n.in" }] },
    { send: async (m) => { sent.push(`${m.to}|${m.subject}`); return { ok: true, mode: "log" }; } },
  );
  assert.deepEqual(sent, [`hr@n.in|${DISABLED_SUBJECT}`, `owner@n.in|${DISABLED_SUBJECT}`]);
  assert.deepEqual(r, { emailed: false, emailFailed: false, recipients: 2 });
});

test("send: real delivery reports emailed; a failing or throwing send reports emailFailed and never throws", async () => {
  const ok = await sendAccountNotice({ kind: "intern", active: true, name: "", to: [{ email: "a@b.in" }] }, { send: async () => ({ ok: true, mode: "send" }) });
  assert.equal(ok.emailed, true);
  const bad = await sendAccountNotice({ kind: "intern", active: false, name: "", to: [{ email: "a@b.in" }, { email: "c@d.in" }] }, { send: async () => ({ ok: false, error: "smtp down" }) });
  assert.deepEqual(bad, { emailed: false, emailFailed: true, recipients: 2 });
  const boom = await sendAccountNotice({ kind: "intern", active: false, name: "", to: [{ email: "a@b.in" }] }, { send: async () => { throw new Error("x"); } });
  assert.equal(boom.emailFailed, true);
});

test("inBatches never runs more than the limit at once", async () => {
  let live = 0;
  let peak = 0;
  await inBatches([1, 2, 3, 4, 5, 6, 7], 3, async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; });
  assert.equal(peak, 3);
});
