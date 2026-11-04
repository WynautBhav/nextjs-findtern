import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { allows } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { LegalTabs } from "@/components/admin/legal-tabs";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { INTERN_TERMS } from "@/lib/content/legal-intern";

export const metadata: Metadata = {
  title: "Intern Terms & Conditions | Admin",
  description: "Manage Intern Terms and Conditions for Findtern candidates.",
};

export default async function AdminInternTermsPage() {
  const session = await getSession();
  const canWrite = allows(session?.permissions, ["cms:write", "interns:write"]);
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Intern terms"
      />
      <LegalTabs current="/admin/interns/terms" />

      <LegalDocEditor
        title="Intern Terms and Conditions"
        description="This content is shown on the intern signup Terms link."
        documentKey="intern_terms"
        initialContent={INTERN_TERMS.html}
        readOnly={!canWrite}
        apiEndpoint="/api/admin/intern/terms"
        publicHref="/intern-terms-and-conditions"
      />
    </div>
  );
}
