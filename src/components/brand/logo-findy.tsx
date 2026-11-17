"use client";

import { useEffect, useRef } from "react";

import { prefersMp4 } from "@/components/chat/mascot-state";
import {
  NORMAL_TIMING,
  FAST_TIMING,
  RETRY_MAX_MS,
  RETRY_MIN_MS,
  blockedFor,
  earliestStart,
  nextDelayMs,
  parseFindyFlags,
  pickPlan,
  positions,
  walkDistance,
  walkMs,
  walkRoom,
  WALK_MAX_PX,
  type FindyAct,
  type Plan,
  type Side,
} from "./findy-walk";

/**
 * Findy lives around the header logo.
 *
 * Rendered inside the logo <Link> (which is `relative`), under the logo image (`relative z-10`). The logo
 * image is transparent, so he is hidden only by the letters themselves (no rectangular clip, which cut him
 * with a hard straight edge); he fades in and out so he never pops up through the gaps between letters.
 *
 * When he appears (rules and numbers live in findy-walk.ts, pure and unit-tested):
 *  - once per browser session ~1.2 s after `load`: the full walk (peek, wave, walk out, hop back);
 *  - then at random: every 25-70 s (jittered), never sooner than 20 s after the previous run ended. The timer
 *    defers (re-checks after 1-3 s) while the tab is hidden, the logo is hovered/focused, the mobile menu or any
 *    dialog/menu is open, or the page is being scrolled; every run picks a different act at random:
 *    peek, peek + wave, walk out and back, walk left and back, walk both ways, hop;
 *  - as a cameo on hover/focus of the logo (debounced 400 ms; a hover during a run queues one replay).
 * Walks use the REAL free space measured at run time on both sides (never into the nav links or the CTA);
 * when room is short the walk is shorter (down to 24 px), below that he peeks or hops instead.
 *
 * Nothing is downloaded and nothing moves for prefers-reduced-motion, Save-Data, or browsers without
 * VP9-alpha WebM. Safari/iOS (prefersMp4) also get nothing: they drop the WebM alpha, and the posters
 * (RGBA webp) are one frame each, so a still Findy sliding out would look broken. Clips are fetched on first
 * need (preload none) and then cached.
 *
 * Replay / testing (changes timing only, never bypasses the guards above):
 *  - `?findy=walk`: a full walk ~0.3 s after mount, ignoring the once-per-session flag
 *    (or localStorage `findy-logo-force` = `walk`);
 *  - `?findy=schedule-fast`: scheduled runs every 3-6 s (2 s gap); combine as `?findy=walk,schedule-fast`;
 *  - `sessionStorage.removeItem("findy-logo-seen")` and reload replays the first-load show.
 * The layer carries `data-findy-act` while a run is playing and `data-findy-runs` (count of runs so far).
 */
const SEEN_KEY = "findy-logo-seen";
const FORCE_KEY = "findy-logo-force";
const START_DELAY_MS = 1200;
const FORCE_DELAY_MS = 300;
/** A hover this soon after the previous cameo started is ignored, so rapid hovers cannot stack. */
const CAMEO_DEBOUNCE_MS = 400;
/** Time into the wave clip where Findy stands still facing us (the wave starts after). */
const STAND_T = 1.0;
/** The mobile menu toggle is open. */
const MENU_OPEN = '[aria-controls="mobile-nav"][aria-expanded="true"]';
/** Any other open menu, dialog or popover (the chat panel is a dialog, aria-hidden while closed). */
const DIALOG_OPEN =
  '[role="menu"], [role="listbox"], [role="dialog"]:not([aria-hidden="true"]), [aria-modal="true"], [aria-haspopup][aria-expanded="true"]';

const WAVE_SRC = "/media/mascot/logo/wave.webm";
const WALK_SRC = "/media/mascot/logo/walk.webm";
const WAVE_POSTER = "/media/mascot/logo/wave-poster.webp";
const WALK_POSTER = "/media/mascot/logo/walk-poster.webp";

