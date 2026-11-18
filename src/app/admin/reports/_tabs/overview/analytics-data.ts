import { cache } from "react";

import { loadAnalytics } from "@/lib/admin/analytics-load";

/**
 * One analytics load per request, shared by the Rates and the Hiring detail sections (they are separate Suspense
 * boundaries and both need it; `loadAnalytics` reads whole tables, so it must not run twice). Keyed by the window's
 * epoch milliseconds because `cache` compares arguments by identity.
 */
export const loadAnalyticsOnce = cache((since: number | null, until: number | null) =>
  loadAnalytics({ since: since === null ? null : new Date(since), until: until === null ? null : new Date(until) }),
);
