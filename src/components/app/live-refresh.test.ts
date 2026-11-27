import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Bug sheet 27 Nov, item 5: screens showing what the OTHER side does (a student's request, an employer joining, an
 * intern's answer, a new alert) only refreshed after your own click, so people reloaded by hand. These screens must
 * keep the shared <LiveRefresh />; removing it brings the manual reload back.
 */
const LIVE_SCREENS = [
  "src/app/college/page.tsx",
  "src/app/college/approvals/page.tsx",
  "src/app/college/leave-requests/page.tsx",
  "src/app/college/drives/page.tsx",
  "src/app/college/drives/[id]/page.tsx",
  "src/app/college/students/page.tsx",
  "src/app/employer/dashboard/page.tsx",
  "src/app/employer/proposals/page.tsx",
  "src/app/employer/schedule/schedule-view.tsx",
  "src/app/employer/timesheets/page.tsx",
  "src/app/intern/dashboard/page.tsx",
  "src/app/intern/proposals/page.tsx",
  "src/app/intern/interviews/page.tsx",
  "src/app/intern/notifications/notifications-view.tsx",
];

for (const file of LIVE_SCREENS) {
  test(`${file} re-reads the server while open`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /from "@\/components\/app\/live-refresh"/);
    assert.match(src, /<LiveRefresh\b/);
  });
}

// Components that copy server data into state must adopt the next server read, or a refresh changes nothing on screen.
const ADOPTS_FRESH_PROPS: [string, RegExp][] = [
  ["src/components/employer/cart-manager.tsx", /seenCartLines !== initialCartLines/],
  ["src/components/employer/projects-manager.tsx", /seenProjects !== initialProjects/],
  ["src/components/employer/full-time-offer-button.tsx", /seenFte !== initialFte/],
  ["src/components/intern/activation-card.tsx", /seenPaid !== alreadyPaid/],
  ["src/components/college/link-actions.tsx", /seenUrl !== \(props\.initialUrl \?\? null\)/],
];
for (const [file, rule] of ADOPTS_FRESH_PROPS) {
  test(`${file} adopts fresh server props`, () => assert.match(readFileSync(file, "utf8"), rule));
}
