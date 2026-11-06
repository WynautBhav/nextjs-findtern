"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function OffersError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Your offers" />
      <LoadError what="your offers" error={error} onRetry={retry} />
    </div>
  );
}
