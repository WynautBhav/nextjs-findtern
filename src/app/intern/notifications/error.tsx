"use client";

import { LoadError } from "@/components/app/load-error";
import { PageHead } from "@/components/app/primitives";

export default function NotificationsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div>
      <PageHead title="Notifications" />
      <LoadError what="your notifications" error={error} onRetry={retry} />
    </div>
  );
}
