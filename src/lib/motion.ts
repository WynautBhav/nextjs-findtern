"use client";

/**
 * Motion hooks.
 *
 * Client-only by construction. The GSAP core lives in ./gsap.ts so server
 * components can import the easing constants without pulling hooks into their
 * module graph.
 *
 * The legacy build reached for three different reveal mechanisms — a
 * `useReveal` hook, a second `useReveal.js`/`.d.ts` pair that shadowed it, and
 * hand-rolled IntersectionObservers inside five page components — with ten
 * separate `prefers-reduced-motion` blocks in the stylesheet. This is the
 * single entry point now.
 */

import { useEffect, useRef, useState } from "react";

import { EASE, gsap, prefersReducedMotion } from "./gsap";

/**
 * Reveal-on-scroll via GSAP, for elements that need a transform rather than a
 * class — the seven-step timeline, mostly.
 *
 * Animates the container and its `[data-reveal-item]` descendants with a
 * stagger. Under reduced motion nothing animates and the content is simply
 * present: no opacity-0 initial state, no flash, no scroll dependency.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  stagger?: number;
  duration?: number;
  start?: string;
}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      gsap.set(el, { clearProps: "all" });
      return;
    }

    const items = el.querySelectorAll<HTMLElement>("[data-reveal-item]");
    const ctx = gsap.context(() => {
      const from = { autoAlpha: 0, y: 24 };
      const to = {
        autoAlpha: 1,
        y: 0,
        duration: options?.duration ?? 0.9,
        ease: EASE.outExpo,
        scrollTrigger: {
          trigger: el,
          start: options?.start ?? "top 82%",
          once: true,
        },
      };
      gsap.fromTo(el, from, to);
      if (items.length) {
        gsap.fromTo(
          items,
          { autoAlpha: 0, y: 20 },
          { ...to, duration: 0.75, stagger: options?.stagger ?? 0.08 },
        );
      }
    }, el);

    return () => ctx.revert();
  }, [options?.duration, options?.stagger, options?.start]);

  return ref;
}

/**
 * Adds an `is-revealed` class once the element is on screen, for the
 * CSS-driven reveal in globals.css. The cheap path — no GSAP, no layout
 * thrash — and what most sections use.
 */
export function useRevealFlag<T extends HTMLElement = HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  const { threshold = 0.15, rootMargin = "0px 0px -8% 0px" } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver means no reveal, so start visible rather than
    // leaving content stuck at opacity 0. Deferring to a microtask keeps this
    // out of the synchronous effect body, which would otherwise force a
    // cascading second render.
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setRevealed(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, revealed };
}

/** Tracks intersection state, re-observing as the element moves. */
export function useInView<T extends HTMLElement = HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  const {
    threshold = 0.2,
    rootMargin = "0px 0px -10% 0px",
    once = true,
  } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setInView(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}

export { EASE, gsap, prefersReducedMotion };
