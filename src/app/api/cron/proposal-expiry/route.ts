import { runExpiryCron } from "@/lib/proposal-expiry-cron";
import { sweepProposalExpiry } from "@/lib/proposal-expiry-db";

export const dynamic = "force-dynamic";

/**
 * Daily backstop for the opportunistic and hourly sweeps (proposal-expiry-kick.ts, schedulers.ts): expires accepted offers that
 * were not paid before their start date and sent / interview-booked offers nobody answered before it. Vercel Cron calls GET
 * with the CRON_SECRET bearer header; an unset secret closes the route. A deployment on a copy of live data sets
 * SCHEDULERS=off and neither sweeps nor notifies. Safe to run any number of times (idempotent).
 */
export async function GET(req: Request) {
  return runExpiryCron(req, { secret: process.env.CRON_SECRET, schedulers: process.env.SCHEDULERS, sweep: () => sweepProposalExpiry() });
}
