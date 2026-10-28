import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { LegalTabs } from "@/components/admin/legal-tabs";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { PLATFORM_TERMS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Platform Terms | Admin",
  description: "Edit the general Terms & Conditions page content.",
};

export default function AdminPlatformTermsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website terms"
        subtitle="Edit the general Terms & Conditions that apply to everyone. Employer and intern specifics live in their own documents."
      />
      <LegalTabs current="/admin/cms/terms" />

      <LegalDocEditor
        title="Terms and Conditions"
        description="This content is shown at /terms-and-conditions."
        documentKey="platform_terms"
        initialContent={PLATFORM_TERMS.html}
        apiEndpoint="/api/admin/website/terms"
        publicHref="/terms-and-conditions"
      />
    </div>
  );
}
