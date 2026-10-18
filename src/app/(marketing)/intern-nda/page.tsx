import type { Metadata } from "next";
import { LegalDocument } from "@/components/marketing/legal-document";
import { getInternNda } from "@/lib/content";

export const metadata: Metadata = {
  title: "Intern Non-Bypass Agreement",
  description:
    "What accepting a Findtern internship proposal commits you to: the binding acceptance, the non-joining penalty, routing full-time offers through Findtern, and keeping contact details on the platform.",
  alternates: { canonical: "/intern-nda" },
};

export default async function InternNdaPage() {
  const doc = await getInternNda();
  return (
    <LegalDocument
      title={doc.title}
      html={doc.html}
      updated={doc.updated}
      backHref="/intern-terms-and-conditions"
      backLabel="Intern terms"
    />
  );
}
