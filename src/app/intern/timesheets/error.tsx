"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function TimesheetsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Timesheets" />
      <LoadError what="your timesheets" error={error} onRetry={retry} />
    </div>
  );
}
