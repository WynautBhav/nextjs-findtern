import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { getPlatformTerms } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "The full Findtern platform terms: eligibility, account registration, services for interns and employers, user responsibilities, payments, and dispute resolution.",
  alternates: { canonical: "/terms-and-conditions" },
};

export default async function TermsPage() {
  const doc = await getPlatformTerms();
  return (
    <LegalDocument
      title={doc.title}
      html={doc.html}
      updated={doc.updated}
      backHref="/"
      backLabel="Home"
    />
  );
}
