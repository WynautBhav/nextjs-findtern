import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, webPageJsonLd } from "@/lib/seo";
import { CONDITIONS, EXCLUSIONS, FAQS, PROGRAM_TERMS, STEPS, termsFor } from "@/lib/content/guarantee";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

/** The fee is admin-editable (platform_settings), so the page and its
    metadata read it rather than a hardcoded figure. Whole rupees. */
async function getFeeRupees(): Promise<number> {
  return Math.round((await getInternActivationFeeMinor()) / 100);
}

export async function generateMetadata(): Promise<Metadata> {
  const fee = await getFeeRupees();
  return {
    title: "Guaranteed Internship Program: Placed or Your Fee Back",
    description: `Findtern's internship guarantee for students in India: placed within 6 months of your AI interview or the ₹${fee.toLocaleString("en-IN")} fee is refunded in full. The process, the three conditions, exclusions and refund timing.`,
    alternates: { canonical: "/guaranteed-internship-program" },
  };
}

const WHY_CHOOSE = [
  {
    title: "AI-Driven Screening",
    text: "Objective skill assessment that showcases your technical and communicative strengths directly to founders.",
  },
  {
    title: "Verified Hiring Companies",
    text: "Every employer is legal-entity verified with authentic stipends and structured internship programs.",
  },
  {
    title: "Transparent Rubric",
    text: "No black-box filters. You see your exact scores across Coding, Communication, and Aptitude.",
  },
  {
    title: "Guided Placement Track",
    text: "Structured journey from profile onboarding and AI interview to offer review and verified placement.",
  },
];

/** One icon per exclusion, in the order of EXCLUSIONS. */
const EXCLUSION_ICONS = [Wallet, Clock, Lock, XCircle];

