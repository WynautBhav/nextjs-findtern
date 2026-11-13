/**
 * A brand-new intern sees the profile progress bar on the first phone screen.
 *
 * Seeded new intern = intern-empty (no profile yet, Open to work on, presence
 * notice showing). On Home the GettingStarted tile's [role=progressbar] must
 * sit fully inside the first viewport, without scrolling, at 390x844 and at the
 * two common Android sizes, in Chromium and Firefox.
 *
 * Needs the situations seed (`npm run qa:seed`) and a running app:
 *
 *   E2E_BASE_URL=http://localhost:3500 node --test e2e/getting-started-visible.e2e.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chromium, firefox } from "playwright";

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
});

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
