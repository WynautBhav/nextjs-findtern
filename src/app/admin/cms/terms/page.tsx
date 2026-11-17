import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { allows } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { LegalTabs } from "@/components/admin/legal-tabs";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { platformTerms } from "@/lib/content/legal";
import { getPricingConfig } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "Platform Terms | Admin",
  description: "Edit the general Terms & Conditions page content.",
};

export default async function AdminPlatformTermsPage() {
  const session = await getSession();
  const canWrite = allows(session?.permissions, ["cms:write"]);
  const config = await getPricingConfig(); // the built-in text quotes the live prices
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Website terms"
      />
      <LegalTabs current="/admin/cms/terms" />

      <LegalDocEditor
        title="Terms and Conditions"
        description="This content is shown at /terms-and-conditions."
        documentKey="platform_terms"
        initialContent={platformTerms(config).html}
        readOnly={!canWrite}
        apiEndpoint="/api/admin/website/terms"
        publicHref="/terms-and-conditions"
      />
    </div>
  );
}
