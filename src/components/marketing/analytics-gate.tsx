"use client";

import { usePathname } from "next/navigation";

import { Analytics } from "@/components/marketing/analytics";

/**
 * Trackers belong on the public site and the sign-up/sign-in funnel, not on
 * the signed-in dashboards: there they only add three third-party requests to
 * every page, and on networks that silently drop googletagmanager.com
 * (common on office firewalls) each one hangs until it times out.
 */
const APP_PREFIXES = ["/admin", "/intern/", "/employer/"];
const FUNNEL = /^\/employer\/(login|signup|forgot-password|reset-password|verify-email)(\/|$)/;

export function AnalyticsGate() {
  const path = usePathname() ?? "/";
  const inApp = APP_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p)) && !FUNNEL.test(path);
  return inApp ? null : <Analytics />;
}
