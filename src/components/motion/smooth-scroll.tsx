"use client";

import { useEffect } from "react";
import Lenis from "lenis";

import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap";
import "lenis/dist/lenis.css";

/**
 * Smooth scroll.
 *
 * Exactly one engine — Lenis — wired to ScrollTrigger through Lenis's own
 * React adapter, which keeps a single source of truth for scroll position. Two
 * engines fighting over `scrollTop` is the usual cause of scrubbed timelines
 * that lag a frame behind the content.
 *
 * Bypassed entirely under `prefers-reduced-motion`. This is a correctness
 * requirement, not a nicety: hijacked scrolling is a known vestibular trigger,
 * so when reduced motion is requested the page must use native scrolling and
 * the ScrollTrigger registrations below are never created.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      // GSAP is driving everything, so let it own the frame loop rather than
      // running a second rAF in parallel.
      autoRaf: false,
      duration: 1.05,
      // Exponential ease-out: fast pickup, long settle. Linear or a short
      // duration makes scrubbed timelines feel like they are fighting the
      // scroll.
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", ScrollTrigger.update);

    // Keep ScrollTrigger's cached measurements honest. Fonts and images
    // settling after first paint move every anchor position on the page, and
    // a pinned section sized from stale measurements jumps.
    const refresh = () => ScrollTrigger.refresh();
    const t = window.setTimeout(refresh, 300);
    window.addEventListener("load", refresh);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
