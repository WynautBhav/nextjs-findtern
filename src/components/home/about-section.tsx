"use client";

import { CirclePhoto } from "@/components/home/sections";
import { SectionHeading } from "@/components/ui/section-heading";
import { CountUp } from "@/components/motion/count-up";
import { TiltCard } from "@/components/motion/tilt-card";
import { ABOUT_COPY } from "@/lib/content/site";
import { CircleCheck } from "lucide-react";

/**
 * About.
 *
 * The copy is Findtern's own - "effortless, not exhausting", "bridge the gap
 * between talented interns and forward-thinking companies" - taken from the
 * live site rather than paraphrased into something generic.
 *
 * The previous version was three stacked text blocks, a three-item list and a
 * two-circle collage: about 300 words with no hierarchy, so the eye had
 * nowhere to land. Same content, restructured around one short lead, a mission
 * statement, and a three-up value row.
 */
export function AboutSection() {
  return (
    <section className="section-y relative overflow-hidden bg-white">
      <div className="container-page grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-20">
        {/* ── Copy ────────────────────────────────────────────────── */}
        <div>
          <SectionHeading lead={ABOUT_COPY.titleLead} accent={ABOUT_COPY.titleAccent} align="left" />

          <p className="mt-7 max-w-xl text-balance text-xl leading-relaxed text-ink-700 sm:text-2xl">
            {ABOUT_COPY.lead}
          </p>

          <div className="mt-9 border-l-2 border-accent pl-5">
            <h3 className="text-base font-semibold tracking-tight text-ink-900">
              {ABOUT_COPY.mission.title}
            </h3>
            <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
              {ABOUT_COPY.mission.body}
            </p>
          </div>

          <ul className="mt-10 space-y-3.5">
            {ABOUT_COPY.points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <CircleCheck
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden
                />
                <span className="text-base leading-relaxed text-ink-600">
                  <strong className="font-semibold text-ink-900">{p.title}</strong>{" "}
                  - {p.body}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Visual ───────────────────────────────────────────────── */}
        <div>
          <TiltCard max={4} className="rounded-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-ink-200 bg-ink-50">
              <CirclePhoto
                src="/media/group-six-indian.jpg"
                alt="A group of interns reviewing work together"
                className="aspect-4/3 w-full rounded-none border-0"
                sizes="(max-width: 1024px) 90vw, 42vw"
              />

              {/* The one number worth remembering, sitting on the photo
                  rather than below it. This used to read "31 days median
                  time to placement" - an invented figure the live site
                  never published. The guarantee window itself lives in the
                  terms, not on marketing surfaces. */}
              <div className="absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-2xl border border-white/12 bg-brand-950/80 p-4 backdrop-blur-xl sm:inset-x-5 sm:bottom-5 sm:p-5">
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-accent-300">
                    Placement guarantee
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5 text-3xl font-bold text-white">
                    <CountUp value={100} />
                    <span className="text-base font-medium text-ink-300">% refund</span>
                  </p>
                </div>
                <p className="ml-auto max-w-32 text-right text-xs leading-snug text-ink-600">
                  If we cannot place you, the internship fee comes back
                </p>
              </div>
            </div>
          </TiltCard>
        </div>
      </div>
    </section>
  );
}
