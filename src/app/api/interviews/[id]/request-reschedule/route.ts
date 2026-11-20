import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { internLockResponse } from "@/lib/intern-unlock";
import { act } from "@/lib/meetings/service";
import { rescheduleRequestBody } from "@/lib/meetings/route-input";

/**
 * The candidate asks to reschedule, with no times of their own (optional note, max 300 characters). The meeting goes back to
 * pending with no times, the booked Meet event is withdrawn, and the company is told to offer three new times.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const parsed = rescheduleRequestBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Keep the note under 300 characters." }, { status: 400 });
  const r = await act(id, "intern", guard.session.uid, { type: "request_reschedule", reason: parsed.data.reason });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ok: true });
}
