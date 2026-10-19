"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Scroll-reactive seamless infinite marquee.
 *
 * Runs continuously at resting speed and accelerates with scroll velocity
 * (from 1x up to 3x) while supporting smooth direction reversals on scroll-up.
 *
 * ── True Seamless Infinite Loop ──────────────────────────────────────────
 *
 * To guarantee that the marquee track is NEVER empty on any screen width
 * (from mobile up to 4K / ultrawide displays):
 *
 *  1. An inner wrapper carries the master track plus 5 cloned tracks.
 *     Even for short brand sets (e.g. 1,000px), 6 tracks span 6,000px, which
 *     exceeds dual-4K monitor setups.
 *
 *  2. The entire track container is translated smoothly via GPU-accelerated
 *     `translate3d(-currentX, 0, 0)`.
 *
 *  3. `currentX` advances by `(trackWidth / duration) * speed * dt`, and
 *     wraps seamlessly using modulo arithmetic:
 *       `currentX = ((currentX % trackWidth) + trackWidth) % trackWidth`
 *     Because each cloned track is an exact replica of the master track,
 *     resetting by exactly one track width is 100% invisible to the human eye.
 *     There are zero seams, zero jumps, and zero blank areas at any point.
 */

const DEFAULT_DURATION = 34;

type MarqueeHandle = {
  el: HTMLElement;
  trackWrapper: HTMLElement;
  trackWidth: number;
  duration: number;
  currentX: number;
  baseReverse: boolean;
  canPauseOnHover: boolean;
  measure(): void;
  advance(dt: number, speed: number, scrollReversed: boolean): void;
};

const handles = new Set<MarqueeHandle>();
let rafId = 0;
let lastY = 0;
let lastTime = 0;
let smoothed = 0;

function tick(time: number) {
  if (!lastTime) lastTime = time;
  // Cap frame delta to 0.1s to prevent huge jumps when tab was backgrounded
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  const y = window.scrollY;
  const delta = y - lastY;
  lastY = y;

  // Exponential smoothing on scroll velocity
  smoothed += (delta - smoothed) * 0.16;
  smoothed = Math.max(-70, Math.min(70, smoothed));

  const magnitude = Math.abs(smoothed);
  const speed = 1 + (magnitude / 70) * 2;
  const scrollReversed = smoothed < -1.5;

  for (const h of handles) {
    h.advance(dt, speed, scrollReversed);
  }

  rafId = requestAnimationFrame(tick);
}

function start() {
  if (rafId) return;
  lastY = window.scrollY;
  smoothed = 0;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

function stop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
  lastTime = 0;
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
   * clone `children`, because a caller may need the twin to differ - the
   * skills row renders the copy's titles as <p> instead of <h3> so the
   * document outline carries eleven headings rather than twenty-two.
   */
  loopCopy?: ReactNode;
  /** Seconds for one full pass at 1x. */
  duration?: number;
  reverse?: boolean;
  className?: string;
  pauseOnHover?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const trackWrapper = trackWrapperRef.current;
    if (!container || !trackWrapper || prefersReducedMotion()) return;

    const masterTrack = trackWrapper.querySelector<HTMLElement>("[data-track-master]");
    if (!masterTrack) return;

    const measure = () => {
      handle.trackWidth = masterTrack.offsetWidth || (container.clientWidth || 800) / 2;
    };

    const handle: MarqueeHandle = {
      el: container,
      trackWrapper,
      trackWidth: masterTrack.offsetWidth || (container.clientWidth || 800) / 2,
      duration: Math.max(duration, 1),
      currentX: 0,
      baseReverse: reverse,
      canPauseOnHover: pauseOnHover,
      measure,
      advance(dt: number, speed: number, scrollReversed: boolean) {
        // Hover or keyboard focus holds the row still, so a card can be read
        // and clicked instead of chased.
        if (this.canPauseOnHover && this.el.matches(":hover, :focus-within")) return;
        if (!this.trackWidth) this.measure();
        if (this.trackWidth <= 0) return;

        const basePxPerSec = this.trackWidth / this.duration;
        // baseReverse = false means content moves LEFT (forward marquee).
        // If scrollReversed is true, direction flips.
        // If baseReverse is true, content moves RIGHT.
        const isMovingRight = this.baseReverse ? !scrollReversed : scrollReversed;
        const directionSign = isMovingRight ? -1 : 1;

        const step = basePxPerSec * speed * directionSign * dt;
        this.currentX += step;

        // Modulo wrap so currentX stays in [0, trackWidth)
        this.currentX = ((this.currentX % this.trackWidth) + this.trackWidth) % this.trackWidth;

        this.trackWrapper.style.transform = `translate3d(${-this.currentX}px, 0, 0)`;
      },
    };

    measure();
    handles.add(handle);
    start();

    // The track's width changes after mount as logos and fonts load. Measured
    // once, the wrap point sat short of the real width and the row jumped
    // every cycle, so re-measure whenever the master track resizes.
    const observer = new ResizeObserver(() => handle.measure());
    observer.observe(masterTrack);

    return () => {
      handles.delete(handle);
      observer.disconnect();
      if (!handles.size) stop();
    };
  }, [reverse, duration, pauseOnHover]);

  const copyContent = loopCopy ?? children;

  return (
    <div
      ref={containerRef}
      data-marquee
      className={cn(
        // With reduced motion the row never moves, so it scrolls by hand
        // instead of hiding every card past the first screen.
        "group relative flex overflow-hidden motion-reduce:overflow-x-auto",
        "[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]",
        className,
      )}
    >
      <div
        ref={trackWrapperRef}
        data-marquee-track
        className="flex shrink-0 will-change-transform"
      >
        <Track data-track-master>{children}</Track>
        {/* 5 Cloned tracks to guarantee seamless coverage even on 4K/ultrawide displays */}
        <Track aria-hidden copy>{copyContent}</Track>
        <Track aria-hidden copy>{copyContent}</Track>
        <Track aria-hidden copy>{copyContent}</Track>
        <Track aria-hidden copy>{copyContent}</Track>
        <Track aria-hidden copy>{copyContent}</Track>
      </div>
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
      // The clones are decoration: aria-hidden alone left their buttons in
      // the tab order, so keyboard users tabbed through every card six times.
      inert={copy || undefined}
      {...rest}
      className={cn("flex shrink-0 items-center", copy && "motion-reduce:hidden")}
    >
      {children}
    </div>
  );
}
