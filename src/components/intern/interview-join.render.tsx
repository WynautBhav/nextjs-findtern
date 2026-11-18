/**
 * Renders the intern's Join component to static markup for each state and
 * prints it as JSON. Run by interview-join.test.ts through tsx (the repo's
 * `node --test` runner cannot read JSX or the `@/` alias itself).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { InterviewJoin } from "./interview-join";

const START = Date.parse("2026-11-20T10:00:00Z");
const at = (m: number) => new Date(START + m * 60_000).toISOString();
const base = {
  status: "scheduled",
  selectedSlot: 1,
  slot1: new Date(START).toISOString(),
  slot2: null,
  slot3: null,
  meetingLink: "https://meet.google.com/abc-defg-hij",
};

const cases: Record<string, { now: string; interview: typeof base | (Omit<typeof base, "meetingLink" | "status" | "selectedSlot"> & { meetingLink: string | null; status: string; selectedSlot: number | null }) }> = {
  too_early: { now: at(-45), interview: base },
  open: { now: at(-10), interview: base },
  mid: { now: at(12), interview: base },
  ended: { now: at(90), interview: base },
  no_link: { now: at(-45), interview: { ...base, meetingLink: null } },
  cancelled: { now: at(0), interview: { ...base, status: "cancelled" } },
  completed: { now: at(0), interview: { ...base, status: "completed" } },
  no_slot: { now: at(0), interview: { ...base, selectedSlot: null } },
};

const out: Record<string, string> = {};
for (const [name, c] of Object.entries(cases)) {
  out[name] = renderToStaticMarkup(<InterviewJoin interview={c.interview} serverNow={c.now} />);
}
console.log(JSON.stringify(out));
