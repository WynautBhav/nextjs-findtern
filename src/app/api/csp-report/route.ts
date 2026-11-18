import { NextResponse } from "next/server";

import { RateLimiter, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { MAX_REPORT_BYTES, summariseCspReport } from "@/lib/security/csp-report";

/**
 * Where browsers send Content-Security-Policy violation reports (the policy's
 * `report-uri`). Public by design: the browser posts it without cookies or a
 * CSRF token, so it cannot go through requireMutation. It changes nothing and
 * stores nothing: it writes at most a few short, sanitised log lines and answers
 * 204, with a small body cap and a per-address rate limit so it cannot be used
 * to fill the logs.
 */
const limiter = new RateLimiter(60, 60_000);

export async function POST(req: Request) {
  if (!limiter.take(bucketKey(clientIp(req.headers)))) return new NextResponse(null, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  const raw = await req.text().catch(() => "");
  for (const line of summariseCspReport(raw)) console.warn(line);
  return new NextResponse(null, { status: 204 });
}
