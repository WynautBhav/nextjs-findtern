"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Scroll-reactive marquee.
 *
 * A CSS marquee runs at one fixed speed no matter what the reader is doing,
 * which is what makes it read as wallpaper. This one reads vertical scroll
 * velocity, accelerating from its resting 1x up to 3x on a fast scroll and
 * reversing on scroll-up so the row visibly rewinds.
 *
 * ── Implementation note ──────────────────────────────────────────────────
 *
 * The motion is a single GSAP tween per track whose rate is driven with
 * `timeScale()`. That is the whole mechanism, and it is worth being explicit
 * about why, because the previous version of this file did not work:
 *
 *  - It rebuilt the tween to change speed. But the rebuild condition only
 *    compared *direction*, so during a long downward scroll — the exact moment
 *    the effect is meant to show — the speed never changed at all. The
 *    advertised 0.25x–3x range did not exist.
 *
 *  - Its `lastDirection` was module-level, shared by every marquee on the
 *    page. With two rows mounted, each frame one track's direction overwrote
 *    the other's, so both tweened, were killed, and were rebuilt continuously.
 *    The comment claimed to avoid that churn; it caused it.
 *
 *  - `pauseOnHover` set `animation-play-state`, a CSS keyframe property. This
 *    is a JS tween, so it had no effect whatsoever.
 *
 * `timeScale()` is retargeted in place by GSAP with no restart and no state to
 * rebuild, so the loop below only ever *reads* scroll position and writes one
 * number per track.
 */

/** Seconds for one full pass at 1x. */
const DEFAULT_DURATION = 34;

type Handle = {
  tween: gsap.core.Tween;
  el: HTMLElement;
  /** Fraction of the track width travelled per loop. */
  setSpeed(speed: number, reverse: boolean): void;
  setPaused(paused: boolean, reverse: boolean): void;
  /** Whether this marquee opts into hover-pausing at all. */
  canPauseOnHover: boolean;
};

/** Shared rAF loop. Holds no per-track state of its own. */
const handles = new Set<Handle>();
let rafId = 0;
let lastY = 0;
let smoothed = 0;

function tick() {
  const y = window.scrollY;
  const delta = y - lastY;
  lastY = y;

  // Exponential smoothing, then a clamp. The clamp matters: a trackpad fling
  // produces deltas in the hundreds, and without it the row launches.
  smoothed += (delta - smoothed) * 0.16;
  smoothed = Math.max(-70, Math.min(70, smoothed));

  // 1x is the resting rate, and it is the rate the `duration` prop describes.
  //
  // This was 0.25 at rest, which was wrong by a factor of four: `duration` is
  // the time for one pass at 1x, so a 0.25 resting timeScale stretched a 38s
  // pass to 152s — about 10px/second, which reads as completely frozen. The
  // floor has to be 1 so the marquee keeps the pace it was designed with, and
  // scroll velocity is what adds on top of it, from 1x up to 3x.
  const magnitude = Math.abs(smoothed);
  const speed = 1 + (magnitude / 70) * 2;
  // A dead zone either side of zero, so scroll jitter does not make the row
  // twitch back and forth around the resting state.
  const reverse = smoothed < -1.5;

  for (const h of handles) {
    h.setSpeed(speed, reverse);
    // Both branches are required. The pause used to be written one-way:
    //
    //   if (hovering) h.setPaused(true, reverse);
    //
    // which has no counterpart, so `paused` latched on the first time the
    // cursor crossed the row and never cleared. The marquee would stop for
    // good the first time you moved the mouse over it, and since the rows span
    // the full viewport width that was effectively always.
    //
    // Hover-pausing is also off by default now. Nothing inside either marquee
    // is interactive — no links, no buttons — so pausing bought nothing and
    // only made the page look broken.
    if (h.canPauseOnHover) {
      h.setPaused(h.el.matches(":hover"), reverse);
    }
  }

  rafId = requestAnimationFrame(tick);
}

