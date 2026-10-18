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
import { BANDS } from "@/lib/score";
import { BandRate } from "@/components/marketing/region-rates";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, howToJsonLd, webPageJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Paid Internships in India with a Placement Guarantee | For Interns",
  description:
    "Get assessed once, get a Findtern Score you can see the working for, and get placed in a paid internship. If Findtern does not place you within the guarantee window, your deposit comes back.",
  alternates: { canonical: "/interns" },
};

const STEPS = [
  {
    Icon: GraduationCap,
    title: "Sign up and register",
    body: "Academics, skills, languages and what you actually want to do. About 6 minutes.",
    time: "6 min",
  },
  {
    Icon: UserCheck,
    title: "Get assessed",
    body: "A structured interview and aptitude test, generated for the field you picked - not one generic test for everyone.",
    time: "25 min",
  },
  {
    Icon: Star,
    title: "See your score",
    body: "Five dimensions, weighted, with the arithmetic shown. Your rate follows from the band you land in.",
    time: "Instant",
  },
  {
    Icon: MessageSquare,
    title: "Get matched",
    body: "Verified employers see your profile against live requirements. Your contact details stay closed until you respond.",
    time: "Ongoing",
  },
  {
    Icon: BadgeCheck,
    title: "Get placed and paid",
    body: "Signed engagement, approved timesheet, stipend through the platform. Every hour logged.",
    time: "Ongoing",
  },
];

const GUARANTEES = [
  {
    Icon: Clock,
    title: "Placed, or the deposit back",
    body: "The guarantee starts when your assessment is scored. If we have not placed you by the end of the guarantee window, the refundable deposit is returned. The window is set out in the intern terms.",
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
        "Creating a profile is free. Making it live and visible to employers requires a refundable deposit, which is returned if we do not place you within the guarantee window.",
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
        "One: your assessment is scored. Two: you stay reachable and respond to employer requests. Three: you do not decline an offer you asked for. Failing any one ends the obligation - in your favour, not the platform's.",
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

export default function InternsPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/interns", name: "Paid internships with Findtern", description: String(metadata.description) }),
          breadcrumbJsonLd([{ name: "For interns", path: "/interns" }]),
          howToJsonLd({
            name: "How to get a paid internship through Findtern",
            description: "Five stages from sign-up to a paid, contracted placement. About 31 minutes of hands-on time.",
            totalTime: "PT31M",
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
            <span className="text-primary">deposit back</span>.
          </>
        }
        lead="One assessment produces a score you can see the working for. That score sets the rate employers pay. If we do not place you, the deposit comes back."
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
      <PageSection tone="muted">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
          <div>
            <SectionHeading lead="Your score is" accent="the price" align="left" />
            <p className="mt-6 text-balance text-xl leading-relaxed text-ink-700">
              No negotiation, no recruiter leverage, no auction. The score you
              earn is the rate you cost, and the table below is the whole table.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A low score changes your rate. It does not disqualify you.
            </p>
            <ButtonLink href="/pricing" variant="primary" size="md" className="mt-8">
              See the full rate card
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>

          <div className="grid gap-4">
            {BANDS.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6"
              >
                <div>
                  <p className="text-lg font-semibold tracking-tight text-ink-900">
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    Score {b.min}–{b.max} · {b.blurb}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tracking-tight text-primary">
                    <BandRate bandId={b.id} />
                  </p>
                  <p className="text-xs text-ink-500">
                    employer pays fixed per-hire fee
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      {/* ── Five stages ─────────────────────────────────────────────── */}
      <PageSection>
        <SectionHeading
          lead="Five stages. You always know"
          accent="which one you are in."
          sub="Total hands-on time is about 31 minutes. Everything after the assessment is us doing the work."
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
          lead="The Findtern"
          accent="guarantee"
          sub="Published before you pay anything, not after."
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
          <Figure value={31} suffix=" min" label="Hands-on assessment" />
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
        {suffix ? <span className="text-xs font-semibold text-ink-400 sm:text-xl sm:font-medium">{suffix}</span> : null}
      </p>
      <p className="mt-1 text-[11px] leading-tight text-ink-500 sm:mt-2 sm:text-base">{label}</p>
    </div>
  );
}
