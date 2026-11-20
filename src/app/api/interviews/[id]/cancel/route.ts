import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { act } from "@/lib/meetings/service";
import { assertInterviewActionable } from "@/lib/projects/takedown-guard-server";
import { cancelBody } from "@/lib/meetings/route-input";

/** Either side cancels an open offer or a booked meeting that has not started, with a reason the other side is shown. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!guard.ok) return guard.response;
  const role = guard.session.role === "employer" ? "employer" : "intern";
  if (role === "intern") {
    const locked = await internLockResponse(guard.session);
    if (locked) return locked;
  }
  const parsed = cancelBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say why you are cancelling (a few words).", code: "reason_required" }, { status: 400 });
  // An employer on a taken-down listing may only view it; the intern side is never blocked from cancelling.
  if (role === "employer") {
    const td = await assertInterviewActionable(id, guard.session.uid);
    if (!td.ok) return td.response;
  }
  const r = await act(id, role, guard.session.uid, { type: "cancel", reason: parsed.data.reason });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true });
}
