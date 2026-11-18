import { NextResponse } from "next/server";

import { RateLimiter, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { MAX_REPORT_BYTES, summariseCspReport } from "@/lib/security/csp-report";

/**
 * Where browsers send Content-Security-Policy violation reports (the policy's
 * `report-uri`). Public by design: the browser posts it without cookies or a
 * CSRF token, so it cannot go through requireMutation. It changes nothing and
 * stores nothing: it writes at most a few short, sanitised log lines and answers
 * 204 (also when over the limit), with a small body cap and a per-address rate limit so it cannot be used
 * to fill the logs.
 */
// A page load can raise a dozen violations at once (every blocked analytics script, inline style
// and font), and every console page does. 300 a minute per address keeps that burst whole; past it
// the report is dropped without being logged. Over-limit answers 204 too: a 429 is shown in the
// browser console as a failed request on every page, and the sender cannot act on it anyway.
const limiter = new RateLimiter(300, 60_000);

export async function POST(req: Request) {
  if (!limiter.take(bucketKey(clientIp(req.headers)))) return new NextResponse(null, { status: 204 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  const raw = await req.text().catch(() => "");
  for (const line of summariseCspReport(raw)) console.warn(line);
  return new NextResponse(null, { status: 204 });
}
