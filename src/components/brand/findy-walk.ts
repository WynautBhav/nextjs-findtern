/**
 * Pure rules for Findy's appearances around the header logo (no DOM, no timers, no `@/` imports, so
 * `node --test` can load it). logo-findy.tsx owns the video and the animations and calls these with the
 * real clock, rng and measurements; the tests call them with fakes.
 */

export type Rng = () => number;
export type Side = "right" | "left";
export type FindyAct = "peek" | "peekWave" | "walkOut" | "walkLeft" | "walkBoth" | "hop";

export type Timing = { minMs: number; maxMs: number; gapMs: number };
/** Between appearances: 25-70 s, never closer than 20 s to the end of the previous one. */
export const NORMAL_TIMING: Timing = { minMs: 25_000, maxMs: 70_000, gapMs: 20_000 };
/** `?findy=schedule-fast`: lets a browser test watch the scheduler without waiting a minute. */
export const FAST_TIMING: Timing = { minMs: 3_000, maxMs: 6_000, gapMs: 2_000 };

/** A blocked run re-checks after 1-3 s instead of skipping its whole interval. */
export const RETRY_MIN_MS = 1_000;
export const RETRY_MAX_MS = 3_000;
/** Scrolling counts as "active" until it has been quiet this long. */
export const SCROLL_QUIET_MS = 1_500;

/** Shortest walk (px of actual walking beyond the step-out) worth doing; shorter becomes a peek or hop. */
export const MIN_WALK_PX = 24;
/** Longest walk beyond the step-out at desktop scale (multiplied by k on phones). */
export const WALK_MAX_PX = 72;
/** The walk clip's pace: 72 px in 1.7 s. */
const WALK_MS_PER_PX = 1700 / 72;

const clamp01 = (r: number) => Math.min(Math.max(r, 0), 0.999999);

export const nextDelayMs = (rng: Rng, t: Timing = NORMAL_TIMING): number =>
  Math.round(t.minMs + clamp01(rng()) * (t.maxMs - t.minMs));

/** When the next run may start: at `wantedAt`, but never sooner than `gapMs` after the previous run ended. */
export const earliestStart = ({ wantedAt, lastEndAt, gapMs }: { wantedAt: number; lastEndAt: number | null; gapMs: number }): number =>
  lastEndAt === null ? wantedAt : Math.max(wantedAt, lastEndAt + gapMs);

export type BlockState = {
  hidden: boolean;
  hovered: boolean;
  menuOpen: boolean;
  dialogOpen: boolean;
  lastScrollAt: number;
  now: number;
};
export type Blocked = { reason: "hidden" | "hovered" | "menu" | "dialog" | "scroll"; retryMs: number };

/** Null when Findy may appear now; otherwise why not, and when to look again. */
export function blockedFor(s: BlockState, rng: Rng): Blocked | null {
  const reason: Blocked["reason"] | null = s.hidden
    ? "hidden"
    : s.hovered
      ? "hovered"
      : s.menuOpen
        ? "menu"
        : s.dialogOpen
          ? "dialog"
          : s.now - s.lastScrollAt < SCROLL_QUIET_MS
            ? "scroll"
            : null;
  if (!reason) return null;
  return { reason, retryMs: Math.round(RETRY_MIN_MS + clamp01(rng()) * (RETRY_MAX_MS - RETRY_MIN_MS)) };
}

/** Geometry of Findy's body centre, in px from the logo link's left edge. `k` is 1 on desktop, 44/56 on phones. */
export function positions(side: Side, linkWidth: number, k: number): { hidden: number; peek: number; out: number } {
  return side === "right"
    ? { hidden: linkWidth - 30 * k, peek: linkWidth + 2 * k, out: linkWidth + 28 * k }
    : { hidden: 30 * k, peek: -2 * k, out: -28 * k };
}

/**
 * Free walking room beyond the step-out on each side (negative: even the step-out does not fit).
 * Right: up to `margin` px short of the next visible element (the nav, or the actions on phones), so he never
 * touches the links or the CTA. Left: until his body would leave the viewport.
 */
export function walkRoom({
  linkLeft,
  linkWidth,
  nextLeft,
  k,
  margin = 24,
}: {
  linkLeft: number;
  linkWidth: number;
  nextLeft: number | null;
  k: number;
  margin?: number;
}): { right: number; left: number } {
  const right = nextLeft === null ? Infinity : nextLeft - linkLeft - margin - (linkWidth + 28 * k);
  // Body is ~40k wide; keep 8 px of it on screen margin.
  const left = linkLeft - 28 * k - (20 * k + 8);
  return { right, left };
}

/** 0 when the room is below the minimum walk (do a peek or hop instead); otherwise the room, capped at `max`. */
export const walkDistance = (room: number, max: number, min: number = MIN_WALK_PX): number => (room < min ? 0 : Math.min(room, max));

export const walkMs = (distance: number): number => Math.max(500, Math.round(distance * WALK_MS_PER_PX));

export type Plan = { act: FindyAct; side: Side; right: number; left: number };

const WEIGHT: Record<FindyAct, number> = { peek: 2, peekWave: 3, hop: 2, walkOut: 4, walkLeft: 2, walkBoth: 2 };
const SHORT_ACTS: ReadonlySet<FindyAct> = new Set(["peek", "peekWave", "hop", "walkOut"]);

/**
 * Chooses the next act from what the measured room allows: weighted random, never the same act twice in a row
 * unless nothing else is possible. `short` (hover cameos) keeps to the brief acts. Null when nothing fits.
 */
export function pickPlan({ rng, room, last, k, short }: { rng: Rng; room: { right: number; left: number }; last: FindyAct | null; k: number; short: boolean }): Plan | null {
  const rightFits = room.right >= 0;
  const leftFits = room.left >= 0;
  const right = rightFits ? walkDistance(room.right, WALK_MAX_PX * k) : 0;
  const left = leftFits ? walkDistance(room.left, WALK_MAX_PX * k) : 0;

  const can: Record<FindyAct, boolean> = {
    peek: rightFits || leftFits,
    peekWave: rightFits || leftFits,
    hop: rightFits || leftFits,
    walkOut: right > 0,
    walkLeft: left > 0,
    walkBoth: right > 0 && left > 0,
  };
  let acts = (Object.keys(WEIGHT) as FindyAct[]).filter((a) => can[a] && (!short || SHORT_ACTS.has(a)));
  if (acts.length === 0) return null;
  if (last && acts.length > 1) acts = acts.filter((a) => a !== last);

  const total = acts.reduce((n, a) => n + WEIGHT[a], 0);
  let r = clamp01(rng()) * total;
  let act = acts[acts.length - 1];
  for (const a of acts) {
    if (r < WEIGHT[a]) {
      act = a;
      break;
    }
    r -= WEIGHT[a];
  }

  let side: Side = "right";
  if (act === "walkLeft") side = "left";
  else if (act === "peek" || act === "peekWave" || act === "hop") {
    side = rightFits && leftFits ? (clamp01(rng()) < 0.25 ? "left" : "right") : rightFits ? "right" : "left";
  }
  return { act, side, right, left };
}

/** Dev/test flags: `?findy=walk` (force a run now), `?findy=schedule-fast`; localStorage `findy-logo-force=walk` also forces. */
export function parseFindyFlags(search: string, stored: string | null): { force: boolean; fast: boolean } {
  const tokens = new Set((new URLSearchParams(search).get("findy") ?? "").split(/[,+]/));
  return { force: tokens.has("walk") || stored === "walk", fast: tokens.has("schedule-fast") };
}
