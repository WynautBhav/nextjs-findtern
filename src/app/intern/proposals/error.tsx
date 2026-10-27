"use client";

import { InternRouteError } from "@/components/intern/route-error";

export default function OffersError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  return <InternRouteError title="Your offers" what="your offers" error={error} retry={retry} />;
}
