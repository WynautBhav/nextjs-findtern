import { after } from "next/server";

import { claimSweepWindow, SWEEP_WINDOW_MS, sweepProposalExpiry } from "@/lib/proposal-expiry-db";
import { createSweepThrottle } from "@/lib/proposal-expiry-throttle";

/**
 * Opportunistic expiry: Vercel Cron needs an owner-set CRON_SECRET and the in-process timer needs a long-lived server, so on a
 * serverless deploy either can silently never run. A busy authenticated page (employer proposals / dashboard, admin proposal
 * tracker) calls this instead. It never blocks the page: the work is queued with `after()`, which runs once the response is
 * sent. Guards, cheapest first: SCHEDULERS=off (a copy of live data must not sweep or notify) -> an in-memory throttle (one run per
 * 10 minutes per instance) -> a database claim (one run per 10 minutes across all instances) -> the sweeps, each a bounded
 * statement set. Errors are logged, never thrown into the page.
 */
const throttle = createSweepThrottle(SWEEP_WINDOW_MS);

export function kickProposalExpiry(): void {
  if (process.env.SCHEDULERS === "off") return;
  if (!throttle.tryClaim()) return;
  try {
    after(async () => {
      try {
        if (!(await claimSweepWindow())) return; // another instance swept inside this window
        await sweepProposalExpiry();
      } catch (err) {
        throttle.release();
        console.error("[proposal-expiry] opportunistic sweep failed", err);
      }
    });
  } catch (err) {
    throttle.release();
    console.error("[proposal-expiry] could not queue the opportunistic sweep", err);
  }
}
