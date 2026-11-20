import { outboxCronOff } from "./cron-switch.ts";
import { redactError } from "./index.ts";
import { runOutboxDrain } from "./run.ts";

export const DRAIN_NOW_BUDGET_MS = 20_000;

/** Same kill switches as /api/cron/email-outbox: SCHEDULERS=off (a copy of live data must not send) and OUTBOX_CRON=off. MAIL_MODE is handled by the mailer. */
export function shouldDrainNow(env: Record<string, string | undefined> = process.env): boolean {
  return env.SCHEDULERS !== "off" && !outboxCronOff(env);
}

type Deps = { schedule: (fn: () => Promise<void>) => void; env?: Record<string, string | undefined>; drain?: (o: { budgetMs: number }) => Promise<unknown>; log?: (...a: unknown[]) => void };

/**
 * After mail was queued, send it now instead of waiting for the daily cron (Vercel Hobby, and the 30 s in-process timer is a no-op there).
 * `d.schedule` is Next's `after()` (see drain-after.ts), so the admin response is not delayed. No-op when nothing was queued or a kill switch is on. Never throws; errors are
 * logged redacted (no addresses or codes).
 */
export function drainNowIfQueued(queued: number, d: Deps): boolean {
  if (!(queued > 0) || !shouldDrainNow(d.env)) return false;
  const log = d.log ?? console.error;
  const drain = d.drain ?? runOutboxDrain;
  try {
    d.schedule(async () => {
      try {
        await drain({ budgetMs: DRAIN_NOW_BUDGET_MS });
      } catch (e) {
        log("[outbox:drain-now]", redactError(e));
      }
    });
    return true;
  } catch (e) {
    log("[outbox:drain-now] could not schedule", redactError(e));
    return false;
  }
}
