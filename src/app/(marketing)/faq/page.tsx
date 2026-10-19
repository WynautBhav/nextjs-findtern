import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { FaqAudienceTabs } from "@/components/marketing/faq-audience-tabs";
import { getFaqItems } from "@/lib/content";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, webPageJsonLd } from "@/lib/seo";
import { EmailLink } from "@/components/marketing/email-link";

/** Admin-managed FAQs, split by audience. Anything not filed under
    Employer is treated as an intern question, so a mistyped category in the
    CMS still shows up rather than vanishing. */
async function getFaqsByAudience() {
  const items = await getFaqItems();
  const employer = items.filter((f) => f.category.trim().toLowerCase().startsWith("employer"));
  const intern = items.filter((f) => !employer.includes(f));
  return { intern, employer };
}

export async function generateMetadata(): Promise<Metadata> {
  const { intern, employer } = await getFaqsByAudience();
  return {
    title: "Internship FAQ for Employers and Interns",
    description: `${intern.length + employer.length} answers on intern screening, the Findtern Score, the rate card, the placement guarantee, timesheets and payment - split by whether you are hiring or looking.`,
    alternates: { canonical: "/faq" },
  };
}

export default async function FaqPage() {
  const [{ intern, employer }, metadata] = await Promise.all([getFaqsByAudience(), generateMetadata()]);
  return (
    <>
      <JsonLd
        data={[
          webPageJsonLd({ path: "/faq", name: "Findtern FAQ", description: String(metadata.description), type: "FAQPage" }),
          breadcrumbJsonLd([{ name: "FAQ", path: "/faq" }]),
          faqJsonLd([...employer, ...intern]),
        ]}
      />
      <PageHero
        eyebrow="FAQ"
        title={
          <>
            {intern.length + employer.length} answers,{" "}
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
        <FaqAudienceTabs intern={intern} employer={employer} />
      </PageSection>

      <PageSection className="text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-3xl">
          Answered here and it still did not help?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Email <EmailLink /> and a human answers. We would rather fix a
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
