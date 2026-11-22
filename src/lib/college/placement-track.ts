/**
 * A student's way to a placement, as five steps in the order the app opens them: the AI interview puts a student in
 * the employer pool (lib/employer-pool.ts), an employer then makes an offer, and the offer becomes a hire. "Stuck at" is
 * the first step not reached, so every student sits in exactly one group and the groups add up to the whole list.
 * A finished profile is not a step: employers can see a student without one; it only blocks the hire (lib/hire-gate.ts),
 * so it shows as a note beside the step.
 */
export const STEPS = [
  { id: "joined", label: "Joined" },
  { id: "interview", label: "AI interview" },
  { id: "seen", label: "Seen by employers" },
  { id: "offer", label: "Offer" },
  { id: "hired", label: "Hired" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
/** Where a student stands: the first step not reached, or "done" once hired. */
export type Stuck = Exclude<StepId, "joined"> | "done";

export type TrackFacts = { interviewed: boolean; seen: boolean; offers: number; hired: number };

/** How many of the five steps are reached, counting from Joined and stopping at the first gap. */
export function stepsReached(f: TrackFacts): number {
  // A hire is the end, whatever came before (a placed student often turns off Open to work); an offer proves an
  // employer saw them.
  if (f.hired > 0) return STEPS.length;
  const done = [true, f.interviewed, f.seen || f.offers > 0, f.offers > 0, false];
  const gap = done.indexOf(false);
  return gap === -1 ? done.length : gap;
}

export function stuckAt(f: TrackFacts): Stuck {
  const n = stepsReached(f);
  return n >= STEPS.length ? "done" : (STEPS[n].id as Stuck);
}
