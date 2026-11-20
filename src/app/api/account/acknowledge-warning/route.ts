import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { runAcknowledge } from "@/lib/moderation/standing-db";

/** The person clicked Acknowledge on a warning notice. Records it on their own unacknowledged warnings; repeating is harmless. */
export async function POST(req: Request) {
  const g = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!g.ok) return g.response;
  const out = await runAcknowledge({ type: g.session.role as "intern" | "employer", id: g.session.uid });
  return NextResponse.json(out);
}
