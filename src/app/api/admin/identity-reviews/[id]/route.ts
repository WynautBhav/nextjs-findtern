import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { decideReview, errorResponse } from "@/lib/drives/admin-db";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ decision: z.enum(["link", "reject"]), internId: z.string().min(1).max(64).optional() });

/** An admin decides a phone+name suggestion. Only a student listed in the review can be linked; nothing links without this call. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Decision must be link or reject." }, { status: 400 });
  try {
    const out = await decideReview({ reviewId: (await ctx.params).id, decision: parsed.data.decision, internId: parsed.data.internId, adminId: g.session.uid });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e);
  }
}
