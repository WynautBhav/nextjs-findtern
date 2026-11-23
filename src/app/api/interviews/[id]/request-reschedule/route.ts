import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { act } from "@/lib/meetings/service";

/**
 * Interns can no longer reschedule a meeting: only the company offers new times. The route stays so an old page or a direct
 * call gets an explicit 403 ("intern_reschedule_removed") from the meeting rules, and nothing is changed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req: req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const r = await act(id, "intern", guard.session.uid, { type: "request_reschedule" });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true });
}
