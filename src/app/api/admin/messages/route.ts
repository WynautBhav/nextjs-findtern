import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { allows } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";

/** Legacy buckets: "intern" queries vs everything else (employers / hiring). */
function bucketOf(queryType: string | null): "intern" | "employer" {
  return String(queryType ?? "").trim().toLowerCase() === "intern" ? "intern" : "employer";
}

/** The message, or a response: 404 if missing, 403 if the caller can't handle that bucket. */
async function loadForWrite(id: string, permissions: string[] | undefined) {
  const [message] = await getDb()
    .select({ id: schema.contactMessages.id, queryType: schema.contactMessages.queryType })
    .from(schema.contactMessages)
    .where(eq(schema.contactMessages.id, id))
    .limit(1);
  if (!message) return { response: NextResponse.json({ error: "Message not found" }, { status: 404 }) };
  const needed = bucketOf(message.queryType) === "intern" ? "contact:intern:write" : "contact:employer:write";
  if (!allows(permissions, [needed])) {
    return { response: NextResponse.json({ error: "Your role doesn't handle these messages" }, { status: 403 }) };
  }
  return { message };
}

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

  const found = await loadForWrite(parsed.data.id, guard.session.permissions);
  if (found.response) return found.response;
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

  const found = await loadForWrite(parsed.data.id, guard.session.permissions);
  if (found.response) return found.response;
  const db = getDb();
  await db
    .delete(schema.contactMessages)
    .where(eq(schema.contactMessages.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
