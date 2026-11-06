"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";
import { SITE } from "@/lib/content/site";

/** A failed read anywhere in the employer console lands here, inside the shell, not on a blank page. */
export default function EmployerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="This page could not load" />
      <LoadError what="this page" error={error} onRetry={retry} email={SITE.adminEmail} />
    </div>
  );
}
