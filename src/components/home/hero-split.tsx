"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Check, Coffee, GraduationCap } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { TextReveal } from "@/components/motion/text-reveal";
import { ScoreCard } from "@/components/home/score-card";
import { HOME_COPY, HOME_STUDENT_COPY } from "@/lib/content/site";
import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Hero.
 *
 * Built to the pattern that won across 28 measured premium sites (Vercel,
 * Linear, Stripe, Notion, Clay, Wellfound, Brex, Supabase, Remote, Toptal):
 *
 *  - Locked to exactly one viewport: min-h[min(100svh - header, 1100px)].
 *    Linear ships `min-height: calc(100 * var(--dvh))`; Vercel
 *    `min-h-[min(calc(100svh - var(--header-height)), 1100px)]`. The earlier
 *    version of this hero was content-height, which is why it read as
 *    unassembled rather than composed.
 *
 *  - A real artifact, not mood media. Linear ships a product frame, Wellfound
 *    ships live-looking activity chips. NOT ONE of the 20 measurable B2B
 *    heroes ships an autoplaying background video. The video that used to sit
 *    behind this headline is now a supporting band further down the page.
 *
 *  - Two-tone headline with the accent on the LAST CLAUSE. Wellfound does
 *    `Where great companies <em>meet great people.</em>` and reuses it at four
 *    other heading levels. Splitting mid-sentence is what makes a two-tone
 *    headline read as arbitrary.
 *
 *  - 48px → 88px via clamp, line-height 0.98, tracking -0.04em, weight 500.
 *    Wellfound's exact values, and the median of the set.
 *
 *  - 2 CTAs, distinguished by fill rather than by size or shape. Vercel, Attio
 *    and Supabase all do this.
 *
 *  - The employer/candidate split lives here as two cards, not in the navbar.
 *    Wellfound is the closest analogue in the whole set - a job marketplace with
 *    the same two-sided problem - and it puts the split under the headline for
 *    exactly this reason: it gives each audience its own argument instead of
 *    two nav buttons arguing over the same bar.
 *
 *  - A small "I'm hiring / I'm a student" switch above the headline. Employer
 *    stays the default; the student side swaps only the headline, subhead
 *    and CTAs, so a student landing here is not told to "hire an intern".
 */

