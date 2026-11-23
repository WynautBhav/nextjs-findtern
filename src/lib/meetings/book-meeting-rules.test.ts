import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Source guards: the screens that show "Book meeting" and the booking service must all use the one hasOpenMeeting rule.
const ROOT = join(import.meta.dirname, "..", "..", "..");
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("the booking service and offering new times both refuse a second open meeting through one hasOpenMeeting helper", () => {
  const s = src("src/lib/meetings/service.ts");
  assert.match(s, /hasOpenMeeting\(exceptId \?/);
  assert.match(s, /input\.type === "reschedule" && \(await otherOpenMeeting\(tx, cur\.employerId, cur\.internId, cur\.id\)\)/);
  assert.match(s, /otherOpenMeeting\(tx, i\.employerId, i\.internId, null\)/);
});

test("the schedule dims the offer-new-times button when another meeting with the candidate is open", () => {
  assert.match(src("src/app/employer/schedule/schedule-view.tsx"), /rescheduleBlocked=\{rescheduleBlocked\}/);
  assert.match(src("src/components/employer/interview-actions.tsx"), /disabled=\{busy !== null \|\| rescheduleBlocked\}/);
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

test("a no-show, a missed round and a lapsed one all read Meeting expired, on both sides (owner, 23 Nov)", () => {
  const s = src("src/app/employer/schedule/schedule-view.tsx");
  for (const stage of ["expired", "employer_no_show", "missed"]) assert.match(s, new RegExp(`${stage}: \\{ label: "Meeting expired",`));
  assert.doesNotMatch(s, /employer didn't join/i);
  const intern = src("src/components/meetings/intern-rows.tsx");
  assert.doesNotMatch(intern, /label: "(Missed|Expired|Employer didn't join)"/);
});
