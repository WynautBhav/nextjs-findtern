import { cronAuthorized } from "./cron-auth.ts";

/**
 * The hourly cron tick: runs, on Vercel, the jobs the in-process timers (src/lib/schedulers.ts) run on the KVM.
 *
 *   in-process timer            cadence    tick step      notes
 *   interview reminders         5 min      reminders      24h/12h/1h windows; the copy states the real time left, so an hourly cadence only delays a reminder
 *   notification jobs (8)       6 h        notifications  runs when the UTC hour is a multiple of 6; every job dedupes per day/week/month key
 *   offer expiry sweep          1 h        expiry         same sweep as /api/cron/proposal-expiry
 *   email outbox drain          30 s       outbox         bounded drain (50-row batches, 30 s budget); OUTBOX_CRON=off skips it
 *
 * Every step is idempotent (dedupe keys, FOR UPDATE SKIP LOCKED, status-guarded sweeps), so a retried or overlapping tick
 * cannot double-send. A step that throws is reported and the next step still runs. Steps stop starting once the budget is spent.
 */
export type StepResult = "ok" | "skipped" | "failed" | "out-of-budget";
export type TickResult = Record<"reminders" | "notifications" | "expiry" | "outbox", StepResult>;

export type TickDeps = {
  reminders: () => Promise<unknown>;
  notifications: (now: Date) => Promise<unknown>;
  expiry: () => Promise<unknown>;
  outbox: () => Promise<unknown>;
  outboxOff: boolean;
  now: Date;
  clock?: () => number;
  budgetMs?: number;
};

export const TICK_BUDGET_MS = 40_000;
export const NOTIFICATION_HOUR_STEP = 6;

/** The 6-hourly notification jobs run on the ticks at 00, 06, 12 and 18 UTC. */
export function notificationsDue(now: Date): boolean {
  return now.getUTCHours() % NOTIFICATION_HOUR_STEP === 0;
}

export async function runTick(d: TickDeps): Promise<TickResult> {
  const clock = d.clock ?? Date.now;
  const started = clock();
  const budget = d.budgetMs ?? TICK_BUDGET_MS;
  const out: TickResult = { reminders: "skipped", notifications: "skipped", expiry: "skipped", outbox: "skipped" };
  const step = async (name: keyof TickResult, due: boolean, fn: () => Promise<unknown>) => {
    if (!due) return;
    if (clock() - started >= budget) {
      out[name] = "out-of-budget";
      return;
    }
    try {
      await fn();
      out[name] = "ok";
    } catch (e) {
      out[name] = "failed";
      console.error(`[cron:tick] ${name} failed`, e instanceof Error ? e.message : "error");
    }
  };
  await step("reminders", true, d.reminders);
  await step("expiry", true, d.expiry);
  await step("notifications", notificationsDue(d.now), () => d.notifications(d.now));
  await step("outbox", !d.outboxOff, d.outbox);
  return out;
}

/**
 * The route's logic, apart from the route file so it is tested without a database: 401 unless the bearer secret matches
 * (an unset secret closes the route), skipped when SCHEDULERS=off, otherwise one idempotent tick.
 */
export async function tickResponse(
  req: Pick<Request, "headers">,
  deps: { secret: string | undefined; schedulers: string | undefined; run: () => Promise<TickResult> },
): Promise<Response> {
  if (!cronAuthorized(req, deps.secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (deps.schedulers === "off") return Response.json({ skipped: true, reason: "SCHEDULERS is off" });
  return Response.json(await deps.run());
}
