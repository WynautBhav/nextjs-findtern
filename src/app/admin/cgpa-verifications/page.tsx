import { ClipboardCheck } from "lucide-react";

import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";

export const metadata = { title: "CGPA checks · Admin" };
export const dynamic = "force-dynamic";

/** Placeholder until the CGPA verification queue lands in this release; that package replaces this page entirely. */
export default function AdminCgpaVerificationsPage() {
  return (
    <div className="container-page section-y">
      <AdminPageHeader title="CGPA checks" subtitle="Candidates who entered a semester score that Findtern confirms before an employer pays." />
      <Panel>
        <AdminEmpty icon={ClipboardCheck} title="Coming together in this release" body="The verification queue is not switched on yet. Nothing is waiting for you here." />
      </Panel>
    </div>
  );
}
