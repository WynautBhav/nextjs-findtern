import { ButtonLink } from "@/components/ui/button";

export default function NoAccess() {
  return (
    <div className="max-w-xl border-t border-ink-200 pt-8">
      <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900">Your role can&apos;t open this page</h1>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-ink-700">
        The page exists, but your role doesn&apos;t include it. Ask a super admin to add the permission under Roles and access, then reload.
      </p>
      <ButtonLink href="/admin/dashboard" variant="primary" className="mt-6">
        Back to the dashboard
      </ButtonLink>
    </div>
  );
}
