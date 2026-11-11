import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { confirmImport, errorResponse } from "@/lib/drives/admin-db";
import { announceConfirmed } from "@/lib/drives/announce";
import { parseIdempotencyKey } from "@/lib/drives/admin-rules";

type Ctx = { params: Promise<{ id: string }> };

/** Confirm a preview in one transaction: link verified-email matches, queue phone+name suggestions, issue one code per student. Repeating returns the first result. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!parseIdempotencyKey(req.headers.get("idempotency-key")).ok) return NextResponse.json({ error: "Idempotency-Key must be 8 to 128 letters, digits or - _ . :" }, { status: 400 });
  try {
    const importId = (await ctx.params).id;
    const out = await confirmImport({ importId, adminId: g.session.uid });
    // A repeat of the same confirm returns the first result and tells no one twice.
    const told = out.replayed ? { notified: 0, codesQueued: 0 } : await announceConfirmed(importId, g.session.uid);
    return NextResponse.json({ ok: true, replayed: out.replayed, result: out.result, ...told });
  } catch (e) {
    return errorResponse(e);
  }
}
