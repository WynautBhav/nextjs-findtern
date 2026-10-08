import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { PLATFORM_TERMS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "The full Findtern platform terms: eligibility, account registration, services for interns and employers, user responsibilities, payments, and dispute resolution.",
  alternates: { canonical: "/terms-and-conditions" },
};

export default function TermsPage() {
  return (
    <LegalDocument
      title={PLATFORM_TERMS.title}
      html={PLATFORM_TERMS.html}
      updated={PLATFORM_TERMS.updated}
      backHref="/"
      backLabel="Home"
    />
  );
}
