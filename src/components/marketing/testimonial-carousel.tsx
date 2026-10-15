"use client";

/* eslint-disable @next/next/no-img-element -- already-optimised WebP served from
   /public; next/image would re-encode per width for no gain. */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { prefersReducedMotion } from "@/lib/gsap";
import { TiltCard } from "@/components/motion/tilt-card";
import { cn } from "@/lib/utils";

/**
 * Testimonial carousel.
 *
 * The motion idea here - a pill indicator whose width springs to the active
 * slide while a bar inside it fills over the autoplay interval - is the
 * pattern from Watermelon's `carousel-navigator`. The implementation is ours,
 * because the shipped version drives `animate.backgroundColor` from a
 * Tailwind class name (`theme.bg.replace('bg-[','')`), which yields
 * `blue-100` rather than a colour and therefore animates nothing.
 *
 * Three behavioural decisions that differ from the original Happy Faces
 * carousel, and are deliberate:
 *
 *  1. No self-duplication. The legacy `ensureMinTestimonials(list, 5)` padded
 *     the track by repeating whatever it had, so a database containing one
 *     testimonial rendered that one person five times. Here the track holds
 *     what exists.
 *  2. Initials avatars, not a shared Unsplash fallback. The original defaulted
 *     every avatar-less intern to the same photograph of the same man.
 *  3. Autoplay pauses on hover, on focus, and when the tab is hidden. A
 *     4.5-second timer that keeps advancing while someone is mid-sentence is
 *     the single most irritating thing a testimonial carousel does.
 */
export function TestimonialCarousel({
  testimonials,
  autoDelay = 6000,
}: {
  testimonials: {
    id: string;
    name: string;
    role: string;
    quote: string;
    avatarUrl?: string | null;
  }[];
  autoDelay?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Read once during render rather than in an effect. `useSyncExternalStore`
  // is the correct primitive for subscribing to matchMedia, but the only
  // consumer is a CSS animation choice that a static read satisfies - and a
  // static read is what a first-time visitor gets before they ever change the
  // OS setting mid-session.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const count = testimonials.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  // Autoplay. The progress bar is a CSS animation restarted by keying on the
  // index, which is cheaper and smoother than driving a width in rAF.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (paused || count < 2) return;

    const t = setTimeout(() => go(index + 1), autoDelay);
    return () => clearTimeout(t);
  }, [index, paused, count, autoDelay, go]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (count === 0) return null;

  const current = testimonials[index];

  return (
    <div
      className="relative"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative mx-auto max-w-3xl">
        {/* Live region so the slide change is announced without stealing focus. */}
        <div aria-live="polite" aria-atomic="true">
          <TiltCard max={4} className="rounded-3xl">
            <figure className="relative overflow-hidden rounded-3xl border border-ink-200 bg-white p-8 shadow-lg sm:p-12">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-accent/10 blur-2xl"
              />
              {/*
                The slide used to hard-swap: one quote replaced the next with no
                transition, so the content teleported. It now crossfades. The
                incoming copy starts slightly blurred and sharpens, which is
                what stops the outgoing and incoming text double-exposing
                mid-transition - a plain opacity crossfade of two text blocks
                at the same position reads as a smear rather than a fade.
                Keyed on the index so the animation restarts cleanly.
              */}
              <div
                key={current.id}
                className="relative"
                style={
                  reduced
                    ? undefined
                    : { animation: "testimonial-in 320ms cubic-bezier(0.16,1,0.3,1)" }
                }
              >
                <div
                  className="mb-5 flex gap-1"
                  role="img"
                  aria-label="Rated 5 out of 5"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4.5 fill-accent text-accent" aria-hidden />
                  ))}
                </div>

                <blockquote className="text-balance text-xl leading-relaxed text-ink-800 sm:text-2xl">
                  {current.quote}
                </blockquote>

                <figcaption className="mt-8 flex items-center gap-4 border-t border-ink-100 pt-6">
                  <Avatar name={current.name} url={current.avatarUrl} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{current.name}</p>
                    <p className="truncate text-sm text-text-subtle">{current.role}</p>
                  </div>
                </figcaption>
              </div>
            </figure>
          </TiltCard>
        </div>

        {count > 1 ? (
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous testimonial"
            className="absolute -left-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition-colors duration-200 ease-ease-out hover:border-primary hover:text-primary sm:flex"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : null}

        {count > 1 ? (
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next testimonial"
            className="absolute -right-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition-colors duration-200 ease-ease-out hover:border-primary hover:text-primary sm:flex"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* ── Indicators ──────────────────────────────────────────────
          The active pill springs its width (a real layout animation, so it
          reads as physical), and the inner bar fills over the autoplay
          interval. Keyed on the index so the fill restarts cleanly. */}
      {count > 1 ? (
        <div className="mt-9 flex items-center justify-center gap-2">
          {testimonials.map((t, i) => {
            const isActive = i === index;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show testimonial ${i + 1} of ${count}`}
                aria-current={isActive ? "true" : undefined}
                // The visual pill is 10px tall, which is well under the 24x24
                // WCAG 2.5.8 minimum. Rather than growing the pill - which
                // would make the control visually louder than the carousel
                // arrows - the button keeps a 10px box and expands its hit
                // area with padding and a negative inset, so the painted
                // shape is unchanged and the target is 24x24.
                className="group/dot relative flex size-6 items-center justify-center"
              >
                <span
                  className={cn(
                    "relative block h-2.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ease-ease-out-expo",
                    isActive
                      ? "w-16 bg-ink-200"
                      : "w-2.5 bg-ink-300 group-hover/dot:bg-ink-400",
                  )}
                >
                  {isActive ? (
                    <span
                      key={`${t.id}-${index}-${paused}`}
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary"
                      style={
                        reduced
                          ? { transform: "scaleX(1)" }
                          : { animation: `marquee-fill ${autoDelay}ms linear forwards` }
                      }
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Real photograph where one exists, initials only as a last resort.
 *
 * The legacy carousel defaulted every avatar-less intern to the same
 * hardcoded Unsplash photograph of the same man, which meant five supposedly
 * different testimonials shared one face. These rows come from the CMS with
 * real portraits, so the photo is used and the initials fallback is confined
 * to the case where an admin has genuinely not uploaded one.
 */
function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        decoding="async"
        className="size-12 shrink-0 rounded-full object-cover"
      />
    );
  }

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "F";

  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-semibold text-brand-800"
    >
      {initials}
    </span>
  );
}
