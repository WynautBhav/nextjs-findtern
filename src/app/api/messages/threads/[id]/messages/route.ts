import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { MAX_BODY, messageErrorResponse, sendMessage } from "@/lib/messages";

const bodySchema = z.object({ body: z.string().trim().min(1).max(MAX_BODY), clientId: z.uuid() });

/** Send one message. A retry with the same clientId returns the first row (200). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Write a message of 1 to ${MAX_BODY} characters.` }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const { message, created } = await sendMessage({ role: guard.session.role as "employer" | "intern", id: guard.session.uid }, id, parsed.data);
    return NextResponse.json({ message }, { status: created ? 201 : 200 });
  } catch (err) {
    return messageErrorResponse(err);
  }
}
