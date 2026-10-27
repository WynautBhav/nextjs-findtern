"use client";

import { InternRouteError } from "@/components/intern/route-error";

export default function InterviewsError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  return <InternRouteError title="Interviews" what="your interviews" error={error} retry={retry} />;
}
