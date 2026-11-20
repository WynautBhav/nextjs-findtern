import { NextResponse } from "next/server";
import { z } from "zod";

import { runAccountAction } from "./standing-db";
import { EVIDENCE_MAX, type StrikeSubject } from "./strikes";

const bodySchema = z.object({
  action: z.enum(["violation", "freeze", "unfreeze"]),
  reason: z.string().min(1).max(64),
  evidenceNote: z.string().max(EVIDENCE_MAX + 200),
  expectedViolations: z.number().int().min(0).max(1000).optional(),
}).strict();

/**
 * Shared body (after the route's own requireMutation) of POST /api/admin/interns/[id]/standing and /api/admin/companies/[id]/standing (the proxy's longest-prefix
 * rules give them interns:write and companies:write). Admin only, CSRF + terms via requireMutation, never while viewing as.
 * Repeating a click that already took effect answers 200 `{ already: true }` and changes nothing.
 */
export async function postStanding(req: Request, adminId: string, type: StrikeSubject, id: string): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await runAccountAction({
    subject: { type, id },
    adminId,
    action: parsed.data.action,
    reason: parsed.data.reason,
    evidenceNote: parsed.data.evidenceNote,
    expectedViolations: parsed.data.expectedViolations ?? (parsed.data.action === "unfreeze" ? 0 : undefined),
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, effect: out.effect, already: out.effect === "none", why: out.effect === "none" ? out.why : undefined, standing: out.standing });
}
