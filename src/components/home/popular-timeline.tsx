"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  ArrowDown,
  Briefcase,
  ClipboardCheck,
  FileText,
  Laptop,
  TrendingUp,
  UserCheck,
  UserPlus,
} from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import { EASE, gsap, prefersReducedMotion } from "@/lib/gsap";
import type { PopularStep } from "@/lib/content/home";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, typeof UserPlus> = {
  "user-plus": UserPlus,
  "file-text": FileText,
  "user-check": UserCheck,
  "clipboard-check": ClipboardCheck,
  laptop: Laptop,
  "trending-up": TrendingUp,
  briefcase: Briefcase,
};

/**
 * The seven-step "Why We are Most Popular" pipeline.
 *
 * Preserved in full: seven steps, alternating cards either side of a central
 * spine, each with an image, a title, and the original copy.
 *
 * Reworked animation. The original ran a hand-rolled IntersectionObserver with
 * four thresholds, writing an `is-active` / `is-done` / `is-upcoming` class per
 * row plus a pixel value into a `--popular-v2-progress` custom property that a
 * `::after` pseudo-element used to fill the spine. That is roughly 70 lines of
 * imperative scroll math.
 *
 * This uses one pinned ScrollTrigger: the spine fill is a scaleY transform
 * driven directly by the section's scroll progress, so it is exact rather than
 * threshold-quantised, and each card fades and rises in its own tween. Under
 * reduced motion the whole thing degrades to a static, fully visible timeline
 * with the spine drawn at 100% - which is the correct resting state, and the
 * original had to fake it with a class.
 */
export function PopularTimeline({ steps }: { steps: PopularStep[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const spineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const spine = spineRef.current;
    if (!section || !spine) return;

    const rows = section.querySelectorAll<HTMLElement>("[data-timeline-row]");

    if (prefersReducedMotion()) {
      // Static resting state. No pinning, no transforms.
      gsap.set(spine, { scaleY: 1 });
      gsap.set(rows, { clearProps: "all" });
      return;
    }

    const ctx = gsap.context(() => {
      // The spine. Starts at the first node and reaches the last as the
      // section's final rows pass the middle of the viewport.
      gsap.fromTo(
        spine,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          transformOrigin: "top center",
          scrollTrigger: {
            trigger: section,
            start: "top 65%",
            end: "bottom 70%",
            scrub: 0.6,
          },
        },
      );

      rows.forEach((row) => {
        const card = row.querySelector<HTMLElement>("[data-timeline-card]");
        const node = row.querySelector<HTMLElement>("[data-timeline-node]");
        if (!card || !node) return;

        const isLeft = row.dataset.side === "left";

        gsap.fromTo(
          card,
          {
            autoAlpha: 0,
            x: isLeft ? -48 : 48,
            y: 24,
          },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            duration: 0.85,
            ease: EASE.outExpo,
            scrollTrigger: { trigger: row, start: "top 84%", once: true },
          },
        );

        gsap.fromTo(
          node,
          { scale: 0.9, autoAlpha: 0 },
          {
            scale: 1,
            autoAlpha: 1,
            duration: 0.6,
            ease: EASE.spring,
            scrollTrigger: { trigger: row, start: "top 80%", once: true },
          },
        );
      });
    }, section);

    return () => ctx.revert();
  }, [steps.length]);

  return (
    <section id="popular" ref={sectionRef} className="section-y relative overflow-hidden">
      <div className="container-page">
        <SectionHeading
          lead="Why We are Most"
          accent="Popular"
          sub="Seven steps from a blank profile to a signed offer. Each one is a gate, and each one is published."
        />

        <ol className="relative mt-14 lg:mt-20">
          {/* ── The spine ────────────────────────────────────────────
              Masked at both ends so it fades in level with the first node
              and out level with the last, whatever the card heights turn
              out to be. The alternative - hard-coding a top and bottom
              offset - drifts as soon as one card's copy wraps differently. */}
          <div
            aria-hidden
            className="absolute left-[1.375rem] top-6 bottom-6 w-px bg-ink-200 lg:left-1/2 lg:-translate-x-1/2 [mask-image:linear-gradient(to_bottom,transparent,black_7%,black_93%,transparent)]"
          >
            <div
              ref={spineRef}
              className="h-full w-full origin-top bg-gradient-to-b from-accent via-primary to-primary"
            />
          </div>

          {steps.map((step, i) => {
            const Icon = STEP_ICONS[step.icon] ?? UserPlus;
            const isLeft = i % 2 === 0;

            return (
              <li
                key={step.title}
                data-timeline-row
                data-side={isLeft ? "left" : "right"}
                className="relative pb-12 pl-14 last:pb-0 lg:grid lg:grid-cols-2 lg:gap-16 lg:pb-20 lg:pl-0"
              >
                {/* Card - occupies one half, alternating. */}
                <div
                  className={cn(
                    "lg:col-start-1 lg:row-start-1",
                    isLeft ? "lg:pr-0" : "lg:col-start-2 lg:pl-0",
                  )}
                >
                  <article
                    data-timeline-card
                    className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-xl"
                  >
                    <div className="relative aspect-16/9 overflow-hidden bg-ink-100">
                      <Image
                        src={step.image}
                        alt={step.imageAlt}
                        fill
                        sizes="(max-width: 1024px) 90vw, 42vw"
                        className="object-cover transition-transform duration-300 ease-ease-out-expo [@media(any-hover:hover)]:group-hover:scale-[1.05]"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-brand-950/45 via-transparent to-transparent"
                      />
                      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-2.5 py-1 text-2xs font-bold uppercase tracking-[0.12em] text-primary shadow-sm backdrop-blur">
                        Step {i + 1}
                      </span>
                    </div>

                    <div className="p-6">
                      <h3 className="text-lg font-semibold tracking-tight text-ink-900">
                        {step.title}
                      </h3>
                      <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </article>
                </div>

                {/* Node - sits on the spine, centred on desktop.
                    Centred with a negative margin rather than
                    `translate-x-[-50%]` on purpose: GSAP animates `scale` on
                    this element below, and any transform it sets replaces the
                    whole Tailwind transform, which threw the node off to the
                    right of the spine. Margin is not a transform, so the two
                    compose. */}
                <div
                  data-timeline-node
                  className="absolute left-0 top-8 flex size-11 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-lg lg:left-1/2 lg:top-10 lg:-ml-[1.375rem]"
                >
                  <Icon className="size-4.5" aria-hidden />
                  <span className="sr-only">
                    Step {i + 1} of {steps.length}: {step.title}
                  </span>
                </div>

                {/* Mobile inline connector label, desktop spacer. */}
                <div aria-hidden className="hidden lg:block" />
              </li>
            );
          })}
        </ol>

        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-text-subtle lg:mt-0">
          <ArrowDown className="size-4 animate-pulse-dot" aria-hidden />
          Scroll to follow the pipeline
        </p>
      </div>
    </section>
  );
}
