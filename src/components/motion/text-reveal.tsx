"use client";

import { useEffect, useRef } from "react";

import { EASE, gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Split-text reveal.
 *
 * Each word is wrapped in an overflow-hidden mask and translated up from
 * behind it, so the text appears to be revealed rather than faded. The
 * per-word transform is what makes this read as considered typography rather
 * than an opacity tween.
 *
 * Words are re-measured on resize and the tween is rebuilt, because a split
 * computed at 1440px leaves ragged masks at 390px. Under reduced motion the
 * text is left completely untouched — no split, no transform, no initial
 * state to flash.
 */
export function TextReveal({
  text,
  className,
  as: Tag = "h1",
  delay = 0,
  stagger = 0.055,
  start = "top 85%",
  trigger = true,
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
  delay?: number;
  stagger?: number;
  start?: string;
  /** Set false to skip ScrollTrigger (for above-the-fold copy). */
  trigger?: boolean;
}) {
  // Two refs: the wrapper is what ScrollTrigger measures and what the
  // ResizeObserver watches, while the inner span is the split target. Keeping
  // them separate is what lets the accessible name live outside the element
  // that gets emptied of its text.
  const wrapRef = useRef<HTMLElement>(null);
  const splitRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const el = splitRef.current;
    if (!wrap || !el || prefersReducedMotion()) return;

    let ctx: gsap.Context | undefined;
    let observer: ResizeObserver | undefined;

    const build = () => {
      ctx?.revert();

      // Split on whitespace, preserving the space so words do not collapse
      // together when the spans become inline-blocks.
      const words = text.split(/(\s+)/);
      el.textContent = "";

      const spans: HTMLSpanElement[] = [];
      for (const part of words) {
        if (/^\s+$/.test(part)) {
          el.appendChild(document.createTextNode(part));
          continue;
        }
        // The visible word is hidden from assistive tech, because splitting
        // it into per-word spans would otherwise make a screen reader
        // announce the headline one word at a time. The unsplit string is
        // carried in aria-label on the host instead, so the accessible name
        // is identical to the rendered text.
        const outer = document.createElement("span");
        outer.className = "inline-block overflow-hidden align-bottom";
        const inner = document.createElement("span");
        inner.className = "inline-block";
        inner.textContent = part;
        inner.setAttribute("aria-hidden", "true");
        outer.appendChild(inner);
        el.appendChild(outer);
        spans.push(inner);
      }

      if (!spans.length) return;

      ctx = gsap.context(() => {
        // will-change is applied for the duration of the tween and removed on
        // completion. Leaving it stamped on every split word left 34 hints live
        // at rest, which is GPU memory pressure for no benefit once the motion
        // has finished.
        gsap.set(spans, { willChange: "transform" });
        gsap.fromTo(
          spans,
          { yPercent: 118 },
          {
            yPercent: 0,
            duration: 1.05,
            ease: EASE.outExpo,
            delay,
            stagger,
            onComplete: () => gsap.set(spans, { willChange: "auto" }),
            ...(trigger
              ? { scrollTrigger: { trigger: el, start, once: true } }
              : {}),
          },
        );
      }, el);
    };

    build();

    // Re-split on width change only. Height-only changes (font swap, image
    // load) do not move word boundaries, so observing width keeps this cheap.
    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = wrap.clientWidth;
      observer = new ResizeObserver(() => {
        if (Math.abs(wrap.clientWidth - lastWidth) < 2) return;
        lastWidth = wrap.clientWidth;
        build();
      });
      observer.observe(wrap);
    }

    return () => {
      ctx?.revert();
      observer?.disconnect();
    };
  }, [text, delay, stagger, start, trigger]);

  return (
    <Tag
      ref={wrapRef as never}
      className={cn("[&_.smile::after]:bottom-[-0.15em]", className)}
    >
      {/* The accessible name, as a real text node.

          This used to be `aria-label={text}` on the host with every split word
          marked aria-hidden. That combination is broken for a role-less
          element: aria-label is not reliably exposed on a plain <p>, so with
          the children all hidden the accessible name came through *empty* —
          the single call site renders as="p", so this was the live case, not a
          hypothetical.

          A visually hidden sibling works regardless of element type. The
          split target below is aria-hidden from the server, so there is
          exactly one copy for assistive tech both before and after hydration
          rather than two before and one after. */}
      <span className="sr-only">{text}</span>
      <span ref={splitRef} aria-hidden="true">
        {text}
      </span>
    </Tag>
  );
}
