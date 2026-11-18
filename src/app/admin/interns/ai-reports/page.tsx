import type { Metadata } from "next";

import { AiReportBatch } from "@/components/admin/ai-report-batch";
import { AdminPageHeader } from "@/components/admin/panel";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { driveStatus } from "@/lib/google-drive";

export const metadata: Metadata = {
  title: "AI reports | Admin",
};

export default async function AdminAiReportsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="AI interview reports"
        subtitle="Drop the Incruiter feedback PDFs. They are matched to candidates, the personal details are blurred, and the result is saved to Drive and attached as the candidate's Feedback report."
      />
      {canWrite((await getSession())?.permissions, "/api/admin/ai-reports") ? (
        <AiReportBatch drive={await driveStatus()} />
      ) : (
        <p className="text-sm text-text-subtle">Uploading reports needs the Edit candidates permission.</p>
      )}
    </div>
  );
}
