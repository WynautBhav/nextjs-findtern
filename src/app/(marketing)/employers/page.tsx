import type { Metadata } from "next";
import {
  ArrowDown,
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
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { getPlans } from "@/lib/content";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { HAPPY_FACES } from "@/lib/content/proof";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/lib/seo";
import { CurrencyPicker } from "@/components/marketing/region-rates";

export const metadata: Metadata = {
  title: "Hire Pre-Screened Interns in India | For Employers",
  description:
    "Hire interns in India who are already interviewed, tested and scored. Three published plans from free to ₹200/hr, a flat ₹5,000 per-hire fee, and hiring from abroad without a visa or local entity.",
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

const EMPLOYER_FAQ = [
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
    {
      id: "e6",
      category: "Payment",
      question: "We are not in India. Can we still hire through Findtern?",
      answer:
        "Yes. You contract with Findtern for a screening and placement service and pay us in US dollars, the way you pay any overseas vendor. We engage the intern in India and pay the stipend in rupees against the hours you approve, so you need no visa, no local entity and no foreign payroll.",
    },
];

export default async function EmployersPage() {
  const [plansInr, plansUsd] = await Promise.all([getPlans(true), getPlans(false)]);
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/employers", name: "Hire interns with Findtern", description: String(metadata.description) }),
          breadcrumbJsonLd([{ name: "For employers", path: "/employers" }]),
          howToJsonLd({
            name: "How to hire an intern on Findtern",
            description: "Three steps from posting a role to a signed proposal, with screening already done.",
            totalTime: "P7D",
            steps: STEPS.map((s) => ({ name: s.title, text: s.body })),
          }),
          faqJsonLd(EMPLOYER_FAQ),
        ]}
      />
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
        <div className="mt-8 flex justify-center">
          <CurrencyPicker />
        </div>
        <EmployerPlanCards plansInr={plansInr} plansUsd={plansUsd} />

        <div className="mt-16" id="calculator">
          <SectionHeading
            lead="What an intern"
            accent="costs a month"
            sub="Pick the plan and the days a week. Every day is a full 8-hour day; the arithmetic sits beside the answer."
          />
          <PricingCalculator plansInr={plansInr} plansUsd={plansUsd} className="mt-12" />
        </div>
      </PageSection>

      {/* ── Hiring from outside India ──────────────────────────────
          An argument, not a feature grid: the headline states the model,
          the figure shows where the money goes, and the list answers the
          four questions an overseas founder actually asks. */}
      <PageSection id="international">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-20">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Hiring from outside India? You buy a service from us. We pay the intern.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              A company abroad cannot put an Indian student on its payroll. There is
              no work visa, no local entity, and no clean way to send a monthly stipend
              to a foreign bank account.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              So you contract with Findtern for screening and placement and pay us in
              dollars, the way you already pay any overseas software or advertising
              vendor. We engage the intern in India, pay the stipend in rupees against
              the hours you approve, and keep the records Indian rules require.
            </p>
          </div>

          <div>
            <MoneyFlow />
            <dl className="mt-8 divide-y divide-ink-200 border-y border-ink-200 text-sm">
              {[
                ["Work visa", "Not needed. The intern works from India."],
                ["Local entity", "Not needed. Your contract is with Findtern."],
                ["Your invoice", "In US dollars, monthly or up front. The same rate card, at ₹100 = $1."],
                ["The stipend", "In rupees, paid by Findtern against the timesheet hours you approve."],
              ].map(([term, detail]) => (
                <div key={term} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 py-3.5">
                  <dt className="text-ink-500">{term}</dt>
                  <dd className="leading-relaxed text-ink-800">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
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
            items={EMPLOYER_FAQ}
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

/**
 * Where the money goes. Three parties and two transfers, drawn as a line so
 * the currency change is visible at a glance: dollars into Findtern, rupees
 * out to the intern. Decorative only in the sense that the list below says
 * the same thing in words.
 */
function MoneyFlow() {
  return (
    <figure aria-label="How payment moves: your company pays Findtern in US dollars, Findtern pays the intern in rupees">
      {/* Stacked on phones, a line on anything wider. */}
      <div className="grid grid-cols-1 items-stretch gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-3 sm:gap-y-0">
        <FlowNode name="Your company" where="Anywhere" />
        <FlowLink label="USD invoice" />
        <FlowNode name="Findtern" where="Jaipur, India" emphasis />
        <FlowLink label="INR stipend" />
        <FlowNode name="The intern" where="Works from India" />
      </div>
    </figure>
  );
}

function FlowNode({ name, where, emphasis }: { name: string; where: string; emphasis?: boolean }) {
  return (
    <div
      className={
        emphasis
          ? "rounded-xl border border-brand-200 bg-brand-50 px-3 py-4 text-center sm:px-4"
          : "rounded-xl border border-ink-200 bg-white px-3 py-4 text-center sm:px-4"
      }
    >
      <p className={emphasis ? "text-sm font-semibold text-primary" : "text-sm font-semibold text-ink-900"}>{name}</p>
      <p className="mt-0.5 text-xs text-ink-500">{where}</p>
    </div>
  );
}

function FlowLink({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pl-5 sm:flex-col sm:gap-1 sm:px-0.5 sm:pl-0">
      {/* Down on phones, right on wider screens. */}
      <span aria-hidden className="flex flex-col items-center text-ink-300 sm:hidden">
        <span className="h-5 w-px bg-current" />
        <ArrowDown className="-mt-1 size-3.5" />
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-ink-600">{label}</span>
      <span aria-hidden className="hidden items-center text-ink-300 sm:flex">
        <span className="h-px w-10 bg-current md:w-12" />
        <ArrowRight className="-ml-1 size-3.5" />
      </span>
    </div>
  );
}
