"use client";

import { LoadError } from "@/components/intern/load-error";

export default function TimesheetsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LoadError title="Timesheets" what="your timesheets" error={error} retry={retry} />;
}
