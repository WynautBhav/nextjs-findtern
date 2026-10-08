import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  recipientType: z.enum(["intern", "employer"]),
  recipientIds: z.array(z.string()).min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.string().default("custom"),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  await db.insert(schema.notifications).values(
    parsed.data.recipientIds.map((id) => ({
      recipientType: parsed.data.recipientType,
      recipientId: id,
      type: parsed.data.type,
      title: parsed.data.title,
      message: parsed.data.message,
    })),
  );
  return NextResponse.json({ ok: true, count: parsed.data.recipientIds.length });
}
