import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { confirmImport, errorResponse } from "@/lib/drives/admin-db";
import { parseIdempotencyKey } from "@/lib/drives/admin-rules";

type Ctx = { params: Promise<{ id: string }> };

/** Confirm a preview in one transaction: link verified-email matches, queue phone+name suggestions, issue one code per student. Repeating returns the first result. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!parseIdempotencyKey(req.headers.get("idempotency-key")).ok) return NextResponse.json({ error: "Idempotency-Key must be 8 to 128 letters, digits or - _ . :" }, { status: 400 });
  try {
    const out = await confirmImport({ importId: (await ctx.params).id, adminId: g.session.uid });
    return NextResponse.json({ ok: true, replayed: out.replayed, result: out.result });
  } catch (e) {
    return errorResponse(e);
  }
}
