"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function InterviewsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Interviews" />
      <LoadError what="your interviews" error={error} onRetry={retry} />
    </div>
  );
}
