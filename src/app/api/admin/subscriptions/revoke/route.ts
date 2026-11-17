import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { revokeBodySchema } from "@/lib/subscription/grant";
import { changeOverride, employerExists } from "@/lib/subscription/override-db";

/**
 * End a company's Findtern Pro access now, with a note. Payments made before this moment stop counting; no payment row is
 * touched and no money moves (a refund is a separate, deliberate action). Revoking an already revoked company is a no-op.
 * Audits `subscription.revoked`. Needs transactions:write.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = revokeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await employerExists(parsed.data.employerId))) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const result = await changeOverride(parsed.data.employerId, guard.session.uid, { kind: "revoke", note: parsed.data.note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, unchanged: !result.changed });
}
