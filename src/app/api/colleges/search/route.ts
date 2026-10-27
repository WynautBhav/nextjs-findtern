import { NextResponse } from "next/server";

import { searchColleges } from "@/lib/college/membership";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

/** College picker. Public list (AISHE names are public data); throttled. */
export async function GET(req: Request) {
  if (!limiters.generic.take(bucketKey(clientIp(req.headers), "college-search"))) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const colleges = await searchColleges(q.slice(0, 80));
  return NextResponse.json({ colleges }, { headers: { "Cache-Control": "private, max-age=60" } });
}
