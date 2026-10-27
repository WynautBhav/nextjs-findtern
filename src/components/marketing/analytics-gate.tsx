"use client";

import { usePathname } from "next/navigation";

import { Analytics } from "@/components/marketing/analytics";

/**
 * Where the trackers (GA4, GTM, Meta Pixel) run.
 *
 * Decided 27 Oct (SYS-04, bug sheet 7 parity): on the signed-in intern and
 * employer pages too, as on the legacy site, so the conversion events that
 * fire there (signup complete, onboarding done, payment success) still reach
 * GTM and the Pixel. The scripts load `afterInteractive`, so a network that
 * blocks googletagmanager.com delays nothing on the page.
 *
 * The admin workspace is the one exception: staff traffic is not marketing
 * traffic, and counting it skews every report the trackers feed.
 */
export function AnalyticsGate() {
  const path = usePathname() ?? "/";
  const inAdmin = path === "/admin" || path.startsWith("/admin/");
  return inAdmin ? null : <Analytics />;
}
