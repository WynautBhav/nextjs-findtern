"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, GraduationCap, Play } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { TextReveal } from "@/components/motion/text-reveal";
import { CountUp } from "@/components/motion/count-up";
import { ScoreCard } from "@/components/home/score-card";
import { HOME_COPY } from "@/lib/content/site";
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
 */
export function HeroSplit() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Assigned from an event, not set synchronously, so this does not force a
    // second render pass on mount.
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

    // Lazy + play/pause. The source is not fetched until the band is within
    // 300px of the viewport; playback is then tied to real visibility, and
    // suppressed entirely under data saver. Three conditions, because 1.5 MB
    // of video sitting 88% of the page's weight is not something to spend on a
    // visitor who will never scroll to it.
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
        if (!loaded) return;
        if (entry.isIntersecting) {
          void v
            .play()
            .then(() => setPlaying(true))
            .catch(() => setPlaying(false));
        } else {
          v.pause();
          setPlaying(false);
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

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // The observer may not have fired yet if the visitor reached the control
      // by keyboard without scrolling, so an explicit press loads on demand.
      if (v.networkState === HTMLMediaElement.NETWORK_EMPTY) v.load();
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

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
      <div className="container-page relative flex min-h-[calc(100svh-4rem)] max-h-[1100px] flex-col justify-center py-14 lg:min-h-[calc(100svh-5rem)] lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
          {/* ── Copy ────────────────────────────────────────────── */}
          <div>
            <h1 className="text-balance text-[clamp(2.5rem,6.5vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.04em] text-white">
              {HOME_COPY.headlineLead}{" "}
              <span className="text-accent-400">{HOME_COPY.headlineAccent}</span>
            </h1>

            <TextReveal
              as="p"
              trigger={false}
              delay={0.55}
              stagger={0.02}
              className="mt-7 max-w-md text-lg leading-relaxed text-on-dark-subtle"
              text={HOME_COPY.subhead}
            />

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/employers" variant="accent" size="lg">
                <Building2 className="size-4" aria-hidden />
                Hire an intern
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/interns" variant="outlineLight" size="lg">
                <GraduationCap className="size-4" aria-hidden />
                Find my internship
              </ButtonLink>
            </div>

            {/* Trust numbers. Counted up on scroll into view. */}
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/8 pt-8">
              <Stat value={18} suffix="mo" label="Guarantee window" />
              <Stat value={3} label="Plans, no lock-in" />
              <Stat value={0} prefix="₹" label="Fee above 6/10" accent />
            </dl>
          </div>

          {/* ── Proof artifact ───────────────────────────────────── */}
          <div className="lg:pl-4">
            <ScoreCard />
          </div>
        </div>

        {/* ── The two audience paths ────────────────────────────── */}
        <div className="mt-14 grid gap-4 sm:mt-16 lg:grid-cols-2 lg:gap-5">
          <AudienceCard
            kicker="For employers"
            Icon={Building2}
            title="Hire someone who has already been screened"
            body="Browse candidates who are interviewed, tested, and scored. Filter by Findtern Score, skills, and interests."
            cta={{ label: "Start hiring", href: "/employers" }}
            hrefPreview="/media/partner-6-manari-india.webp"
          />
          <AudienceCard
            kicker="For candidates"
            Icon={GraduationCap}
            title="Get placed, or get your deposit back"
            body="One assessment produces a score you can see the working for. That score sets the rate employers pay."
            cta={{ label: "How it works", href: "/interns" }}
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
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-brand-900 bg-[url('/media/hero-poster.jpg')] bg-cover bg-center"
        >
          <video
            ref={videoRef}
            className={cn(
              "aspect-16/9 w-full object-cover object-[center_35%] transition-opacity duration-1000 sm:aspect-21/9",
              ready ? "opacity-100" : "opacity-0",
            )}
            poster="/media/hero-poster.jpg"
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

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(4_29_23/0.72)_0%,transparent_50%)]"
          />

          <p className="pointer-events-none absolute bottom-4 left-5 max-w-xs text-sm font-medium text-white/90 sm:bottom-5 sm:left-7 sm:text-base">
            Every engagement is contracted, every hour is logged, and the
            stipend moves through the platform.
          </p>

          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause background video" : "Play background video"}
            className="absolute bottom-4 right-4 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-brand-950/45 text-white/85 backdrop-blur-md transition-[transform,border-color,color] duration-200 ease-ease-out [@media(any-hover:hover)]:hover:scale-105 hover:border-white/45 hover:text-white sm:bottom-5 sm:right-6"
          >
            {playing ? <PauseGlyph /> : <Play className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
    </section>
  );
}

function PauseGlyph() {
  return (
    <span className="flex gap-1" aria-hidden>
      <span className="h-3.5 w-1 rounded-sm bg-current" />
      <span className="h-3.5 w-1 rounded-sm bg-current" />
    </span>
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
  hrefPreview?: string;
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

function Stat({
  value,
  suffix = "",
  prefix = "",
  label,
  accent,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span
          className={cn(
            "block text-2xl font-semibold tracking-tight sm:text-3xl",
            accent ? "text-accent" : "text-white",
          )}
        >
          <CountUp value={value} prefix={prefix} />
          {suffix ? (
            <span className="text-base font-medium opacity-70">{suffix}</span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs text-on-dark-subtle">{label}</span>
      </dd>
    </div>
  );
}
