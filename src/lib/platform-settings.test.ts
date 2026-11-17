import assert from "node:assert/strict";
import { register } from "node:module";
import test, { beforeEach } from "node:test";

/** The subscription and AI-link settings: typed getters that never throw and always have a default. */

register("./admin/test-support/sem-hooks.mjs", import.meta.url);
const fakes = (await import("./admin/test-support/sem-fakes.mjs")) as typeof import("./admin/test-support/sem-fakes.mjs");
const settings = await import("./platform-settings.ts");

type Fake = { rows: Record<string, unknown>; dbDown: boolean; noDb: boolean; failSelect: string | null };
const sem = () => (globalThis as unknown as { __sem: Fake }).__sem;
beforeEach(() => fakes.reset());
const stored = (value: unknown) => {
  sem().rows.platform_settings = value === undefined ? [] : [{ value }];
};

test("defaults: subscription Rs 10,000 / 365 days / on, no overrides, AI links expire after 7 days", () => {
  assert.deepEqual(settings.SETTING_DEFAULTS.employer_subscription, { priceInrMinor: 1_000_000, durationDays: 365, enabled: true });
  assert.deepEqual(settings.SETTING_DEFAULTS.employer_subscription_overrides, {});
  assert.equal(settings.SETTING_DEFAULTS.ai_link_expiry_days, 7);
});

test("getEmployerSubscriptionConfig: stored values, field by field, else the defaults", async () => {
  stored({ priceInrMinor: 2_500_000, durationDays: 180, enabled: false });
  assert.deepEqual(await settings.getEmployerSubscriptionConfig(), { priceInrMinor: 2_500_000, durationDays: 180, enabled: false });
  stored({ priceInrMinor: "x", durationDays: 90 });
  assert.deepEqual(await settings.getEmployerSubscriptionConfig(), { priceInrMinor: 1_000_000, durationDays: 90, enabled: true });
  stored(undefined);
  assert.deepEqual(await settings.getEmployerSubscriptionConfig(), settings.SETTING_DEFAULTS.employer_subscription);
});

test("getEmployerSubscriptionOverrides: the stored map, garbage is empty", async () => {
  stored({ e1: { grantedUntil: "2027-01-01T00:00:00.000Z", by: "a", note: "n" } });
  assert.deepEqual(await settings.getEmployerSubscriptionOverrides(), { e1: { grantedUntil: "2027-01-01T00:00:00.000Z", by: "a", note: "n" } });
  stored("junk");
  assert.deepEqual(await settings.getEmployerSubscriptionOverrides(), {});
  stored(undefined);
  assert.deepEqual(await settings.getEmployerSubscriptionOverrides(), {});
});

test("getAiLinkExpiryDays: a whole number of days from 1 to 365, else 7", async () => {
  stored(14);
  assert.equal(await settings.getAiLinkExpiryDays(), 14);
  stored(" 3 ");
  assert.equal(await settings.getAiLinkExpiryDays(), 3);
  for (const bad of [0, -1, 366, 2.5, "x", null, {}, [], Number.NaN]) {
    stored(bad);
    assert.equal(await settings.getAiLinkExpiryDays(), 7, String(bad));
  }
  stored(undefined);
  assert.equal(await settings.getAiLinkExpiryDays(), 7);
});

test("every getter falls back to its default when the database is down, missing or failing", async () => {
  for (const break_ of [() => (sem().dbDown = true), () => (sem().noDb = true), () => (sem().failSelect = "platform_settings")]) {
    fakes.reset();
    break_();
    assert.deepEqual(await settings.getEmployerSubscriptionConfig(), settings.SETTING_DEFAULTS.employer_subscription);
    assert.deepEqual(await settings.getEmployerSubscriptionOverrides(), {});
    assert.equal(await settings.getAiLinkExpiryDays(), 7);
  }
});
