import { tickResponse, runTick } from "@/lib/cron-tick";
import { outboxCronOff } from "@/lib/outbox/cron-switch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly (vercel.json). Runs the jobs the in-process timers run on the KVM (table in src/lib/cron-tick.ts), because on Vercel
 * those timers are off. Same CRON_SECRET bearer check as the other cron routes (unset secret = closed) and the same
 * SCHEDULERS=off switch for a deployment on a copy of live data. Idempotent: safe to call any number of times.
 */
export async function GET(req: Request) {
  return tickResponse(req, {
    secret: process.env.CRON_SECRET,
    schedulers: process.env.SCHEDULERS,
    run: async () => {
      const [{ interviewReminders, notificationJobs }, { sweepProposalExpiry }, { runOutboxDrain }] = await Promise.all([
        import("@/lib/schedulers"),
        import("@/lib/proposal-expiry-db"),
        import("@/lib/outbox/run"),
      ]);
      return runTick({
        reminders: interviewReminders,
        notifications: notificationJobs,
        expiry: () => sweepProposalExpiry(),
        outbox: () => runOutboxDrain({ budgetMs: 15_000 }),
        outboxOff: outboxCronOff(),
        now: new Date(),
      });
    },
  });
}
