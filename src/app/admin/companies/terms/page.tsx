import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { EMPLOYER_TERMS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Company Terms | Admin",
  description: "Edit the Company/Employer Terms & Conditions page content.",
};

export default function AdminCompanyTermsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Company Terms"
        subtitle="Edit the Company/Employer Terms & Conditions page content."
      />

      <LegalDocEditor
        title="Company Terms and Conditions"
        description="This content is shown on the employer signup Terms link."
        documentKey="company_terms"
        initialContent={EMPLOYER_TERMS.html}
        apiEndpoint="/api/admin/company/terms"
      />
    </div>
  );
}
