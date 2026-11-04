import { Metadata } from "next";

import { AdminPageHeader } from "@/components/admin/panel";
import { allows } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { LegalTabs } from "@/components/admin/legal-tabs";
import { LegalDocEditor } from "@/components/admin/legal-doc-editor";
import { INTERN_NDA } from "@/lib/content/legal-intern";

export const metadata: Metadata = {
  title: "Non-Disclosure Clauses | Admin",
  description: "Manage the Non-Disclosure of Contact Information clauses shown for interns.",
};

export default async function AdminInternNonDisclosurePage() {
  const session = await getSession();
  const canWrite = allows(session?.permissions, ["cms:write", "interns:write"]);
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Intern NDA"
        subtitle="The first active clause is the live text, as on the legacy site."
      />
      <LegalTabs current="/admin/interns/non-disclosure" />

      <LegalDocEditor
        title="Findtern Internship Acceptance, Compliance & Non-Bypass Agreement"
        description="Shown at /intern-nda and linked from every offer."
        documentKey="intern_nda"
        initialContent={INTERN_NDA.html}
        readOnly={!canWrite}
        apiEndpoint="/api/admin/ndc-clauses"
        publicHref="/intern-nda"
      />
    </div>
  );
}
