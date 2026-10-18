import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { getInternTerms } from "@/lib/content";

export const metadata: Metadata = {
  title: "Intern Terms and Conditions",
  description:
    "Terms for candidates on Findtern: registration and verification, your data, platform rules, the registration fee and refund guarantee, and accepting proposals.",
  alternates: { canonical: "/intern-terms-and-conditions" },
};

export default async function InternTermsPage() {
  const doc = await getInternTerms();
  return (
    <LegalDocument
      title={doc.title}
      html={doc.html}
      updated={doc.updated}
      backHref="/interns"
      backLabel="For interns"
    />
  );
}
