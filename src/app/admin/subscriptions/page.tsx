import { BadgeCheck } from "lucide-react";

import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";

export const metadata = { title: "Subscriptions · Admin" };
export const dynamic = "force-dynamic";

/** Placeholder until employer subscriptions land in this release; that package replaces this page entirely. */
export default function AdminSubscriptionsPage() {
  return (
    <div className="container-page section-y">
      <AdminPageHeader title="Subscriptions" subtitle="Employers on a Findtern Pro subscription: who is active, who is expiring, and grants or revokes." />
      <Panel>
        <AdminEmpty icon={BadgeCheck} title="Coming together in this release" body="Employer subscriptions are not switched on yet. There is nothing to manage here." />
      </Panel>
    </div>
  );
}
