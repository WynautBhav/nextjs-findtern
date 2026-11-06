import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { markRead, messageErrorResponse } from "@/lib/messages";

/** I have read this thread: stamps my last-read time and clears its message alerts. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  try {
    await markRead({ role: guard.session.role as "employer" | "intern", id: guard.session.uid }, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
