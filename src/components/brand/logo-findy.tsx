"use client";

import { useEffect, useRef } from "react";

import { prefersMp4 } from "@/components/chat/mascot-state";

/**
 * Findy lives around the header logo (prototype).
 *
 * Rendered inside the logo <Link> (which is `relative`), under the logo image
 * (`relative z-10`). The logo image is transparent, so he is hidden only by the letters themselves (no
 * rectangular clip, which cut him with a hard straight edge); he fades in and out so he never pops up
 * through the gaps between letters.
 *
 * Plays once per browser session after `load`, and as a short cameo on every hover/focus
 * of the logo (a hover during a run queues one replay). Nothing is
 * downloaded for prefers-reduced-motion or browsers without VP9-alpha WebM (Safari/iOS drop the alpha).
 *
 * Replay: `sessionStorage.removeItem("findy-logo-seen")` and reload.
 */
const SEEN_KEY = "findy-logo-seen";
const START_DELAY_MS = 1200;
/** Time into the wave clip where Findy stands still facing us (the wave starts after). */
const STAND_T = 1.0;

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

    // Reduced motion / unsupported codec: render nothing, download nothing.
    // canPlayType alone is not enough: WebKit says "maybe" for VP9 but drops the alpha, which would show an opaque box under the logo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (prefersMp4()) return;
    if (!wave.canPlayType('video/webm; codecs="vp9"')) return;

    let disposed = false;
    let running = false;
    const anims = new Set<Animation>();
    const timers = new Set<number>();

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          res();
        }, ms);
        timers.add(id);
      });

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
    const stand = () => {
      walk.pause();
      show("wave");
      wave.pause();
      wave.currentTime = STAND_T;
    };

    const play = async (full: boolean) => {
      if (running || disposed) return;
      running = true;
      try {
        const wide = window.matchMedia("(min-width: 768px)").matches;
        const k = wide ? 1 : 44 / 56;
        const W = link.getBoundingClientRect().width;
        const HIDDEN = W - 30 * k; // body centre, fully inside the logo box
        const PEEK = W + 2 * k; // half the body outside the right end
        const OUT = W + 28 * k;
        // Never walk into the nav (only 79px of clearance at 1024px wide).
        const navLeft = link.nextElementSibling?.getBoundingClientRect();
        const room = navLeft && navLeft.width > 0 ? navLeft.left - link.getBoundingClientRect().left - 24 : Infinity;
        const FAR = Math.max(OUT, Math.min(OUT + 72 * k, room));
        const doWalk = full && FAR - OUT > 30;

        await load(doWalk);
        if (disposed) return;

        setX(HIDDEN);
        stand();
        layer.style.visibility = "visible";
        // No clip any more: he fades in while stepping out, so he is never shown through the logo's letter gaps.
        void run(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });

        // 1. peek out from behind the right end
        await run(move, [{ transform: `translateX(${HIDDEN}px)` }, { transform: `translateX(${PEEK}px)` }], {
          duration: 700,
          easing: "cubic-bezier(.2,.9,.3,1)",
        });
        await sleep(900);
        if (disposed) return;

        // hop fully out
        void run(bob, [{ transform: "translateY(0)" }, { transform: "translateY(-9px)", offset: 0.5 }, { transform: "translateY(0)" }], {
          duration: 480,
          easing: "ease-out",
        });
        await run(move, [{ transform: `translateX(${PEEK}px)` }, { transform: `translateX(${OUT}px)` }], {
          duration: 480,
          easing: "ease-out",
        });

        // 2. wave
        wave.currentTime = STAND_T;
        void wave.play().catch(() => undefined);
        await sleep(1500);
        if (disposed) return;
        wave.pause();

        // 3. walk out to the right (clip walks in place, moved here)
        if (doWalk) {
          show("walk");
          walk.currentTime = 0;
          void walk.play().catch(() => undefined);
          await run(move, [{ transform: `translateX(${OUT}px)` }, { transform: `translateX(${FAR}px)` }], {
            duration: 1700,
            easing: "linear",
          });
          if (disposed) return;
          stand();
          await sleep(350);
          if (disposed) return;
        }

        // 4. hop back behind the logo and hide
        const from = doWalk ? FAR : OUT;
        void run(
          bob,
          [
            { transform: "translateY(0)" },
            { transform: "translateY(-8px)", offset: 0.2 },
            { transform: "translateY(0)", offset: 0.4 },
            { transform: "translateY(-8px)", offset: 0.6 },
            { transform: "translateY(0)", offset: 0.8 },
            { transform: "translateY(0)" },
          ],
          { duration: 1000, easing: "ease-in-out" },
        );
        void run(layer, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1000, easing: "ease-in-out" });
        await run(move, [{ transform: `translateX(${from}px)` }, { transform: `translateX(${HIDDEN}px)` }], {
          duration: 1000,
          easing: "ease-in-out",
        });
      } finally {
        if (!disposed) {
          layer.style.visibility = "hidden";
          show("none");
          wave.pause();
          walk.pause();
        }
        running = false;
      }
    };

    // First show: once per session, after window load.
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
      if (seen) return;
      void sleep(START_DELAY_MS).then(() => {
        if (disposed) return;
        // Flag on actual start (not on mount): React StrictMode mounts twice in dev.
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* ignore */
        }
        void play(window.matchMedia("(min-width: 768px)").matches);
      });
    };
    if (document.readyState === "complete") first();
    else window.addEventListener("load", first, { once: true });

    // Cameo on hover / keyboard focus: peek + wave, every time.
    // Every hover: a hover during a run queues one replay for when it ends.
    let replay = false;
    const cameo = () => {
      if (running) {
        replay = true;
        return;
      }
      void play(false).then(() => {
        if (replay && !disposed) {
          replay = false;
          void play(false);
        }
      });
    };
    link.addEventListener("pointerenter", cameo);
    link.addEventListener("focusin", cameo);

    return () => {
      disposed = true;
      window.removeEventListener("load", first);
      link.removeEventListener("pointerenter", cameo);
      link.removeEventListener("focusin", cameo);
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