type Audience = "employer" | "student";
export function HeroSplit() {
  const [audience, setAudience] = useState<Audience>("employer");
  // The word-by-word reveal is for first paint only. After a switch the new
  // subhead renders plainly instead of replaying the animation.
  const [switched, setSwitched] = useState(false);
  const copy = audience === "employer" ? HOME_COPY : HOME_STUDENT_COPY;
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onCanPlay = () => setReady(true);
    v.addEventListener("canplay", onCanPlay);
    if (v.readyState >= 3) setReady(true);
    return () => v.removeEventListener("canplay", onCanPlay);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    const band = bandRef.current;
    if (!v || !band) return;

    const saveData =
      (navigator as { connection?: { saveData?: boolean } }).connection?.saveData ??
      false;

    // Reduced motion: the poster stands in for the video. There is no play
    // control on the band (bug sheet), so nothing is fetched either.
    if (prefersReducedMotion()) return;

    let loaded = false;
    const load = () => {
      if (loaded || saveData) return;
      loaded = true;
      v.load();
    };

    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        load();
        near.disconnect();
      },
      { rootMargin: "300px" },
    );
    near.observe(band);

    const visible = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShown(true);
        if (!loaded) return;
        if (entry.isIntersecting) {
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.15 },
    );
    visible.observe(v);

    return () => {
      near.disconnect();
      visible.disconnect();
    };
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-brand-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_-10%,rgb(22_107_84/0.55)_0%,transparent_70%)]"
      />

      {/*
        One viewport, minus the header, capped at 1100px. The cap matters: on a
        very tall display an uncapped 100svh hero pushes every other section
        off the screen entirely.
      */}
      <div className="container-page relative flex min-h-[calc(100svh-4rem)] flex-col justify-start pt-6 pb-12 sm:py-14 lg:justify-center lg:py-20 lg:min-h-[calc(100svh-5rem)] lg:max-h-[1100px]">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
          {/* ── Copy ────────────────────────────────────────────── */}
          <div>
            <div
              role="group"
              aria-label="Show the page for"
              className="mb-7 inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1"
            >
              {(
                [
                  { id: "employer", label: "I'm hiring", Icon: Building2 },
                  { id: "student", label: "I'm a student", Icon: GraduationCap },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={audience === id}
                  aria-controls="hero-copy"
                  onClick={() => {
                    if (id === audience) return;
                    setAudience(id);
                    setSwitched(true);
                  }}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    audience === id
                      ? "bg-white text-brand-950"
                      : "text-on-dark-subtle hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <div id="hero-copy">
              <h1 className="text-balance text-[clamp(2.5rem,6.5vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.04em] text-white">
                {copy.headlineLead}{" "}
                <span className="text-accent-400">{copy.headlineAccent}</span>
              </h1>

              {switched ? (
                <p className="mt-7 max-w-md text-lg leading-relaxed text-on-dark-subtle">{copy.subhead}</p>
              ) : (
                <TextReveal
                  as="p"
                  trigger={false}
                  delay={0.55}
                  stagger={0.02}
                  className="mt-7 max-w-md text-lg leading-relaxed text-on-dark-subtle"
                  text={copy.subhead}
                />
              )}

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                {audience === "employer" ? (
                  <>
                    <ButtonLink href="/employers" variant="accent" size="lg">
                      <Building2 className="size-4" aria-hidden />
                      Hire an intern
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                    <ButtonLink href="/interns" variant="outlineLight" size="lg">
                      <GraduationCap className="size-4" aria-hidden />
                      Find my internship
                    </ButtonLink>
                  </>
                ) : (
                  <>
                    <ButtonLink href="/signup" variant="accent" size="lg">
                      <GraduationCap className="size-4" aria-hidden />
                      Create my profile
                      <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                    <ButtonLink href="/interns" variant="outlineLight" size="lg">
                      How it works for interns
                    </ButtonLink>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Proof artifact ───────────────────────────────────── */}
          <div className="lg:pl-4">
            <ScoreCard />
          </div>
        </div>

        {/* ── Two employer arguments ───────────────────────────────
            Both cards speak to the company hiring. The candidate pitch used
            to sit in the second slot, which put "get your deposit back"
            beside "start hiring" on a page whose headline, stats and pricing
            table are all addressed to employers. Candidates still have the
            secondary CTA above and their own page at /interns. */}
        <div className="mt-14 grid gap-4 sm:mt-16 lg:grid-cols-2 lg:gap-5">
          <AudienceCard
            kicker="Screened for you"
            Icon={Building2}
            title="Hire someone who has already been screened"
            body="Browse candidates who are interviewed, tested, and scored. Filter by Findtern Score, skills, and interests."
            cta={{ label: "Start hiring", href: "/employers" }}
          />
          <AudienceCard
            kicker="Priced by score"
            Icon={Coffee}
            title="A published price for every score band"
            body="Espresso, Cappuccino and Latte: three plans, one per score band, each with a fixed hourly rate and a flat ₹5,000 per hire. Espresso is free through 2026."
            cta={{ label: "See pricing", href: "/pricing" }}
          />
        </div>
      </div>

      {/* ── Supporting video band ──────────────────────────────────
          Demoted from hero backdrop to a supporting band. It still carries
          the emotional image, but it no longer has to do the job of
          explaining the product.

          Lazy-loaded. This is 1.5 MB of the page's 1.9 MB - 88% of total
          weight - and it sits entirely below the fold. `preload="none"` plus
          an IntersectionObserver means a first-time visitor on the homepage
          downloads ~140 KB of media instead of 1.6 MB, and the video only
          arrives once they scroll toward it. A poster frame is shown until
          then, so the band is never an empty black rectangle. */}
      <div className="container-page pb-14 sm:pb-20">
        <div
          ref={bandRef}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-brand-950 bg-[url('/media/hero-poster.webp')] bg-cover bg-center shadow-2xl"
        >
          {/* Taller on phones so the caption has its own lower third instead
              of sitting across the subject; wide from sm up, where the
              caption keeps to the left of the centred graduate. */}
          <video
            ref={videoRef}
            className={cn(
              "aspect-4/5 w-full object-cover object-[center_30%] transition-opacity duration-1000 sm:aspect-16/9 sm:object-[center_35%] lg:aspect-21/9",
              ready ? "opacity-100" : "opacity-0",
            )}
            poster="/media/hero-poster.webp"
            muted
            loop
            playsInline
            preload="none"
            aria-hidden
            tabIndex={-1}
            data-hero-video
          >
            <source
              src="/media/hero-1080.mp4"
              type="video/mp4"
              media="(min-width: 640px)"
            />
            <source src="/media/hero-720.mp4" type="video/mp4" />
          </video>

          {/* Scrims. The overlay used to sit on a flat tint over the whole
              frame, which buried the subject. These only darken where the
              text is: the bottom on every size, plus the left edge from sm
              up, so the graduate in the centre stays at full brightness. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-brand-950/95 via-brand-950/60 to-transparent sm:h-4/5 sm:via-brand-950/40"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-3/5 bg-gradient-to-r from-brand-950/70 via-brand-950/25 to-transparent sm:block"
          />

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:p-9 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:p-12",
              "transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none",
              shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
            )}
          >
            {/* Capped to the left third from sm up: the graduate sits at
                roughly 37-67% of the frame width, and the copy must not
                reach their head. */}
            <div className="max-w-md sm:max-w-[34%]">
              <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-accent-300">
                <GraduationCap className="size-3" aria-hidden />
                Why it works
              </span>
              <h2 className="mt-3 text-balance text-[1.5rem] font-medium leading-[1.15] tracking-[-0.02em] text-white sm:text-[clamp(1.25rem,2.3vw,2.125rem)]">
                Screened before you meet them.{" "}
                <span className="text-accent-400">Billed only for approved hours.</span>
              </h2>
            </div>
            <ul className="flex shrink-0 flex-col gap-2 text-sm text-white/85 sm:flex-row sm:gap-5">
              {["Coding, aptitude and interview tested", "Weekly timesheets"].map((item) => (
                <li key={item} className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-accent-300" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}

function AudienceCard({
  kicker,
  Icon,
  title,
  body,
  cta,
}: {
  kicker: string;
  Icon: typeof Building2;
  title: string;
  body: string;
  cta: { label: string; href: string };
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.07] sm:p-7">
      <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-accent-300">
        <Icon className="size-3" aria-hidden />
        {kicker}
      </span>

      <h2 className="mt-4 max-w-sm text-balance text-xl font-medium leading-[1.2] tracking-[-0.02em] text-white sm:text-2xl">
        {title}
      </h2>
      <p className="mt-3 max-w-sm text-base leading-relaxed text-on-dark-subtle">
        {body}
      </p>

      <ButtonLink
        href={cta.href}
        variant="ghost"
        size="sm"
        className="group/link mt-5 -ml-3.5 justify-start !text-white hover:!bg-white/10"
      >
        {cta.label}
        <ArrowRight
          className="size-3.5 transition-transform duration-300 group-hover/link:translate-x-1"
          aria-hidden
        />
      </ButtonLink>
    </div>
  );
}