export default async function GuaranteePage() {
  const [fee, metadata] = await Promise.all([getFeeRupees(), generateMetadata()]);
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({
            path: "/guaranteed-internship-program",
            name: "Findtern Guaranteed Internship Program",
            description: String(metadata.description),
          }),
          breadcrumbJsonLd([
            { name: "For interns", path: "/interns" },
            { name: "Guaranteed Internship Program", path: "/guaranteed-internship-program" },
          ]),
          faqJsonLd(FAQS),
        ]}
      />
      <PageHero
        eyebrow="Guaranteed Internship Program"
        title={
          <>
            Your Internship. Guaranteed.{" "}
            <span className="text-primary">Or Your Money Back.</span>
          </>
        }
        lead="A clear, step-by-step path from sign-up to placement — designed for confidence, transparency, and real outcomes. One fee, refunded in full if we do not place you."
      >
        {/* One block: PageHero lays its children out side by side, which pushed the chips away from the buttons. */}
        <div className="flex flex-col items-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/signup" variant="primary" size="lg">
            Sign Up Now
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/interns" variant="outline" size="lg">
            Back to Interns
          </ButtonLink>
        </div>

        {/* Hero Badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-ink-700">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-ink-200/80 bg-white/80 px-3.5 py-1.5 backdrop-blur-xs shadow-2xs">
            <Clock className="size-3.5 text-primary" />
            <span>6-Month Guarantee Window</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-ink-200/80 bg-white/80 px-3.5 py-1.5 backdrop-blur-xs shadow-2xs">
            <Lock className="size-3.5 text-primary" />
            <span>Verified Employers</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-ink-200/80 bg-white/80 px-3.5 py-1.5 backdrop-blur-xs shadow-2xs">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>100% Refund Assurance</span>
          </div>
        </div>
        </div>
      </PageHero>

      {/* ── Terms at a glance ──────────────────────────────────────── */}
      <PageSection tone="muted">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {termsFor(fee).map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs"
            >
              <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-600">
                {t.label}
              </dt>
              <dd className="mt-2">
                <span className="block text-2xl font-semibold tracking-tight text-ink-900">{t.value}</span>
                <span className="mt-1 block text-sm text-ink-600">{t.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </PageSection>

      {/* ── How it works: 5 Steps ──────────────────────────────────── */}
      <PageSection>
        <SectionHeading
          lead="The process"
          accent="How it works"
          sub="One simple flow — you always know what’s next."
        />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step) => (
            <li key={step.n}>
              <div className="group relative flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-6 transition-all hover:border-brand-300 hover:shadow-md">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                  {step.n}
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </PageSection>

      {/* ── Program Terms & Conditions ─────────────────────────────── */}
      <PageSection tone="muted">
        <SectionHeading
          lead="The contract"
          accent="Terms & conditions"
          sub="Clear rules. No surprises. Built for complete trust."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PROGRAM_TERMS.map((term) => (
            <TiltCard key={term.title} max={4} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-6 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <h3 className="text-base font-semibold text-ink-900">{term.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{term.text}</p>
              </article>
            </TiltCard>
          ))}
        </div>
      </PageSection>

      {/* ── Three conditions ───────────────────────────────────────── */}
      <PageSection>
        <SectionHeading
          lead="Exactly"
          accent="3 conditions"
          sub="Refund conditions, and what each one actually requires of you."
        />
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {CONDITIONS.map(({ n, title, body }) => (
            <li key={n}>
              <TiltCard max={5} className="h-full rounded-2xl">
                <article className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-6 sm:p-7">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-base font-semibold tabular-nums text-primary">
                    {n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink-900">
                    {title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </article>
              </TiltCard>
            </li>
          ))}
        </ol>
      </PageSection>

      {/* ── Why choose Findtern ─────────────────────────────────────── */}
      <PageSection tone="muted">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16 items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Why choose Findtern
            </span>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Faster shortlisting, better-fit matches, and a transparent path.
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              Findtern removes the guesswork from early-career hiring by verifying your skills with real evaluations that hiring managers trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" variant="primary" size="lg">
                Get Started
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/faq" variant="outline" size="lg">
                View FAQ
              </ButtonLink>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {WHY_CHOOSE.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-ink-200 bg-white p-5 shadow-2xs"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Sparkles className="size-4" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      {/* ── Exclusions ─────────────────────────────────────────────── */}
      <PageSection tone="brand">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-white sm:text-4xl">
              What the guarantee does not cover
            </h2>
            <p className="mt-4 text-lg text-on-dark-subtle">
              Stated here rather than in a footnote, because a guarantee that
              only works in the easy cases is not a guarantee.
            </p>
            <div className="mt-9 flex flex-col items-start gap-3">
              <ButtonLink href="/signup" variant="accent" size="lg">
                Get assessed
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/faq" variant="outlineLight" size="md">
                More questions
              </ButtonLink>
            </div>
          </div>

          <ul className="space-y-4">
            {EXCLUSIONS.map(({ title, body }, i) => {
              const Icon = EXCLUSION_ICONS[i] ?? XCircle;
              return (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-white/12 bg-white/[0.04] p-5"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-on-dark-subtle">
                    {body}
                  </p>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      </PageSection>

      {/* ── High-Converting CTA Band ────────────────────────────────── */}
      <PageSection>
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-900 via-brand-800 to-emerald-950 p-8 sm:p-12 text-white shadow-xl">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-2xs font-semibold text-emerald-300">
              <Zap className="size-3" />
              Guaranteed Internship Program
            </span>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl text-white">
              Start your career with confidence.
            </h2>
            <p className="mt-3 text-base text-brand-100 leading-relaxed">
              Join the Guaranteed Internship Program today and take control of your path with verified screening, real employer shortlists, and 100% money-back peace of mind.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/signup" variant="accent" size="lg">
                Sign Up Now
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/interns" variant="outlineLight" size="lg">
                Explore Internships
              </ButtonLink>
            </div>
          </div>
        </div>
      </PageSection>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <PageSection tone="muted">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Guarantee questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              The edge cases and program details, answered directly.
            </p>
            <div className="mt-8 flex items-baseline gap-3">
              <p className="text-5xl font-bold tracking-tight text-primary">
                <CountUp value={fee} prefix="₹" />
              </p>
              <p className="text-sm text-ink-600">
                one-time fee,
                <br />
                refundable on conditions
              </p>
            </div>
          </div>
          <FaqExplorer items={FAQS} showSearch={false} showChips={false} />
        </div>
      </PageSection>
    </>
  );
}
