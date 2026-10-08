import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { EMPLOYER_TERMS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Company Terms and Conditions",
  description:
    "Terms for companies hiring through Findtern: eligibility, account use, internship and job postings, candidate interaction, fees and payments, data retention, and liability.",
  alternates: { canonical: "/employer-terms-and-conditions" },
};

export default function EmployerTermsPage() {
  return (
    <LegalDocument
      title={EMPLOYER_TERMS.title}
      html={EMPLOYER_TERMS.html}
      updated={EMPLOYER_TERMS.updated}
      backHref="/employers"
      backLabel="For employers"
    />
  );
}
