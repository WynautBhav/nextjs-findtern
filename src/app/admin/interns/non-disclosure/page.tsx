import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { INTERN_NDA } from "@/lib/content/legal-intern";

export const metadata: Metadata = {
  title: "Non-Disclosure Clauses | Admin",
  description: "Manage the Non-Disclosure of Contact Information clauses shown for interns.",
};

export default function AdminInternNonDisclosurePage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Intern NDA"
        subtitle="The non-disclosure and non-bypass agreement interns accept with an offer. The first active clause is the live text, as on the legacy site."
      />

      <LegalDocEditor
        title="Findtern Internship Acceptance, Compliance & Non-Bypass Agreement"
        description="Shown at /intern-nda and linked from every offer."
        documentKey="intern_nda"
        initialContent={INTERN_NDA.html}
        apiEndpoint="/api/admin/ndc-clauses"
        publicHref="/intern-nda"
      />
    </div>
  );
}
