import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { ensureThread, messageErrorResponse } from "@/lib/messages";

const bodySchema = z.object({ proposalId: z.string().min(1).max(80) });

/** Open (or reuse) the one thread for this employer–intern pair, from a proposal of theirs. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing proposal." }, { status: 400 });
  try {
    const { threadId, created } = await ensureThread({ role: guard.session.role as "employer" | "intern", id: guard.session.uid }, parsed.data.proposalId);
    return NextResponse.json({ threadId }, { status: created ? 201 : 200 });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
