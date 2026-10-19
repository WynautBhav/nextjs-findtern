import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  GraduationCap,
  Lock,
  MessageSquare,
  ShieldCheck,
  Star,
  UserCheck,
} from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { formatMoney } from "@/lib/format";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Paid Internships in India with a Placement Guarantee | For Interns",
  description:
    "Get assessed once, get a Findtern Score you can see the working for, and get placed in a paid internship. If Findtern does not place you within 18 months of your score, your fee comes back.",
  alternates: { canonical: "/interns" },
};

const STEPS = [
  {
    Icon: GraduationCap,
    title: "Sign up and register",
    body: "Your details, academics, experience and the skills you want to be hired for.",
    time: "15 min",
  },
  {
    Icon: UserCheck,
    title: "Get assessed",
    body: "One AI interview on the skills you picked, plus an aptitude test. Laptop, webcam and microphone, in one sitting.",
    time: "30–60 min",
  },
  {
    Icon: Star,
    title: "See your score",
    body: "One score out of 10, with each part shown: communication, aptitude, coding and the interview. Employers see the same report you do.",
    time: "After review",
  },
  {
    Icon: MessageSquare,
    title: "Get matched",
    body: "Verified employers see your profile against live requirements. Your contact details stay closed until you respond.",
    time: "Until placed",
  },
  {
    Icon: BadgeCheck,
    title: "Get placed and paid",
    body: "Signed engagement, approved timesheet, stipend through the platform. Every hour logged.",
    time: "Monthly",
  },
];

const GUARANTEES = [
  {
    Icon: Clock,
    title: "Placed in 18 months, or your fee back",
    body: "The clock starts the day your assessment is scored. If we have not placed you in a paid internship within 18 months, the full fee is refunded.",
  },
  {
    Icon: Lock,
    title: "No lock-in on you",
    body: "The obligation runs on us. We cannot hold you to a placement period, and we do not charge for one.",
  },
  {
    Icon: ShieldCheck,
    title: "Your data stays yours",
    body: "Your contact details are closed until you respond. Employers see your score and profile, not your number.",
  },
];

const INTERN_FAQ = [
    {
      id: "i1",
      category: "Getting started",
      question: "Is Findtern free for interns?",
      answer:
        "Creating a profile is free. Making it live and visible to employers requires a one-time fee, refunded in full if we do not place you within 18 months of your score.",
    },
    {
      id: "i2",
      category: "Scoring",
      question: "What happens if my score is low?",
      answer:
        "You sit in a lower rate band, which means fewer employers see you because the filter starts higher up the pool. You are not flagged, and you are not blocked from re-scoring.",
    },
    {
      id: "i3",
      category: "Guarantee",
      question: "What are the three refund conditions?",
      answer:
        "One: your assessment is scored. Two: you stay reachable and respond to employer requests. Three: you turn down no more than 3 offers. Failing any one ends the obligation - in your favour, not the platform's.",
    },
    {
      id: "i3a",
      category: "Guarantee",
      question: "Can I hide my profile from employers?",
      answer:
        "Yes, when you need a break - exams, travel, a family matter. A profile can stay hidden for at most 30 days at a time, and the guarantee only runs while employers can see you.",
    },
    {
      id: "i3b",
      category: "Guarantee",
      question: "How many offers can I turn down?",
      answer:
        "Up to 3 during the 18-month window. Turning down a 4th ends the guarantee. Only formal offers count - an interview request you pass on is not an offer.",
    },
    {
      id: "i4",
      category: "Payment",
      question: "When do I get paid?",
      answer:
        "You log hours weekly against the agreed scope. Your manager approves the week, and approved hours roll into the next payment run on a fixed cycle.",
    },
    {
      id: "i5",
      category: "Privacy",
      question: "Who can see my contact details?",
      answer:
        "Nobody, until you respond to them. Employers see your score, skills, availability and work samples - not your phone number or email.",
    },
];

