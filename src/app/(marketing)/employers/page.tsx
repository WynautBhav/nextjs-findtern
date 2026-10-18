import type { Metadata } from "next";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleHelp,
  Clock,
  Coins,
  Search,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmployerPlanCards } from "@/components/marketing/employer-plan-cards";
import { getPlans } from "@/lib/content";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { HAPPY_FACES } from "@/lib/content/proof";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";

export const metadata: Metadata = {
  title: "For employers",
  description:
    "Hire interns who are already interviewed, tested and scored. Three plans, no negotiation, and a 160-hour minimum so both sides get enough from the placement.",
  alternates: { canonical: "/employers" },
};

const PROBLEMS = [
  {
    Icon: Clock,
    problem: "Screening takes weeks",
    detail: "Reading two hundred CVs, then scheduling interviews for everyone.",
  },
  {
    Icon: ShieldCheck,
    problem: "Unverified profiles",
    detail: "You find out the degree was never checked after the offer is out.",
  },
  {
    Icon: CircleHelp,
    problem: "Uncertain quality",
    detail: "A CV tells you what someone claims, not what they can do.",
  },
  {
    Icon: Coins,
    problem: "Expensive hiring",
    detail: "Agency fees stack on top of salary for a role that pays part-time.",
  },
];

const STEPS = [
  {
    n: "01",
    Icon: Users,
    title: "Post the role",
    body: "Skills, duration, work mode, budget. Five minutes.",
  },
  {
    n: "02",
    Icon: Search,
    title: "Browse the pool",
    body: "Filter by Findtern Score, skills, city and interests. Everyone is already screened.",
  },
  {
    n: "03",
    Icon: Zap,
    title: "Shortlist and interview",
    body: "Schedule against their availability, agree a scope, and send a proposal.",
  },
];

