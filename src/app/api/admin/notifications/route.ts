import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  recipientType: z.enum(["intern", "employer"]),
  /** Explicit list, or `all: true` for every active account of that type. */
  recipientIds: z.array(z.string()).default([]),
  all: z.boolean().default(false),
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
  const ids = parsed.data.all
    ? (
        parsed.data.recipientType === "intern"
          ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isActive, true))
          : await db.select({ id: schema.employers.id }).from(schema.employers).where(eq(schema.employers.isActive, true))
      ).map((r) => r.id)
    : parsed.data.recipientIds;
  if (ids.length === 0) return NextResponse.json({ error: "No recipients" }, { status: 400 });
  // Same `custom` notifications the per-person send writes, in chunks.
  for (let i = 0; i < ids.length; i += 500) {
    await db.insert(schema.notifications).values(
      ids.slice(i, i + 500).map((id) => ({
      recipientType: parsed.data.recipientType,
      recipientId: id,
      type: parsed.data.type,
        title: parsed.data.title,
        message: parsed.data.message,
      })),
    );
  }
  return NextResponse.json({ ok: true, count: ids.length });
}
