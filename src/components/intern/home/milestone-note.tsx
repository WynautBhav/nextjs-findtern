import { DatedNote } from "@/components/app/thread";
import type { InternData } from "@/lib/intern-data";
import { currentScore } from "@/lib/intern-data";
import { milestoneEvents, milestonesFor, noteGuardScript } from "@/lib/milestones";

/**
 * Before first paint on a hard load, shows only the first not-yet-dismissed note. The notes are server-rendered (so
 * the first one takes its space from the start and nothing below is pushed down after hydration); this inline
 * script, right after them, reads the same localStorage list the note writes and hides the dismissed ones. Server
 * component: no client JS, no new storage, nothing sent anywhere. If it is blocked the first due note shows and the
 * client corrects it as soon as it hydrates.
 */
function MilestoneGuard({ storageKey, label }: { storageKey: string; label: string }) {
  return <script dangerouslySetInnerHTML={{ __html: noteGuardScript(storageKey, label).replace(/</g, "\\u003c") }} />;
}

/**
 * A milestone note on Home: for 7 days after a real, dated event (profile submitted, score published, first offer,
 * first approved hours, first stipend) one quiet line with the fact and the next step. Built from rows the page
 * already loaded; nothing is stored or fetched, and dismissal is the browser's (see DatedNote).
 */
export function MilestoneNote({ data, userId, now = new Date() }: { data: Awaited<InternData>; userId: string; now?: Date }) {
  const extra = data.onboarding?.extraData ?? null;
  const notes = milestonesFor(
    milestoneEvents({
      proposals: data.proposals,
      timesheets: data.timesheets,
      payouts: data.payouts,
      extra,
      names: data.names,
      score: currentScore(extra) ?? null,
    }),
    now,
  ).map(({ id, fact, next }) => ({ id, fact, next }));
  if (notes.length === 0) return null;
  const storageKey = `findtern:milestones:${userId}`;
  return (
    <>
      <DatedNote storageKey={storageKey} label="Milestone" notes={notes} />
      <MilestoneGuard storageKey={storageKey} label="Milestone" />
    </>
  );
}
