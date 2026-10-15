import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { INTERN_TERMS_PLACEHOLDER } from "@/lib/content/legal-placeholder";

export const metadata: Metadata = {
  title: "Intern Terms and Conditions",
  description:
    "Intern-specific terms. Not yet published in the content management system - the platform terms and the guarantee cover interns in the meantime.",
  alternates: { canonical: "/intern-terms-and-conditions" },
  // Nothing to index yet, and indexing an empty page is worse than not indexing.
  robots: { index: false, follow: true },
};

export default function InternTermsPage() {
  return (
    <LegalDocument
      title="Intern Terms and Conditions"
      html={INTERN_TERMS_PLACEHOLDER}
      backHref="/interns"
      backLabel="For interns"
    />
  );
}
