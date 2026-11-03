
import { Panel } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { ButtonLink } from "@/components/ui/button";

export default function NoAccess() {
  return (
    <Panel className="mx-auto mt-8 max-w-md">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <h1 className="text-balance text-xl font-semibold tracking-[-0.01em] text-foreground">Your role can&apos;t open this page</h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-text-subtle">Ask a super admin to add the permission to your role.</p>
        <ButtonLink href="/admin/dashboard" variant="primary" size="sm" className={`mt-6 ${ADMIN_PILL_PRIMARY}`}>
          Back to the dashboard
        </ButtonLink>
      </div>
    </Panel>
  );
}
