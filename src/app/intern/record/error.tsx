"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function RecordError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Your record" />
      <LoadError what="your record" error={error} onRetry={retry} />
    </div>
  );
}
