"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  ClipboardCheck,
  FileText,
  Laptop,
  TrendingUp,
  UserCheck,
  UserPlus,
} from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
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
 * The seven-step pipeline, compact.
 *
 * Desktop: a sticky image on the left follows whichever step is in the middle
 * of the viewport, beside a tight numbered list on the right. The previous
 * alternating timeline gave every step a full-width row with half of it empty,
 * which made seven steps cost about five screens of scrolling.
 *
 * Mobile: the same list with a small thumbnail per step; no sticky media.
 * Hovering or focusing a step also selects it, so the image is reachable
 * without scrolling. Reduced motion only drops the crossfade.
 */
export function PopularTimeline({ steps }: { steps: PopularStep[] }) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === "undefined") return;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-step]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(Number((hit.target as HTMLElement).dataset.step));
      },
      // A thin band across the middle of the viewport: one step at a time.
      { rootMargin: "-45% 0px -50% 0px" },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [steps.length]);

  const current = steps[active] ?? steps[0];

  return (
    <section id="popular" className="section-y relative">
      <div className="container-page">
        <SectionHeading
          lead="From blank profile to"
          accent="signed offer"
          sub="Seven steps, each one a gate we publish. Nobody reaches an employer without passing all of them."
        />

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {/* Sticky media (desktop only) */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <div className="relative aspect-4/3 overflow-hidden rounded-2xl border border-ink-200 bg-ink-100">
                {steps.map((step, i) => (
                  <Image
                    key={step.image}
                    src={step.image}
                    alt={i === active ? step.imageAlt : ""}
                    aria-hidden={i !== active}
                    fill
                    sizes="(min-width: 1024px) 40vw, 1px"
                    className={cn(
                      "object-cover transition-opacity duration-500 ease-out motion-reduce:transition-none",
                      i === active ? "opacity-100" : "opacity-0",
                    )}
                  />
                ))}
              </div>
              <p className="mt-4 flex items-baseline gap-3 text-sm text-ink-500">
                <span className="font-semibold tabular-nums text-primary">
                  {String(active + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                </span>
                <span className="text-ink-700">{current?.title}</span>
              </p>
            </div>
          </div>

          {/* Step list */}
          <ol ref={listRef} className="relative">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[step.icon] ?? UserPlus;
              const isActive = i === active;
              return (
                <li
                  key={step.title}
                  data-step={i}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className={cn(
                    "group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 border-t border-ink-200 py-5 outline-none first:border-t-0 first:pt-0",
                    "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-4 rounded-sm",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-10 items-center justify-center rounded-full border transition-colors duration-300",
                      isActive
                        ? "border-primary bg-primary text-white"
                        : "border-ink-200 bg-white text-ink-500",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                      Step {i + 1}
                    </p>
                    <h3
                      className={cn(
                        "mt-1 text-lg font-semibold tracking-tight transition-colors duration-300",
                        isActive ? "text-ink-900" : "text-ink-700",
                      )}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                    {/* Mobile thumbnail */}
                    <div className="relative mt-4 aspect-16/9 overflow-hidden rounded-xl bg-ink-100 lg:hidden">
                      <Image
                        src={step.image}
                        alt={step.imageAlt}
                        fill
                        sizes="90vw"
                        className="object-cover"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
