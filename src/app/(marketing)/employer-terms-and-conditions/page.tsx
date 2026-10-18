import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { getEmployerTerms } from "@/lib/content";

export const metadata: Metadata = {
  title: "Company Terms and Conditions",
  description:
    "Terms for companies hiring through Findtern: eligibility, account use, internship and job postings, candidate interaction, fees and payments, data retention, and liability.",
  alternates: { canonical: "/employer-terms-and-conditions" },
};

export default async function EmployerTermsPage() {
  const doc = await getEmployerTerms();
  return (
    <LegalDocument
      title={doc.title}
      html={doc.html}
      updated={doc.updated}
      backHref="/employers"
      backLabel="For employers"
    />
  );
}
