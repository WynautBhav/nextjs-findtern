import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { grantBodySchema, grantUntilProblem, istDayEnd } from "@/lib/subscription/grant";
import { changeOverride, employerExists } from "@/lib/subscription/override-db";

/**
 * Give a company Findtern Pro access until the end of an IST day, with a note. Stamps `grantedAt` (so a grant made after a
 * revoke wins), audits `subscription.granted`, moves no money. The same grant again is a no-op. Needs transactions:write.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = grantBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const until = istDayEnd(parsed.data.until);
  const problem = grantUntilProblem(until, new Date());
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!(await employerExists(parsed.data.employerId))) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const result = await changeOverride(parsed.data.employerId, guard.session.uid, { kind: "grant", until: until!, note: parsed.data.note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, unchanged: !result.changed });
}
