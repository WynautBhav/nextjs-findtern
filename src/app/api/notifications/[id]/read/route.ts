import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Mark one notification read.
 *
 * Ownership is checked against `recipientId`, not just "is there a session" -
 * the legacy `/api/notifications/:id/read` read the id straight off the URL
 * with no check at all, so any authenticated user could mark anyone's
 * notification read by guessing a uuid.
 */export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await ctx.params;
  const db = getDb();

  const [row] = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mine = session.role === "admin" || row.recipientId === session.uid;
  if (!mine) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .update(schema.notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(schema.notifications.id, id));

  return NextResponse.json({ ok: true });
}
