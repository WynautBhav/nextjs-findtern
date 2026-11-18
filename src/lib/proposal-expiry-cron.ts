import { cronAuthorized } from "./cron-auth.ts";

/**
 * The cron route's logic, kept apart from the route file (which may export only route names) so it is unit tested without a
 * database: 401 unless the bearer secret matches (an unset secret closes the route), skipped when SCHEDULERS=off (a copy of
 * live data must neither sweep nor notify), otherwise one idempotent sweep. A sweep failure is logged, never echoed.
 */
export async function runExpiryCron<R extends object>(
  req: Pick<Request, "headers">,
  deps: { secret: string | undefined; schedulers: string | undefined; sweep: () => Promise<R> },
): Promise<Response> {
  if (!cronAuthorized(req, deps.secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (deps.schedulers === "off") return Response.json({ skipped: true, reason: "SCHEDULERS is off" });
  try {
    return Response.json(await deps.sweep());
  } catch (err) {
    console.error("[proposal-expiry] cron sweep failed", err);
    return Response.json({ error: "Sweep failed" }, { status: 500 });
  }
}
