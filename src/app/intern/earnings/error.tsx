"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function EarningsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Your stipend" />
      <LoadError what="your stipend" error={error} onRetry={retry} />
    </div>
  );
}
