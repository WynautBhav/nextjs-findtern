"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function SettingsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Settings" />
      <LoadError what="your settings" error={error} onRetry={retry} />
    </div>
  );
}
