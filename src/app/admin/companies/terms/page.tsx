import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { LegalTabs } from "@/components/admin/legal-tabs";
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
        title="Company terms"
        subtitle="Edit the Company/Employer Terms & Conditions page content."
      />
      <LegalTabs current="/admin/companies/terms" />

      <LegalDocEditor
        title="Company Terms and Conditions"
        description="This content is shown on the employer signup Terms link."
        documentKey="company_terms"
        initialContent={EMPLOYER_TERMS.html}
        apiEndpoint="/api/admin/company/terms"
        publicHref="/employer-terms-and-conditions"
      />
    </div>
  );
}
