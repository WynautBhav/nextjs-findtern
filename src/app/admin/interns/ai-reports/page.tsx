import type { Metadata } from "next";

import { AiReportBatch } from "@/components/admin/ai-report-batch";
import { AdminPageHeader } from "@/components/admin/panel";
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
      <AiReportBatch drive={await driveStatus()} />
    </div>
  );
}
