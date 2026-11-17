import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { clipFor, type MascotClip } from "./mascot-state.ts";
import {
  ENGAGED_SCROLL_PX,
  OOPS_EVERY_CYCLES,
  PILL_ACTS,
  PILL_DURATION_MS,
  REST_MAX_MS,
  REST_MIN_MS,
  SLEEPY_AFTER_IDLE_MS,
  clipUrl,
  initialPickState,
  isSearchLike,
  mayDownload,
  nextAct,
  pillMode,
  restMs,
  revalidate,
  watchdogMs,
  type PickContext,
  type PickState,
  type PillAct,
} from "./pill-mascot.ts";

/** mulberry32: a deterministic rng, so a failure is reproducible from its seed. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const awake: PickContext = { path: "/about", idleMs: 0, engaged: false };
const dozing: PickContext = { path: "/about", idleMs: SLEEPY_AFTER_IDLE_MS, engaged: false };

function picks(n: number, ctx: PickContext, rng: () => number, from: PickState = initialPickState()) {
  const out: PillAct[] = [];
  let state = from;
  for (let i = 0; i < n; i++) {
    const r = nextAct(state, ctx, rng);
    out.push(r.clip);
    state = r.state;
  }
  return { out, state };
}

test("the pill covers every clip the panel can show (idle is the resting loop, the rest are acts)", () => {
  const states = ["idle", "greeting", "thinking", "searching", "celebrating", "typing", "thanked", "oops", "bye", "sleepy"] as const;
  const all = new Set<MascotClip>(states.map(clipFor));
  assert.deepEqual([...PILL_ACTS].sort(), [...all].filter((c) => c !== "idle").sort());
  assert.equal(all.size, 10);
});

test("every pill clip exists as webm and mp4 under public/media/mascot", () => {
  for (const c of ["idle", ...PILL_ACTS]) {
    for (const ext of ["webm", "mp4"]) {
      assert.ok(existsSync(new URL(`../../../public${clipUrl(c as MascotClip, ext === "mp4")}`, import.meta.url)), `${c}.${ext}`);
    }
    assert.ok(PILL_DURATION_MS[c as MascotClip] > 1000, `${c} has a duration`);
  }
});

test("clipUrl picks webm, or mp4 for browsers that drop WebM alpha", () => {
  assert.equal(clipUrl("greet", false), "/media/mascot/greet.webm");
  assert.equal(clipUrl("sleepy", true), "/media/mascot/sleepy.mp4");
});

test("a clip never plays twice in a row, across many bag boundaries and seeds", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { out } = picks(400, { ...awake, idleMs: SLEEPY_AFTER_IDLE_MS }, seeded(seed));
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i], out[i - 1], `seed ${seed} pick ${i}`);
  }
});

test("rotation: every act appears within the first two bag cycles, and no act is ever starved", () => {
  const window = 2 * PILL_ACTS.length;
  for (let seed = 1; seed <= 40; seed++) {
    const { out } = picks(300, { ...awake, idleMs: SLEEPY_AFTER_IDLE_MS }, seeded(seed));
    assert.deepEqual(new Set(out.slice(0, window)), new Set(PILL_ACTS), `seed ${seed}: first ${window} picks`);
    for (const act of PILL_ACTS) {
      let gap = 0;
      let worst = 0;
      for (const p of out) {
        gap = p === act ? 0 : gap + 1;
        worst = Math.max(worst, gap);
      }
      // oops joins every second cycle, so it may wait up to three cycles.
      const limit = act === "oops" ? 3 * PILL_ACTS.length + 2 : window + 2;
      assert.ok(worst <= limit, `seed ${seed}: ${act} waited ${worst} picks`);
    }
  }
});

test("a non-oops act is shown once per bag cycle (a shuffled bag, not pure random)", () => {
  const { out } = picks(8 * 4, { ...awake, idleMs: SLEEPY_AFTER_IDLE_MS }, seeded(7));
  // The first cycle is 8 acts (no oops: it is rare); each act exactly once.
  const first = out.slice(0, 8);
  assert.equal(new Set(first).size, 8);
  assert.ok(!first.includes("oops"), "oops is not in every cycle");
});

test("oops is rare: it only joins every OOPS_EVERY_CYCLES-th cycle", () => {
  assert.equal(OOPS_EVERY_CYCLES, 2);
  const { out } = picks(PILL_ACTS.length * 10, { ...awake, idleMs: SLEEPY_AFTER_IDLE_MS }, seeded(3));
  const oops = out.filter((a) => a === "oops").length;
  const others = out.filter((a) => a === "think").length;
  assert.ok(oops >= 1, "still shows up");
  assert.ok(oops < others, `oops ${oops} is rarer than think ${others}`);
});

test("sleepy only after a long idle stretch of the page", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { out } = picks(300, { ...awake, idleMs: SLEEPY_AFTER_IDLE_MS - 1 }, seeded(seed));
    assert.ok(!out.includes("sleepy"), `seed ${seed}`);
  }
  const { out } = picks(2 * PILL_ACTS.length, dozing, seeded(5));
  assert.ok(out.includes("sleepy"), "sleepy shows once the page has been idle");
});

test("sleepy that is waiting stays in the bag until the page is idle (no coverage lost)", () => {
  const rng = seeded(11);
  const a = picks(20, awake, rng);
  assert.ok(!a.out.includes("sleepy"));
  const b = picks(2 * PILL_ACTS.length, dozing, rng, a.state);
  assert.ok(b.out.includes("sleepy"));
});

test("after sleepy comes a wake-up: greet or eureka", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { out } = picks(120, dozing, seeded(seed));
    out.forEach((a, i) => {
      if (a === "sleepy" && i + 1 < out.length) assert.ok(out[i + 1] === "greet" || out[i + 1] === "eureka", `seed ${seed}: sleepy -> ${out[i + 1]}`);
    });
  }
});

test("search leads the cycle on search-like pages", () => {
  assert.ok(isSearchLike("/pricing") && isSearchLike("/employer/candidates") && isSearchLike("/opportunities") && isSearchLike("/faq"));
  assert.ok(!isSearchLike("/about") && !isSearchLike("/") && !isSearchLike("/contact"));
  const firstRate = (path: string) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) if (picks(1, { path, idleMs: 0, engaged: false }, seeded(seed)).out[0] === "search") n++;
    return n / 300;
  };
  assert.ok(firstRate("/pricing") > 0.45, `on /pricing: ${firstRate("/pricing")}`);
  assert.ok(firstRate("/about") < 0.25, `on /about: ${firstRate("/about")}`);
});

test("eureka and thumbs lead the cycle after the user scrolled or clicked a lot", () => {
  const rate = (engaged: boolean) => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const a = picks(1, { path: "/about", idleMs: 0, engaged }, seeded(seed)).out[0];
      if (a === "eureka" || a === "thumbs") n++;
    }
    return n / 300;
  };
  assert.ok(rate(true) > 0.5, `engaged ${rate(true)}`);
  assert.ok(rate(false) < 0.4, `not engaged ${rate(false)}`);
  assert.ok(ENGAGED_SCROLL_PX >= 1000);
});

test("a stale sleepy is rejected when the page woke up between the pick and the play", () => {
  assert.equal(revalidate("sleepy", awake), false);
  assert.equal(revalidate("sleepy", dozing), true);
  assert.equal(revalidate("greet", awake), true);
});

test("resting idle lasts 8-20 s, jittered", () => {
  assert.equal(REST_MIN_MS, 8_000);
  assert.equal(REST_MAX_MS, 20_000);
  assert.equal(restMs(() => 0), 8_000);
  assert.ok(restMs(() => 0.999999) <= 20_000);
  assert.ok(restMs(() => 1) <= 20_000 && restMs(() => -3) >= 8_000);
  assert.equal(new Set([0.1, 0.4, 0.8].map((r) => restMs(() => r))).size, 3);
});

test("no acts while hidden or in reduced motion; Save-Data and reduced motion download nothing", () => {
  assert.equal(pillMode({ reducedMotion: false, saveData: false, hidden: false }), "run");
  assert.equal(pillMode({ reducedMotion: false, saveData: false, hidden: true }), "paused");
  assert.equal(pillMode({ reducedMotion: true, saveData: false, hidden: false }), "static");
  assert.equal(pillMode({ reducedMotion: true, saveData: false, hidden: true }), "static");
  assert.equal(pillMode({ reducedMotion: false, saveData: true, hidden: false }), "static");
  assert.equal(mayDownload({ reducedMotion: false, saveData: false }), true);
  assert.equal(mayDownload({ reducedMotion: true, saveData: false }), false);
  assert.equal(mayDownload({ reducedMotion: false, saveData: true }), false);
});

test("the end-of-clip watchdog allows the clip's own length plus slack", () => {
  for (const c of PILL_ACTS) assert.ok(watchdogMs(c) > PILL_DURATION_MS[c]);
});