function start() {
  if (rafId) return;
  lastY = window.scrollY;
  smoothed = 0;
  rafId = requestAnimationFrame(tick);
}

function stop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

export function VelocityMarquee({
  children,
  loopCopy,
  duration = DEFAULT_DURATION,
  reverse = false,
  className,
  pauseOnHover = false,
}: {
  /** The visible half of the loop. */
  children: ReactNode;
  /**
   * The duplicate half. Supply it explicitly rather than letting the marquee
   * clone `children`, because a caller may need the twin to differ — the
   * skills row renders the copy's titles as <p> instead of <h3> so the
   * document outline carries eleven headings rather than twenty-two.
   *
   * It is passed as a node rather than a render function on purpose: this
   * component is used from Server Components, and a function prop cannot
   * cross the RSC boundary.
   */
  loopCopy?: ReactNode;
  /** Seconds for one full pass at 1x. */
  duration?: number;
  reverse?: boolean;
  className?: string;
  /**
   * Pause while the cursor is over the row. Off by default: the homepage rows
   * are decorative and contain nothing to click, and a full-width row that
   * stops whenever the mouse crosses it reads as a bug rather than a
   * courtesy. Turn it on only for a marquee whose contents are interactive.
   */
  pauseOnHover?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const handle = el.querySelector<HTMLElement>("[data-track]");
    if (!handle) return;

    // Only the first track is animated. The DOM is [A][B] where B is a
    // duplicate of A, so translating A left by exactly one A-width puts B
    // precisely where A was — the seam is invisible and the cycle repeats
    // forever. xPercent is relative to the animated element's own width, so
    // one loop unit is 100, not 50.
    const trackWidth = handle.offsetWidth || (el.clientWidth || 800) / 2;
    const travelPx = Math.max(trackWidth, 1);
    const pxPerSecond = travelPx / Math.max(duration, 1);

    const tween = gsap.to(handle, {
      xPercent: -100,
      duration: travelPx / pxPerSecond,
      ease: "none",
      repeat: -1,
      // Never let GSAP's own lag smoothing fight the scroll-velocity signal.
      overwrite: false,
    });

    let paused = false;
    let currentSpeed = 1;
    let currentReverse = reverse;

    const h: Handle = {
      tween,
      el: handle,
      canPauseOnHover: pauseOnHover,
      setSpeed(speed, rev) {
        if (paused) return;
        // Skip the write when nothing meaningful changed. `timeScale` on every
        // frame for every track is wasted style recalculation.
        if (Math.abs(speed - currentSpeed) < 0.01 && rev === currentReverse) return;
        currentSpeed = speed;
        currentReverse = rev;
        tween.timeScale(speed * (rev ? -1 : 1));
      },
      setPaused(next, rev) {
        if (next === paused) return;
        paused = next;
        tween.timeScale(next ? 0 : currentSpeed * (rev ? -1 : 1));
      },
    };

    tween.timeScale(reverse ? -1 : 1);
    handles.add(h);
    start();

    return () => {
      handles.delete(h);
      tween.kill();
      if (!handles.size) stop();
    };
  }, [reverse, duration, pauseOnHover]);

  return (
    <div
      ref={ref}
      data-marquee
      className={cn(
        "group relative flex overflow-hidden",
        "[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]",
        className,
      )}
    >
      <Track>{children}</Track>
      {/* The duplicate half of the loop. aria-hidden so the content is not
          announced twice by a screen reader, and `copy` is true so the child
          can render a non-heading twin — the aria-hidden attribute stops a
          screen reader but not the document outline, and search engines index
          headings regardless of it. */}
      <Track aria-hidden copy>
        {loopCopy ?? children}
      </Track>
    </div>
  );
}

function Track({
  children,
  copy,
  ...rest
}: {
  children: ReactNode;
  /** The duplicated half. Lets the caller render a non-heading twin. */
  copy?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-track
      data-track-copy={copy ? "" : undefined}
      {...rest}
      className="flex shrink-0 items-center"
    >
      {children}
    </div>
  );
}
