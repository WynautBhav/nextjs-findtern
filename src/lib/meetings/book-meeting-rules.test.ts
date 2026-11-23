import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Source guards: the screens that show "Book meeting" and the booking service must all use the one hasOpenMeeting rule.
const ROOT = join(import.meta.dirname, "..", "..", "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("the booking service refuses a second open meeting through hasOpenMeeting", () => {
  assert.match(src("src/lib/meetings/service.ts"), /hasOpenMeeting\(open\)/);
});

test("every Book meeting button reads hasOpenMeeting (candidate list and quick view, profile, proposal, cart, schedule, orders)", () => {
  assert.match(src("src/lib/employer-visibility.ts"), /meetingOpen: hasOpenMeeting\(/);
  assert.match(src("src/components/employer/candidate-card.tsx"), /meetingOpen=\{meetingOpen\}/);
  assert.match(src("src/components/employer/intern-detail/hire-rail.tsx"), /meetingOpen=\{Boolean\(relation\?\.meetingOpen\)\}/);
  assert.match(src("src/app/employer/proposal/[id]/page.tsx"), /meetingOpen = hasOpenMeeting\(/);
  assert.match(src("src/app/employer/cart/page.tsx"), /meetingOpen: hasOpenMeeting\(/);
  assert.match(src("src/app/employer/schedule/schedule-view.tsx"), /meetingOpen=\{meetingOpen\}/);
  assert.match(src("src/app/employer/orders/page.tsx"), /meetingOpen: hasOpenMeeting\(/);
});

test("a disabled Book meeting button keeps its name, is aria-disabled and does not open the dialog", () => {
  const s = src("src/components/meetings/book-meeting-dialog.tsx");
  assert.match(s, /aria-disabled=\{meetingOpen \|\| undefined\}/);
  assert.match(s, /!meetingOpen && setOpen\(true\)/);
  assert.doesNotMatch(s, /Meeting open/);
});

test("a hired candidate keeps Book meeting where hires are listed (Orders)", () => {
  assert.match(src("src/components/employer/orders/hires-panel.tsx"), /label: "Book meeting"[^}]*disabled: h\.meetingOpen/);
});

test("the employer's no-show stage reads just Expired", () => {
  const s = src("src/app/employer/schedule/schedule-view.tsx");
  assert.match(s, /employer_no_show: \{ label: "Expired",/);
  assert.doesNotMatch(s, /employer didn't join/i);
});
