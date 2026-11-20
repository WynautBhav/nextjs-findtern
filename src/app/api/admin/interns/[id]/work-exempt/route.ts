import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { NOTE_MAX } from "@/lib/moderation/work-exempt";
import { runDecideWork } from "@/lib/moderation/work-exempt-db";

const bodySchema = z.object({ decision: z.enum(["grant", "revoke", "keep_frozen"]), note: z.string().max(NOTE_MAX + 200) }).strict();

/**
 * Admin: decide whether a FROZEN intern with a running paid hire may keep working (timesheets, stipend view, notifications only).
 * The proxy's longest-prefix rule gives this interns:write; requireMutation adds CSRF, terms and "never while viewing as".
 * Repeating a choice that already took effect answers 200 `{ already: true }`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await runDecideWork({ internId: (await ctx.params).id, adminId: g.session.uid, decision: parsed.data.decision, note: parsed.data.note });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, effect: out.effect, already: out.effect === "none" });
}
