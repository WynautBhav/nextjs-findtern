import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const patchSchema = z.object({
  id: z.string().min(1),
  isRead: z.boolean(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  await db
    .update(schema.contactMessages)
    .set({ isRead: parsed.data.isRead })
    .where(eq(schema.contactMessages.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  await db
    .delete(schema.contactMessages)
    .where(eq(schema.contactMessages.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
