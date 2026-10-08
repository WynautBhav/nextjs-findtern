/* eslint-disable @next/next/no-img-element -- already-optimised WebP from /public;
   next/image would re-encode per width for no gain. */
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Gauge, Handshake, ShieldCheck, Sparkles } from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { CountUp } from "@/components/motion/count-up";
import { TiltCard } from "@/components/motion/tilt-card";
import { CirclePhoto } from "@/components/home/sections";
import { ABOUT_COPY } from "@/lib/content/site";
import { PARTNERS, HAPPY_FACES } from "@/lib/content/proof";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import { VelocityMarquee } from "@/components/motion/velocity-marquee";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Findtern screens, tests and scores interns before an employer ever sees them. Our mission, our method, and the guarantees behind every placement.",
  alternates: { canonical: "/about" },
};

const METHOD = [
  {
    Icon: ShieldCheck,
    title: "We verify before you review",
    body: "Academics, documents and identity are checked before a profile is ever shown to an employer. You never screen a candidate whose basics have not been confirmed.",
  },
  {
    Icon: Gauge,
    title: "One published score",
    body: "Five weighted dimensions produce a single number out of ten. Every input and every weight is shown to the candidate, because a score you cannot inspect is a score you cannot plan around.",
  },
  {
    Icon: Handshake,
    title: "Every engagement is contracted",
    body: "A scope, a rate, an approved timesheet and a payment that moves through the platform. We do not place anyone in an unpaid internship.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Findtern"
        title={
          <>
            Hiring an intern should be{" "}
            <span className="text-primary">effortless</span>, not exhausting.
          </>
        }
        lead="Findtern is a platform that connects companies with pre-vetted, skilled interns in a few clicks — and holds both sides to a published standard."
      >
        <ButtonLink href="/employers" variant="primary" size="lg">
          Hire an intern
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/interns" variant="outline" size="lg">
          Find my internship
        </ButtonLink>
      </PageHero>

      {/* ── Mission ─────────────────────────────────────────────────── */}
      <PageSection>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-20">
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
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <span className="text-base leading-relaxed text-ink-600">
                    <strong className="font-semibold text-ink-900">{p.title}</strong> — {p.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <TiltCard max={4} className="rounded-3xl">
            <div className="relative overflow-hidden rounded-3xl border border-ink-200 bg-ink-50">
              <CirclePhoto
                src="/media/group-six-indian.jpg"
                alt="A group of interns reviewing work together"
                className="aspect-4/3 w-full rounded-none border-0"
                sizes="(max-width: 1024px) 90vw, 42vw"
              />
            </div>
          </TiltCard>
        </div>
      </PageSection>

      {/* ── Method ──────────────────────────────────────────────────── */}
      <PageSection tone="muted">
        <SectionHeading
          lead="How it"
          accent="works"
          sub="Three commitments that decide whether a placement is worth anything."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {METHOD.map(({ Icon, title, body }) => (
            <TiltCard key={title} max={5} className="rounded-2xl">
              <article className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-6 sm:p-7">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                  {title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{body}</p>
              </article>
            </TiltCard>
          ))}
        </div>
      </PageSection>

      {/* ── Numbers ─────────────────────────────────────────────────── */}
      <PageSection>
        <div className="grid gap-10 sm:grid-cols-3">
          <Figure value={18} suffix="mo" label="Guarantee window" />
          <Figure value={3} label="Plans, no lock-in" />
          <Figure value={0} prefix="₹" label="Fee above a 6/10 score" />
        </div>
        <p className="mt-8 text-center text-sm text-ink-500">
          Product terms, not performance claims. Placement figures are published on
          the <a href="/terms-and-conditions" className="text-primary underline underline-offset-4">terms page</a> once
          they reach a threshold we are willing to stand behind.
        </p>
      </PageSection>

      {/* ── Who we work with ────────────────────────────────────────── */}
      <PageSection tone="muted" className="py-14">
        <p className="text-center text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">
          Working with{" "}
          <span className="text-primary">{PARTNERS.length} teams</span> across India
        </p>
        <VelocityMarquee duration={40} className="mt-8">
          {PARTNERS.map((p) => (
            <div
              key={p.id}
              className="flex h-12 w-40 shrink-0 items-center justify-center"
            >
              <img
                src={p.logoUrl}
                alt={p.name}
                width={160}
                height={44}
                loading="lazy"
                decoding="async"
                className="max-h-10 w-auto max-w-full object-contain opacity-75"
              />
            </div>
          ))}
        </VelocityMarquee>
      </PageSection>

      {/* ── Social proof ────────────────────────────────────────────── */}
      <PageSection>
        <SectionHeading
          lead="In their"
          accent="words"
          sub="What the people on the other side of a placement say about it."
        />
        <div className="mt-12">
          <TestimonialCarousel
            testimonials={HAPPY_FACES.map((f) => ({
              id: f.id,
              name: f.name,
              role: f.company ? `${f.title} · ${f.company}` : f.title,
              quote: f.quote,
              avatarUrl: f.avatarUrl,
            }))}
          />
        </div>
      </PageSection>

      {/* ── Close ───────────────────────────────────────────────────── */}
      <PageSection tone="brand" className="text-center">
        <Sparkles className="mx-auto size-7 text-accent-300" aria-hidden />
        <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
          Two minutes to a profile. The rest is on us.
        </h2>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/signup" variant="accent" size="lg">
            Register for an internship
          </ButtonLink>
          <ButtonLink href="/contact" variant="outlineLight" size="lg">
            Talk to us first
          </ButtonLink>
        </div>
      </PageSection>
    </>
  );
}

function Figure({
  value,
  suffix = "",
  prefix = "",
  label,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
}) {
  return (
    <div className="text-center">
      <p className="text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
        <CountUp value={value} prefix={prefix} />
        {suffix ? <span className="text-xl font-medium text-ink-400">{suffix}</span> : null}
      </p>
      <p className="mt-2 text-base text-ink-500">{label}</p>
    </div>
  );
}
