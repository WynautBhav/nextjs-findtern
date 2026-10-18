import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { INTERN_TERMS } from "@/lib/content/legal-intern";

export const metadata: Metadata = {
  title: "Intern Terms & Conditions | Admin",
  description: "Manage Intern Terms and Conditions for Findtern candidates.",
};

export default function AdminInternTermsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Intern Terms"
        subtitle="Edit the Intern Terms & Conditions page content."
      />

      <LegalDocEditor
        title="Intern Terms and Conditions"
        description="This content is shown on the intern signup Terms link."
        documentKey="intern_terms"
        initialContent={INTERN_TERMS.html}
        apiEndpoint="/api/admin/intern/terms"
      />
    </div>
  );
}
