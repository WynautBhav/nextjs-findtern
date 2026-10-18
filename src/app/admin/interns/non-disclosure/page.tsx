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
        title="Non-Disclosure Clauses"
        subtitle="Manage the Non-Disclosure of Contact Information clauses shown for interns."
      />

      <LegalDocEditor
        title="Findtern Internship Acceptance, Compliance & Non-Bypass Agreement"
        description="This content is shown on the intern Non-Disclosure link."
        documentKey="intern_nda"
        initialContent={INTERN_NDA.html}
        apiEndpoint="/api/admin/ndc-clauses"
      />
    </div>
  );
}
