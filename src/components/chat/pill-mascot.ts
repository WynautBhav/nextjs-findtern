/**
 * Which clip the closed chat pill shows next. Pure (no DOM, no timers) so it is unit-tested with a fake rng;
 * pill-owl.tsx owns the videos and the clock.
 *
 * The pill rests on the idle loop 8-20 s, then plays ONE act once and returns to idle. Acts are drawn from a
 * shuffled bag holding every act once per cycle, so all of Findy's clips show up over time. Context only
 * re-orders the bag (it never hides a clip for good), except where a clip only makes sense in one situation:
 * sleepy needs a long idle page, and a wake-up (greet or eureka) follows it.
 */
import type { MascotClip } from "./mascot-state";

export type PillAct = Exclude<MascotClip, "idle">;

/** Every clip except the idle loop, which is the resting state. */
export const PILL_ACTS: readonly PillAct[] = ["greet", "think", "search", "eureka", "typing", "thumbs", "oops", "bye", "sleepy"];

/** Clip lengths (ffprobe of public/media/mascot/*.webm), used for the end-of-clip watchdog. */
export const PILL_DURATION_MS: Record<MascotClip, number> = {
  idle: 9834,
  greet: 3000,
  think: 5917,
  search: 5917,
  eureka: 3000,
  typing: 2417,
  thumbs: 5167,
  oops: 5917,
  bye: 5917,
  sleepy: 7750,
};

export const REST_MIN_MS = 8_000;
export const REST_MAX_MS = 20_000;
/** No input anywhere on the page for this long = the page is idle, so Findy may doze. */
export const SLEEPY_AFTER_IDLE_MS = 90_000;
/** oops (a stumble) joins the bag only every this many cycles. */
export const OOPS_EVERY_CYCLES = 2;
/** Scrolling this far (or any click) since the last act counts as "engaged": eureka and thumbs lead. */
export const ENGAGED_SCROLL_PX = 1500;
/** How much a clip that fits the page is pushed to the front of the bag. */
const BOOST = 8;
const WATCHDOG_SLACK_MS = 1500;

export type PickState = { bag: PillAct[]; last: PillAct | null; cycles: number };
export type PickContext = { path: string; idleMs: number; engaged: boolean };

export const initialPickState = (): PickState => ({ bag: [], last: null, cycles: 0 });

const clamp01 = (r: number) => Math.min(Math.max(r, 0), 0.999999);

export const restMs = (rng: () => number): number => Math.round(REST_MIN_MS + clamp01(rng()) * (REST_MAX_MS - REST_MIN_MS));
export const watchdogMs = (clip: MascotClip): number => PILL_DURATION_MS[clip] + WATCHDOG_SLACK_MS;
export const clipUrl = (clip: MascotClip, mp4: boolean): string => `/media/mascot/${clip}.${mp4 ? "mp4" : "webm"}`;

/** Pages where someone is looking things up: the magnifying glass fits. */
export const isSearchLike = (path: string): boolean => /(^|\/)(candidates|pricing|opportunities|search|talent|compare|faq|blog)(\/|$)/.test(path);

/** sleepy is only believable on a page nobody has touched for a while. */
export const revalidate = (clip: PillAct, ctx: PickContext): boolean => clip !== "sleepy" || ctx.idleMs >= SLEEPY_AFTER_IDLE_MS;

export type PillMode = "static" | "paused" | "run";
/** Reduced motion and Save-Data: the static poster, forever. Hidden tab: nothing plays until it is back. */
export const pillMode = ({ reducedMotion, saveData, hidden }: { reducedMotion: boolean; saveData: boolean; hidden: boolean }): PillMode =>
  reducedMotion || saveData ? "static" : hidden ? "paused" : "run";
export const mayDownload = ({ reducedMotion, saveData }: { reducedMotion: boolean; saveData: boolean }): boolean => !reducedMotion && !saveData;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(clamp01(rng()) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted draw: clips that fit the page weigh more. */
function draw(cands: PillAct[], ctx: PickContext, rng: () => number): PillAct {
  const weight = (c: PillAct) =>
    (c === "search" && isSearchLike(ctx.path) ? BOOST : 1) * ((c === "eureka" || c === "thumbs") && ctx.engaged ? BOOST : 1);
  let r = clamp01(rng()) * cands.reduce((n, c) => n + weight(c), 0);
  for (const c of cands) {
    if (r < weight(c)) return c;
    r -= weight(c);
  }
  return cands[cands.length - 1];
}

const WAKE: readonly PillAct[] = ["greet", "eureka"];

/** Next act from the bag: never the one just shown, sleepy only when idle, a wake-up after sleepy, boosted by context. */
export function nextAct(state: PickState, ctx: PickContext, rng: () => number): { clip: PillAct; state: PickState } {
  const { last } = state;
  let { bag, cycles } = state;
  const take = (clip: PillAct, from: PillAct[]) => {
    const at = from.indexOf(clip);
    return at < 0 ? from : [...from.slice(0, at), ...from.slice(at + 1)];
  };

  if (last === "sleepy") {
    // Wake-up: greet or eureka. If both were already used this cycle, play one without touching the bag.
    const inBag = bag.filter((c) => WAKE.includes(c));
    const clip = draw(inBag.length > 0 ? inBag : [...WAKE], ctx, rng);
    return { clip, state: { bag: take(clip, bag), last: clip, cycles } };
  }

  const allowed = (c: PillAct) => c !== last && revalidate(c, ctx);
  if (!bag.some(allowed)) {
    // Cycle over (or only unwelcome clips are left): add the ones not waiting already, shuffled.
    cycles += 1;
    const fresh = PILL_ACTS.filter((a) => !bag.includes(a) && (a !== "oops" || cycles % OOPS_EVERY_CYCLES === 0));
    bag = [...bag, ...shuffle(fresh, rng)];
  }
  let cands = bag.filter(allowed);
  if (cands.length === 0) cands = bag.filter((c) => c !== last);
  if (cands.length === 0) cands = [...bag];
  const clip = draw(cands, ctx, rng);
  return { clip, state: { bag: take(clip, bag), last: clip, cycles } };
}
