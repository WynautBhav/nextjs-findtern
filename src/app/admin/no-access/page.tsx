import Link from "next/link";

export default function NoAccess() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold text-ink-900">Your role can&apos;t open this page</h1>
      <p className="mt-2 text-sm text-text-subtle">Ask a super admin to add the permission to your role.</p>
      <Link href="/admin/dashboard" className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
