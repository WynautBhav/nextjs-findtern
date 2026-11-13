/**
 * A brand-new intern sees the profile progress bar on the first phone screen.
 *
 * Seeded new intern = intern-empty (no profile yet, Open to work on, presence
 * notice showing). On Home the GettingStarted tile's [role=progressbar] must
 * sit fully inside the first viewport, without scrolling, at 390x844 and at the
 * two common Android sizes, in Chromium and Firefox.
 *
 * Second case, same persona with Open to work switched off: the "Profile hidden"
 * banner and the presence notice then stack above the bar, and the bar must still
 * be on the first screen. The test flips that one flag in the QA database for the
 * length of each test (it creates the onboarding row if the persona has none and
 * removes it again) and puts everything back.
 *
 * Needs the situations seed (`npm run qa:seed`), a running app and the same
 * loopback database the app reads:
 *
 *   DATABASE_URL=postgresql://... E2E_BASE_URL=http://localhost:3500 node --test e2e/getting-started-visible.e2e.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, firefox } from "playwright";

import { closeDb, one, rows } from "./lib/db.mjs";
import { baseUrl } from "./lib/env.mjs";
import { loginState, persona } from "./lib/session.mjs";

const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 412, height: 915 },
];
const browsers = {};
const states = {};

before(async () => {
  for (const [name, type] of Object.entries({ chromium, firefox })) {
    browsers[name] = await type.launch();
    states[name] = await loginState(browsers[name], persona("intern-empty"));
  }
});

after(async () => {
  for (const b of Object.values(browsers)) await b?.close();
  await closeDb();
});

/** Open to work off for the persona; returns the function that restores the previous state. */
async function openToWorkOff() {
  const email = persona("intern-empty").email;
  const user = await one("SELECT id FROM users WHERE email = $1", [email]);
  assert.ok(user, `${email} is not in the database (run npm run qa:seed)`);
  const before = await one("SELECT extra_data FROM intern_onboarding WHERE user_id = $1", [user.id]);
  if (before) {
    await rows(`UPDATE intern_onboarding SET extra_data = jsonb_set(COALESCE(extra_data, '{}'::jsonb), '{openToWork}', 'false') WHERE user_id = $1`, [user.id]);
    return () => rows("UPDATE intern_onboarding SET extra_data = $2 WHERE user_id = $1", [user.id, before.extra_data]);
  }
  await rows(`INSERT INTO intern_onboarding (user_id, extra_data) VALUES ($1, '{"openToWork": false}'::jsonb)`, [user.id]);
  return () => rows("DELETE FROM intern_onboarding WHERE user_id = $1", [user.id]);
}

for (const name of ["chromium", "firefox"]) {
  for (const size of SIZES) {
    test(`${name} ${size.width}x${size.height}: the progress bar is on the first screen`, async () => {
      const context = await browsers[name].newContext({ viewport: size, storageState: states[name] });
      try {
        const page = await context.newPage();
        await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
        const bar = page.getByRole("progressbar", { name: "Profile sections complete" });
        await bar.waitFor({ timeout: 30_000 });
        // Let the presence notice (client-read localStorage) settle: it is the tallest thing above the bar.
        await page.getByRole("region", { name: "Activity visibility" }).waitFor({ timeout: 5_000 }).catch(() => {});
        const box = await bar.boundingBox();
        assert.ok(box, "progress bar has a box");
        assert.ok(
          box.y + box.height < size.height,
          `progress bar bottom ${Math.round(box.y + box.height)}px is past the ${size.height}px viewport`,
        );
      } finally {
        await context.close();
      }
    });
  }
}

for (const name of ["chromium", "firefox"]) {
  for (const size of SIZES) {
    test(`${name} ${size.width}x${size.height}: with Open to work off, the progress bar is still on the first screen`, async () => {
      const restore = await openToWorkOff();
      const context = await browsers[name].newContext({ viewport: size, storageState: states[name] });
      try {
        const page = await context.newPage();
        await page.goto(new URL("/intern/dashboard", baseUrl()).toString(), { waitUntil: "domcontentloaded" });
        const bar = page.getByRole("progressbar", { name: "Profile sections complete" });
        await bar.waitFor({ timeout: 30_000 });
        // Both banners must be there, or this test would pass without exercising the stack.
        await page.getByRole("region", { name: "Profile hidden" }).waitFor({ timeout: 5_000 });
        await page.getByRole("region", { name: "Activity visibility" }).waitFor({ timeout: 5_000 });
        const box = await bar.boundingBox();
        assert.ok(box, "progress bar has a box");
        assert.ok(
          box.y + box.height < size.height,
          `progress bar bottom ${Math.round(box.y + box.height)}px is past the ${size.height}px viewport (Open to work off)`,
        );
      } finally {
        await context.close();
        await restore();
      }
    });
  }
}

