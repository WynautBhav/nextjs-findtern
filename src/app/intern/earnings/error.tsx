"use client";

import { LoadError } from "@/components/intern/load-error";

export default function EarningsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LoadError title="Your stipend" what="your stipend" error={error} retry={retry} />;
}
