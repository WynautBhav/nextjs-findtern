import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { applyTakedown } from "@/lib/projects/takedown-apply";

const bodySchema = z.object({}).strict();

/** Admin restores a taken-down listing: clears taken_down_*. Restoring a live listing is a no-op 200. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { id } = await params;

  // An empty body is fine; anything else is not.
  const text = await req.text().catch(() => "");
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!bodySchema.safeParse(body).success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  return applyTakedown({ projectId: id, adminId: guard.session.uid, action: "restore" });
}