export default async function InternsPage() {
  const feeMinor = await getInternActivationFeeMinor();
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/interns", name: "Paid internships with Findtern", description: String(metadata.description) }),
          breadcrumbJsonLd([{ name: "For interns", path: "/interns" }]),
          howToJsonLd({
            name: "How to get a paid internship through Findtern",
            description: "Five stages from sign-up to a paid, contracted placement. 45 to 75 minutes of your own time.",
            totalTime: "PT75M",
            steps: STEPS.map((s) => ({ name: s.title, text: s.body })),
          }),
          faqJsonLd(INTERN_FAQ),
        ]}
      />
      <PageHero
        eyebrow="For interns"
        title={
          <>
            Get placed, or get your{" "}
            <span className="text-primary">fee back</span>.
          </>
        }
        lead="One assessment produces a score you can see the working for. Pay once to be assessed, and if we do not place you within 18 months, the fee comes back."
      >
        <ButtonLink href="/signup" variant="primary" size="lg">
          Get assessed
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/guaranteed-internship-program" variant="outline" size="lg">
          Read the guarantee
        </ButtonLink>
      </PageHero>

      {/* ── The score is the price ──────────────────────────────────── */}
      {/* ── What it costs you ─────────────────────────────────────────
          The employer rate card used to sit here. A candidate reading this
          page wants their own price, and it was three clicks away inside
          the guarantee terms. */}
      <PageSection tone="muted">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
          <div>
            <SectionHeading lead="What it" accent="costs you" align="left" />
            <p className="mt-6 text-balance text-xl leading-relaxed text-ink-700">
              Your profile is free. To be assessed and shown to employers you pay
              once, and that fee comes back if we do not place you.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Your score never changes what you pay. It decides which employers see you.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8">
            <p className="text-sm text-ink-600">One-time fee</p>
            <p className="mt-1 text-5xl font-semibold tabular-nums tracking-[-0.03em] text-ink-900">
              {formatMoney(feeMinor, "INR", { zeroLabel: false })}
            </p>
            <ul className="mt-6 divide-y divide-ink-100 border-y border-ink-100 text-sm">
              {[
                ["Covers", "Your AI interview, the aptitude test and your Findtern Score report."],
                ["Paid", "Once. No subscription, no renewal, nothing per application."],
                ["Refund", "In full, if you are not placed in a paid internship within 18 months of your score."],
              ].map(([term, detail]) => (
                <li key={term} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 py-3.5">
                  <span className="font-medium text-ink-900">{term}</span>
                  <span className="leading-relaxed text-ink-600">{detail}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <ButtonLink href="/signup" variant="primary" size="md">
                Create a free profile
              </ButtonLink>
              <ButtonLink href="/guaranteed-internship-program" variant="link" size="md" className="px-0">
                How the refund works
              </ButtonLink>
            </div>
          </div>
        </div>
      </PageSection>

      {/* ── Five stages ─────────────────────────────────────────────── */}
      <PageSection>
        <SectionHeading
          lead="Five stages. You always know"
          accent="which one you are in."
          sub="Your own time adds up to 45 to 75 minutes. Everything after the assessment is us doing the work."
        />
        <ol className="mt-14 space-y-4">
          {STEPS.map(({ Icon, title, body, time }) => (
            <li key={title}>
              <TiltCard max={3} className="rounded-2xl">
                <article className="flex flex-wrap items-start gap-5 rounded-2xl border border-ink-200 bg-white p-6">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <h3 className="text-lg font-semibold tracking-tight text-ink-900">
                        {title}
                      </h3>
                      <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-2xs font-medium text-ink-600">
                        {time}
                      </span>
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </article>
              </TiltCard>
            </li>
          ))}
        </ol>
      </PageSection>

      {/* ── Guarantees ──────────────────────────────────────────────── */}
      <PageSection tone="brand">
        <SectionHeading
          tone="dark"
          lead="The Findtern"
          accent="guarantee"
          sub="Placed within 18 months of your score, or every rupee of the fee comes back."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {GUARANTEES.map(({ Icon, title, body }) => (
            <TiltCard key={title} max={4} className="rounded-2xl">
              <article className="flex h-full flex-col rounded-2xl border border-white/12 bg-white/[0.04] p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-on-dark-subtle">{body}</p>
              </article>
            </TiltCard>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/signup" variant="accent" size="lg">
            Get assessed
          </ButtonLink>
          <ButtonLink href="/guaranteed-internship-program" variant="outlineLight" size="lg">
            Full guarantee terms
          </ButtonLink>
        </div>
      </PageSection>

      {/* ── Numbers ────────────────────────────────────────────────── */}
      <PageSection className="py-8 sm:py-14 md:py-20">
        <div className="grid grid-cols-3 divide-x divide-ink-200/80 rounded-2xl border border-ink-200/80 bg-white/70 py-5 shadow-xs backdrop-blur-xs sm:divide-x-0 sm:border-0 sm:bg-transparent sm:py-0 sm:shadow-none sm:gap-10">
          <Figure value={18} suffix=" months" label="Placement window" />
          <Figure value={100} suffix="%" label="Refund if not placed" />
          <Figure value={0} suffix=" lock-in" label="Held against you" />
        </div>
      </PageSection>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <PageSection tone="muted">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Intern questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Scoring, fees and what the guarantee actually covers.
            </p>
          </div>
          <FaqExplorer
            showSearch={false}
            showChips={false}
            items={INTERN_FAQ}
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
        {suffix ? <span className="text-xs font-semibold text-ink-600 sm:text-xl sm:font-medium">{suffix}</span> : null}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-ink-600 sm:mt-2 sm:text-base">{label}</p>
    </div>
  );
}