export function LogoFindy() {
  const layerRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const bobRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLVideoElement>(null);
  const walkRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const move = moveRef.current;
    const bob = bobRef.current;
    const wave = waveRef.current;
    const walk = walkRef.current;
    const link = layer?.parentElement;
    if (!layer || !move || !bob || !wave || !walk || !link) return;

    // Reduced motion / Save-Data / unsupported codec: render nothing, download nothing.
    // canPlayType alone is not enough: WebKit says "maybe" for VP9 but drops the alpha, which would show an opaque box under the logo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true) return;
    if (prefersMp4()) return;
    if (!wave.canPlayType('video/webm; codecs="vp9"')) return;

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(FORCE_KEY);
    } catch {
      /* storage blocked */
    }
    const flags = parseFindyFlags(window.location.search, stored);
    const timing = flags.fast ? FAST_TIMING : NORMAL_TIMING;

    let disposed = false;
    let running = false;
    let runs = 0;
    let lastEndAt: number | null = null;
    let lastAct: FindyAct | null = null;
    let lastScrollAt = Number.NEGATIVE_INFINITY;
    let hovered = false;
    const anims = new Set<Animation>();
    const timers = new Set<number>();
    let schedule: number | undefined;

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const sleep = (ms: number) => new Promise<void>((res) => later(res, ms));

    const run = (el: HTMLElement, kf: Keyframe[], opts: KeyframeAnimationOptions) => {
      const a = el.animate(kf, { fill: "forwards", ...opts });
      anims.add(a);
      return a.finished.catch(() => undefined).finally(() => anims.delete(a));
    };

    const ready = (v: HTMLVideoElement) =>
      new Promise<void>((res) => {
        if (v.readyState >= 3) return res();
        v.addEventListener("canplaythrough", () => res(), { once: true });
        v.addEventListener("error", () => res(), { once: true });
      });

    const load = async (withWalk: boolean) => {
      if (!wave.src) {
        wave.poster = WAVE_POSTER;
        wave.src = WAVE_SRC;
        wave.load();
      }
      if (withWalk && !walk.src) {
        walk.poster = WALK_POSTER;
        walk.src = WALK_SRC;
        walk.load();
      }
      await Promise.all([ready(wave), withWalk ? ready(walk) : Promise.resolve()]);
    };

    const setX = (x: number) => {
      move.style.transform = `translateX(${x}px)`;
    };
    const show = (which: "wave" | "walk" | "none") => {
      wave.style.opacity = which === "wave" ? "1" : "0";
      walk.style.opacity = which === "walk" ? "1" : "0";
    };
    /** The walk clip faces right; on the left side both clips are mirrored about the body centre. */
    const face = (side: Side) => {
      const t = side === "left" ? "scaleX(-1)" : "";
      wave.style.transform = t;
      walk.style.transform = t;
    };
    const stand = () => {
      walk.pause();
      show("wave");
      wave.pause();
      wave.currentTime = STAND_T;
    };

    const bobKf = (n: number): Keyframe[] => {
      const kf: Keyframe[] = [{ transform: "translateY(0)" }];
      for (let i = 0; i < n; i++) kf.push({ transform: "translateY(-8px)", offset: (2 * i + 1) / (2 * n + 1) }, { transform: "translateY(0)", offset: (2 * i + 2) / (2 * n + 1) });
      kf.push({ transform: "translateY(0)" });
      return kf;
    };

    const measure = () => {
      const k = window.matchMedia("(min-width: 768px)").matches ? 1 : 44 / 56;
      const rect = link.getBoundingClientRect();
      // The nearest visible thing to the right: the nav, or (below lg, where it is hidden) the actions.
      let next: Element | null = link.nextElementSibling;
      while (next && next.getBoundingClientRect().width === 0) next = next.nextElementSibling;
      const nextLeft = next ? next.getBoundingClientRect().left : null;
      return { k, W: rect.width, room: walkRoom({ linkLeft: rect.left, linkWidth: rect.width, nextLeft, k }) };
    };

    /**
     * One excursion on one side. `stage`: "peek" slides half out and back; "out" steps fully out;
     * `wave`: wave once out; `dist`: px to walk beyond the step-out (0 = none).
     */
    const segment = async (side: Side, W: number, k: number, o: { stage: "peek" | "out" | "hop"; wave: boolean; dist: number }) => {
      const s = side === "right" ? 1 : -1;
      const { hidden, peek, out } = positions(side, W, k);
      const far = out + s * o.dist;
      try {
        await load(o.dist > 0);
        if (disposed) return;
        face(side);
        setX(hidden);
        stand();
        layer.style.visibility = "visible";
        // No clip any more: he fades in while stepping out, so he is never shown through the logo's letter gaps.
        void run(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });

        let at = hidden;
        if (o.stage !== "hop") {
          // peek out from behind the logo
          await run(move, [{ transform: `translateX(${hidden}px)` }, { transform: `translateX(${peek}px)` }], {
            duration: 700,
            easing: "cubic-bezier(.2,.9,.3,1)",
          });
          await sleep(900);
          if (disposed) return;
          at = peek;
        }
        if (o.stage !== "peek") {
          // step fully out with a hop
          void run(bob, bobKf(1), { duration: 480, easing: "ease-out" });
          await run(move, [{ transform: `translateX(${at}px)` }, { transform: `translateX(${out}px)` }], { duration: 480, easing: "ease-out" });
          at = out;
          if (o.stage === "hop") {
            await run(bob, bobKf(2), { duration: 700, easing: "ease-in-out" });
            if (disposed) return;
          }
        }
        if (o.wave) {
          wave.currentTime = STAND_T;
          void wave.play().catch(() => undefined);
          await sleep(1500);
          if (disposed) return;
          wave.pause();
        }
        if (o.dist > 0) {
          // walk (the clip walks in place, the move happens here)
          show("walk");
          walk.currentTime = 0;
          void walk.play().catch(() => undefined);
          await run(move, [{ transform: `translateX(${out}px)` }, { transform: `translateX(${far}px)` }], { duration: walkMs(o.dist), easing: "linear" });
          if (disposed) return;
          at = far;
          stand();
          await sleep(350);
          if (disposed) return;
        }
        // back behind the logo and out of sight
        const ms = o.stage === "hop" ? 600 : o.stage === "peek" ? 700 : 1000;
        void run(bob, bobKf(o.stage === "out" ? 2 : 0), { duration: ms, easing: "ease-in-out" });
        void run(layer, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: ms, easing: "ease-in-out" });
        await run(move, [{ transform: `translateX(${at}px)` }, { transform: `translateX(${hidden}px)` }], { duration: ms, easing: "ease-in-out" });
      } finally {
        if (!disposed) {
          layer.style.visibility = "hidden";
          show("none");
          wave.pause();
          walk.pause();
        }
      }
    };

    /** Plays one act; resolves when it has ended and Findy is hidden again. */
    const play = async (plan: Plan, k: number, W: number) => {
      if (running || disposed) return;
      running = true;
      lastAct = plan.act;
      runs += 1;
      layer.dataset.findyAct = plan.act;
      layer.dataset.findyRuns = String(runs);
      try {
        switch (plan.act) {
          case "peek":
            await segment(plan.side, W, k, { stage: "peek", wave: false, dist: 0 });
            break;
          case "peekWave":
            await segment(plan.side, W, k, { stage: "out", wave: true, dist: 0 });
            break;
          case "hop":
            await segment(plan.side, W, k, { stage: "hop", wave: false, dist: 0 });
            break;
          case "walkOut":
            await segment("right", W, k, { stage: "out", wave: true, dist: plan.right });
            break;
          case "walkLeft":
            await segment("left", W, k, { stage: "out", wave: true, dist: plan.left });
            break;
          case "walkBoth":
            await segment("right", W, k, { stage: "out", wave: true, dist: plan.right });
            if (!disposed) await sleep(500);
            if (!disposed) await segment("left", W, k, { stage: "out", wave: false, dist: plan.left });
            break;
        }
      } finally {
        if (!disposed) {
          delete layer.dataset.findyAct;
          lastEndAt = performance.now();
        }
        running = false;
      }
    };

    /** A fresh plan from the room measured right now; null when even a step-out does not fit. */
    const plan = (short: boolean): { p: Plan; k: number; W: number } | null => {
      const m = measure();
      const p = pickPlan({ rng: Math.random, room: m.room, last: lastAct, k: m.k, short });
      return p ? { p, k: m.k, W: m.W } : null;
    };
    /** The full first-load show: walk out right when there is room, otherwise whatever fits. */
    const fullShow = () => {
      const m = measure();
      const right = m.room.right >= 0 ? walkDistance(m.room.right, WALK_MAX_PX * m.k) : 0;
      if (right > 0) return { p: { act: "walkOut", side: "right", right, left: 0 } as Plan, k: m.k, W: m.W };
      return plan(false);
    };

    // ── Random schedule ────────────────────────────────────────────────
    const arm = (ms: number) => {
      if (schedule !== undefined) {
        window.clearTimeout(schedule);
        timers.delete(schedule);
      }
      schedule = later(fire, ms);
    };
    const retry = () => Math.round(RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS));
    function fire() {
      schedule = undefined;
      if (disposed) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // Hidden tab: stay asleep; visibilitychange re-arms.
      if (document.hidden) return;
      const now = performance.now();
      if (running) return arm(retry());
      const blocked = blockedFor(
        {
          hidden: false,
          hovered,
          menuOpen: document.querySelector(MENU_OPEN) !== null,
          dialogOpen: document.querySelector(DIALOG_OPEN) !== null,
          lastScrollAt,
          now,
        },
        Math.random,
      );
      if (blocked) return arm(blocked.retryMs);
      const start = earliestStart({ wantedAt: now, lastEndAt, gapMs: timing.gapMs });
      if (start > now) return arm(start - now);
      const next = plan(false);
      if (!next) return arm(nextDelayMs(Math.random, timing));
      void play(next.p, next.k, next.W).then(() => {
        if (!disposed) arm(nextDelayMs(Math.random, timing));
      });
    }

    const onVisibility = () => {
      if (disposed) return;
      if (document.hidden) {
        if (schedule !== undefined) {
          window.clearTimeout(schedule);
          timers.delete(schedule);
          schedule = undefined;
        }
      } else if (schedule === undefined && !running) {
        arm(retry());
      }
    };
    const onScroll = () => {
      lastScrollAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });

    // First show: once per session, after window load; then the random schedule takes over.
    let started = false;
    const first = () => {
      if (started) return;
      started = true;
      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === "1";
      } catch {
        /* storage blocked: still play once per page view */
      }
      if (flags.force) {
        // Dev override: a full walk now, whatever the session flag says.
        later(() => {
          const f = fullShow();
          if (f) void play(f.p, f.k, f.W).then(() => !disposed && arm(nextDelayMs(Math.random, timing)));
          else arm(nextDelayMs(Math.random, timing));
        }, FORCE_DELAY_MS);
        return;
      }
      if (seen) {
        arm(nextDelayMs(Math.random, timing));
        return;
      }
      later(() => {
        // Flag on actual start (not on mount): React StrictMode mounts twice in dev.
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* ignore */
        }
        const f = fullShow();
        if (f) void play(f.p, f.k, f.W).then(() => !disposed && arm(nextDelayMs(Math.random, timing)));
        else arm(nextDelayMs(Math.random, timing));
      }, START_DELAY_MS);
    };
    if (document.readyState === "complete") first();
    else window.addEventListener("load", first, { once: true });

    // Cameo on hover / keyboard focus: a short act (peek, wave, hop, or a walk when there is room).
    // Debounced, and a hover during a run queues at most one replay for when it ends.
    let replay = false;
    let lastCameoAt = Number.NEGATIVE_INFINITY;
    const cameo = () => {
      if (disposed) return;
      if (running) {
        replay = true;
        return;
      }
      const now = performance.now();
      if (now - lastCameoAt < CAMEO_DEBOUNCE_MS) return;
      lastCameoAt = now;
      const next = plan(true);
      if (!next) return;
      void play(next.p, next.k, next.W).then(() => {
        if (replay && !disposed) {
          replay = false;
          lastCameoAt = performance.now();
          const again = plan(true);
          if (again) void play(again.p, again.k, again.W);
        }
      });
    };
    const enter = () => {
      hovered = true;
      cameo();
    };
    const leave = () => {
      hovered = false;
    };
    const focusIn = () => {
      hovered = true;
      cameo();
    };
    link.addEventListener("pointerenter", enter);
    link.addEventListener("pointerleave", leave);
    link.addEventListener("focusin", focusIn);
    link.addEventListener("focusout", leave);

    return () => {
      disposed = true;
      window.removeEventListener("load", first);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      link.removeEventListener("pointerenter", enter);
      link.removeEventListener("pointerleave", leave);
      link.removeEventListener("focusin", focusIn);
      link.removeEventListener("focusout", leave);
      timers.forEach((id) => window.clearTimeout(id));
      anims.forEach((a) => a.cancel());
      wave.pause();
      walk.pause();
    };
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 [--o:44px] md:[--o:56px]"
      style={{ visibility: "hidden" }}
    >
      {/* x-anchor: a zero-width column whose left edge is Findy's body centre */}
      <div ref={moveRef} className="absolute bottom-0 left-0 w-0 will-change-transform">
        <div ref={bobRef} className="relative w-0">
          <video
            ref={waveRef}
            muted
            playsInline
            preload="none"
            tabIndex={-1}
            className="absolute left-0 aspect-square max-w-none -translate-x-1/2 select-none opacity-0"
            style={{ height: "calc(var(--o) / 0.78)", bottom: "calc(var(--o) / 0.78 * -0.06)" }}
          />
          <video
            ref={walkRef}
            muted
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            className="absolute bottom-0 left-0 max-w-none -translate-x-1/2 select-none opacity-0"
            style={{ height: "calc(var(--o) / 0.99)", aspectRatio: "120 / 200" }}
          />
        </div>
      </div>
    </div>
  );
}