export default async function EmployersPage() {
  const [plansInr, plansUsd] = await Promise.all([getPlans(true), getPlans(false)]);
  return (
    <>
      <PageHero
        eyebrow="For employers"
        title={
          <>
            Finding the right intern is tough.{" "}
            <span className="text-primary">Findtern makes it easy.</span>
          </>
        }
        lead="Every candidate in the pool has been interviewed, tested and scored before you see them. You are choosing from a shortlist, not sorting a pile."
      >
        <ButtonLink href="/employer/signup" variant="primary" size="lg">
          Start hiring
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/pricing" variant="outline" size="lg">
          See pricing
        </ButtonLink>
      </PageHero>

      {/* Guidance strip. Kept out of the hero's CTA row so it does not become a
          third flex item competing with the two buttons. */}
      <div className="border-b border-ink-100 bg-ink-50/70">
        <div className="container-page py-6 text-center">
          <p className="text-sm text-ink-500">
            Not sure which band you need?{" "}
            <a
              href="/contact"
              className="font-medium text-primary underline underline-offset-4"
            >
              Book a 30-minute call
            </a>{" "}
            and we will tell you which one the role usually falls into.
          </p>
        </div>
      </div>

      {/* ── Problem / solution ─────────────────────────────────────── */}
      <PageSection tone="muted">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr_1fr] lg:items-stretch">
          <div className="grid gap-4">
            {PROBLEMS.slice(0, 2).map(({ Icon, problem, detail }) => (
              <article
                key={problem}
                className="rounded-2xl border border-ink-200 bg-white p-5"
              >
                <Icon className="size-5 text-ink-400" aria-hidden />
                <h3 className="mt-3 text-base font-semibold text-ink-900">{problem}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{detail}</p>
              </article>
            ))}
          </div>

          <TiltCard max={4} className="rounded-2xl">
            <article className="flex h-full flex-col justify-center rounded-2xl bg-brand-950 p-7 text-white sm:p-8">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Briefcase className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">
                What Findtern does instead
              </h3>
              <p className="mt-3 text-base leading-relaxed text-ink-300">
                We take screening off your desk. Academics are verified,
                interviews are structured, tests are standardised, and the
                result is one number you can sort by.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Academics verified before a profile reaches you",
                  "Structured interview and aptitude test per candidate",
                  "One score out of 10, with the arithmetic published",
                  "Contracted engagement, logged hours, paid stipend",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                    <span className="text-sm leading-relaxed text-ink-200">{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </TiltCard>

          <div className="grid gap-4">
            {PROBLEMS.slice(2).map(({ Icon, problem, detail }) => (
              <article
                key={problem}
                className="rounded-2xl border border-ink-200 bg-white p-5"
              >
                <Icon className="size-5 text-ink-400" aria-hidden />
                <h3 className="mt-3 text-base font-semibold text-ink-900">{problem}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </PageSection>

      {/* ── Three steps ────────────────────────────────────────────── */}
      <PageSection>
        <SectionHeading lead="Three steps to" accent="hired" />
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ n, Icon, title, body }) => (
            <li key={n}>
              <TiltCard max={5} className="h-full rounded-2xl">
                <article className="relative h-full overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 sm:p-7">
                  <span
                    aria-hidden
                    className="absolute right-5 top-4 text-4xl font-bold text-ink-100"
                  >
                    {n}
                  </span>
                  <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </article>
              </TiltCard>
            </li>
          ))}
        </ol>
      </PageSection>

      {/* ── Plans ──────────────────────────────────────────────────── */}
      <PageSection tone="muted">
        <SectionHeading
          lead="Pick your"
          accent="band"
          sub="The tier follows the score band, not the negotiation."
          action={
            <ButtonLink href="/pricing" variant="outline" size="md">
              Full rate card
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          }
        />
        <EmployerPlanCards plansInr={plansInr} plansUsd={plansUsd} />
      </PageSection>

      {/* ── Numbers ────────────────────────────────────────────────── */}
      <PageSection className="py-8 sm:py-14 md:py-20">
        <div className="grid grid-cols-3 divide-x divide-ink-200/80 rounded-2xl border border-ink-200/80 bg-white/70 py-5 shadow-xs backdrop-blur-xs sm:divide-x-0 sm:border-0 sm:bg-transparent sm:py-0 sm:shadow-none sm:gap-10">
          <Figure value={160} suffix="hrs" label="Minimum engagement" />
          <Figure value={3} label="Screening stages" />
          <Figure value={7} suffix=" days" label="Typical time to hire" />
        </div>
      </PageSection>

      {/* ── Social proof ───────────────────────────────────────────── */}
      <PageSection tone="muted">
        <SectionHeading
          lead="What employers"
          accent="say"
          sub="Three teams that have hired through Findtern."
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

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <PageSection>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Employer questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              How screening, scoring and payment actually work.
            </p>
          </div>
          <FaqExplorer
            showSearch={false}
            showChips={false}
            items={[
              {
                id: "e1",
                category: "Hiring",
                question: "What is actually verified before I see a profile?",
                answer:
                  "Academic records, identity documents and the assessment. We do not verify employment history, and we do not claim to - check references yourself for anything that matters to the role.",
              },
              {
                id: "e2",
                category: "Hiring",
                question: "How is the Findtern Score calculated?",
                answer:
                  "Five dimensions - communication, aptitude, role depth, coding and academics - each weighted for the track. The candidate sees the same dimensions and weights you do.",
              },
              {
                id: "e3",
                category: "Payment",
                question: "When do I pay?",
                answer:
                  "Hourly tiers are billed against approved timesheets. The fixed ₹5,000 (or $50) per-hire charge is invoiced once when the intern is hired. The intern's stipend is routed separately and does not come out of your invoice.",
              },
              {
                id: "e4",
                category: "Hiring",
                question: "What if an intern does not work out?",
                answer:
                  "Rejections inside the first engagement are not billed. Tell us what happened and the hours stop counting - the timesheet is the contract, and we review disagreements rather than auto-charging.",
              },
              {
                id: "e5",
                category: "Payment",
                question: "Can we hire more than one intern?",
                answer:
                  "Yes, at any volume. Each intern is a separate engagement with its own scope and timesheet, so cancelling one does not affect the others.",
              },
            ]}
          />
        </div>
      </PageSection>
    </>
  );
}

function Figure({
  value,
  suffix = "",
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="px-1 text-center sm:px-0">
      <p className="text-2xl font-bold tracking-tight text-ink-900 sm:text-4xl md:text-5xl">
        <CountUp value={value} />
        {suffix ? <span className="text-xs font-semibold text-ink-400 sm:text-xl sm:font-medium">{suffix}</span> : null}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-ink-500 sm:mt-2 sm:text-base">{label}</p>
    </div>
  );
}
