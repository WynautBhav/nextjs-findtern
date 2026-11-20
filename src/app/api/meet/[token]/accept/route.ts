import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { checkGateStart, DISCLAIMER_VERSION, gateSecret, ipHash } from "@/lib/meetings/gate";
import { hasAccepted, loadGateMeeting, recordAcceptance } from "@/lib/meetings/gate-service";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";
import { clientIp } from "@/lib/security/rate-limit";

/**
 * The person pressed "I understand and agree" at /meet/<token>. Records the acceptance of the current disclaimer version, but
 * only if the signed gate-open stamp from the page is at least MIN_ELAPSED_MS old (the countdown is a browser timer; this is
 * the server's own clock). Answers with the gate's join path, never the Meet URL. Stores a salted IP hash, never the address.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const role = guard.session.role as "employer" | "intern";
  const who = { role, uid: guard.session.uid };
  const db = getDb();
  const m = await loadGateMeeting(db, token, who);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (m.state === "closed") return NextResponse.json({ error: "This meeting can no longer be joined.", code: "closed" }, { status: 409 });
  if (m.state === "pending") return NextResponse.json({ error: "The meeting link is not ready yet. We will email you.", code: "pending" }, { status: 409 });
  // A taken-down project's meetings are not actionable for its employer.
  const td = await assertInterviewActionable(m.iv.id, role === "employer" ? guard.session.uid : undefined);
  if (!td.ok) return td.response;
  const next = `/api/meet/${encodeURIComponent(token)}/join`;
  if (await hasAccepted(db, m.iv.id, who)) return NextResponse.json({ ok: true, next });

  const body = (await req.json().catch(() => null)) as { stamp?: unknown } | null;
  const check = checkGateStart(gateSecret(), { token, ...who, version: DISCLAIMER_VERSION }, body?.stamp, Date.now());
  if (!check.ok) {
    if (check.reason === "too_early") return NextResponse.json({ error: "Please read the rules for the full countdown, then try again.", code: "too_early" }, { status: 409 });
    return NextResponse.json({ error: "This page was open too long. Reload it to start again.", code: "restart" }, { status: 410 });
  }
  await recordAcceptance(db, { interviewId: m.iv.id, who, ipHash: ipHash(gateSecret(), clientIp(req.headers)) });
  return NextResponse.json({ ok: true, next });
}
