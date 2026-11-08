import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`. An unset secret means the route is closed
 * (nothing, not even an empty header, matches). Constant-time compare on the whole header value.
 */
export function cronAuthorized(req: Pick<Request, "headers">, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
