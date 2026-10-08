import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { FaqExplorer } from "@/components/marketing/faq-explorer";
import { FAQ_INTERN, FAQ_EMPLOYER } from "@/lib/content/faq";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    `${FAQ_INTERN.length + FAQ_EMPLOYER.length} answers on screening, scoring, the rate card, the guarantee, timesheets and payment — split by whether you are hiring or looking.`,
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title={
          <>
            {FAQ_INTERN.length + FAQ_EMPLOYER.length} answers,{" "}
            <span className="text-primary">no asterisks</span>.
          </>
        }
        lead="Split by whether you are hiring or looking for an internship, because the questions are genuinely different. Every one is a real question from the CMS, not a curated selection."
      >
        <ButtonLink href="/contact" variant="primary" size="lg">
          Ask something else
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </PageHero>

      <PageSection>
        <h2 className="text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
          For interns
        </h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Assessment, scoring, fees and the guarantee.
        </p>
        <div className="mt-10">
          <FaqExplorer items={FAQ_INTERN} />
        </div>
      </PageSection>

      <PageSection tone="muted">
        <h2 className="text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl">
          For employers
        </h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Screening, hiring, timesheets and payment.
        </p>
        <div className="mt-10">
          <FaqExplorer items={FAQ_EMPLOYER} />
        </div>
      </PageSection>

      <PageSection className="text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-3xl">
          Answered here and it still did not help?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Email {SITE.email} and a human answers. We would rather fix a
          confusing page than route around it.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/contact" variant="primary" size="lg">
            Contact us
          </ButtonLink>
          <ButtonLink href="/terms-and-conditions" variant="outline" size="lg">
            Read the terms
          </ButtonLink>
        </div>
      </PageSection>
    </>
  );
}
