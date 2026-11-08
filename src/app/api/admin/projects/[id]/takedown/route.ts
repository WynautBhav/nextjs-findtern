import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { TAKEDOWN_REASON_MAX } from "@/lib/projects/takedown";
import { applyTakedown } from "@/lib/projects/takedown-apply";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(TAKEDOWN_REASON_MAX) }).strict();

/** Admin takes a listing down. Idempotent: an already-down listing answers 200 and changes nothing. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A takedown needs a reason (up to 500 characters)." }, { status: 400 });

  return applyTakedown({ projectId: id, adminId: guard.session.uid, action: "takedown", reason: parsed.data.reason });
}
