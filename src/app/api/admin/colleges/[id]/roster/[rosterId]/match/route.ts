import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { ImportError, decideMatch } from "@/lib/college/roster-import";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("reject") }),
]);

/** Link a roster row to an account, or reject the suggested match. Audited. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; rosterId: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a student to link, or reject the match" }, { status: 400 });
  const { id, rosterId } = await ctx.params;
  try {
    const r = await decideMatch({ collegeId: id, rosterId, adminId: guard.session.uid, ...parsed.data });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
