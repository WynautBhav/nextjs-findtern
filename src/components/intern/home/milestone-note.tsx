import { DatedNote } from "@/components/app/thread";
import type { InternData } from "@/lib/intern-data";
import { currentScore } from "@/lib/intern-data";
import { milestoneEvents, milestonesFor } from "@/lib/milestones";

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
  return <DatedNote storageKey={`findtern:milestones:${userId}`} label="Milestone" notes={notes} />;
}
