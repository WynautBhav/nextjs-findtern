import type { Metadata } from "next";
import { ArrowRight, Clock, Lock, Wallet } from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import { CountUp } from "@/components/motion/count-up";
import { FaqExplorer } from "@/components/marketing/faq-explorer";

export const metadata: Metadata = {
  title: "Guaranteed Internship Program",
  description:
    "Placed in 18 months or your deposit back. The three conditions, the exclusions, the clock start date, and exactly when a refund is paid.",
  alternates: { canonical: "/guaranteed-internship-program" },
};

/* Terms of record, transcribed from the guarantee as published in the Terms
   and Conditions and on the live site. These are the same numbers that appear
   on the terms page - kept in one place so they cannot drift apart. */

const DEPOSIT = 2499;

const CONDITIONS = [
  {
    n: "01",
    title: "Your assessment is scored",
    body: "You complete the full rubric. A low score is not a disqualifier - it changes your rate, not your eligibility.",
  },
  {
    n: "02",
    title: "You stay reachable",
    body: "You respond to employer requests inside the window. Going quiet hands the placement back to us, not to you.",
  },
  {
    n: "03",
    title: "You do not decline an offer you wanted",
    body: "Declining a placement you asked for ends the obligation. Not being invited to one does not.",
  },
];

const TERMS = [
  { label: "Deposit", value: `₹${DEPOSIT.toLocaleString("en-IN")}`, note: "refundable" },
  { label: "Clock starts", value: "Your score", note: "not your sign-up date" },
  { label: "Refund timing", value: "After 18 months", note: "not during the window" },
  { label: "Lock-in on you", value: "None", note: "the obligation runs on us" },
  { label: "Counts as placed", value: "160+ hours", note: "contracted engagement" },
];

const FAQS = [
  {
    id: "g1",
    category: "Refund",
    question: "When exactly does the 18-month clock start?",
    answer:
      "On the date your assessment is scored, not the date you signed up. This follows the standard consumer-law convention where the clock starting early is the usual trick, so it is stated explicitly here.",
  },
  {
    id: "g2",
    category: "Refund",
    question: "Can I get a partial refund during the window?",
    answer:
      "No. The refund is all-or-nothing after the window closes. There is no mid-window payment, and we cannot pay out faster than eighteen months even if we wanted to.",
  },
  {
    id: "g3",
    category: "Refund",
    question: "What is excluded from the guarantee?",
    answer:
      "Anything that was never a placement request, and any engagement under the 160-hour minimum that the Skilled and Assured bands carry. If it did not clear the bar, it was not a placement, and the guarantee stands.",
  },
  {
    id: "g4",
    category: "Refund",
    question: "What counts as declining an offer?",
    answer:
      "Declining a placement you explicitly asked for. Being sent a request you did not initiate, and not responding, is not a decline. Going quiet on a request you did initiate is, and it ends the obligation.",
  },
  {
    id: "g5",
    category: "Refund",
    question: "How long does the refund take to arrive?",
    answer:
      "Refunds are issued to the original payment method within 7 working days of the window closing. You get a written confirmation with the amount and the date.",
  },
];

export default function GuaranteePage() {
  return (
    <>
      <PageHero
        eyebrow="The guarantee"
        title={
          <>
            Placed in 18 months, or{" "}
            <span className="text-primary">₹{DEPOSIT.toLocaleString("en-IN")} back</span>.
          </>
        }
        lead="A refundable deposit held until we place you. It is not a fee for a job and not a fee for an assessment - assessments are free everywhere else in this market, and pretending otherwise would be a strange way to earn your trust."
      >
        <ButtonLink href="/signup" variant="primary" size="lg">
          Get assessed
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/terms-and-conditions" variant="outline" size="lg">
          Read the terms
        </ButtonLink>
      </PageHero>

      {/* ── Terms at a glance ──────────────────────────────────────── */}
      <PageSection tone="muted">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {TERMS.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-ink-200 bg-white p-5"
            >
              <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                {t.label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
                {t.value}
              </dd>
              <p className="mt-1 text-sm text-ink-500">{t.note}</p>
            </div>
          ))}
        </dl>
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
                  <span className="text-4xl font-bold tracking-tight text-brand-100">
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
            {[
              {
                Icon: Wallet,
                title: "Work that was never requested",
                body: "An employer approaching you directly, off-platform, was never a Findtern placement request.",
              },
              {
                Icon: Clock,
                title: "Anything under 160 hours",
                body: "A three-week engagement is not a placement under the Skilled and Assured bands, however good it went.",
              },
              {
                Icon: Lock,
                title: "A score you never completed",
                body: "The clock only starts when the assessment is scored. An unscored profile is not under guarantee.",
              },
            ].map(({ Icon, title, body }) => (
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
            ))}
          </ul>
        </div>
      </PageSection>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <PageSection>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
              Guarantee questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              The edge cases, answered directly.
            </p>
            <div className="mt-8 flex items-baseline gap-3">
              <p className="text-5xl font-bold tracking-tight text-primary">
                <CountUp value={DEPOSIT} prefix="₹" />
              </p>
              <p className="text-sm text-ink-500">
                refundable, held
                <br />
                until you are placed
              </p>
            </div>
          </div>
          <FaqExplorer items={FAQS} showSearch={false} showChips={false} />
        </div>
      </PageSection>
    </>
  );
}
