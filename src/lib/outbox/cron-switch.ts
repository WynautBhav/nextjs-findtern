/** Kill switch for /api/cron/email-outbox: `OUTBOX_CRON=off` makes the route answer {skipped:true}. Default on. */
export function outboxCronOff(env: Record<string, string | undefined> = process.env): boolean {
  return env.OUTBOX_CRON?.trim().toLowerCase() === "off";
}
