import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { applyReviewAction, reviewBody } from "@/lib/meetings/review-action";

export const dynamic = "force-dynamic";

/**
 * Admin only: Dismiss / Warn / Freeze on one meeting review. requireMutation = CSRF + session + terms + the proxy's permission rule
 * (interns:write or companies:write); the party's own write permission is checked again inside. Never while viewing as someone.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const parsed = reviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await applyReviewAction({ transcriptId: (await ctx.params).id, adminId: g.session.uid, permissions: g.session.permissions, body: parsed.data });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, effect: out.effect, already: out.already, state: out.state, message: out.message });
}
