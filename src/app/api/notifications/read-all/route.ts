import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** Mark every unread notification for the caller as read. */export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const db = getDb();
  const recipientType = session.role === "employer" ? "employer" : "intern";

  await db
    .update(schema.notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.recipientType, recipientType),
        eq(schema.notifications.recipientId, session.uid),
        isNull(schema.notifications.readAt),
      ),
    );

  return NextResponse.json({ ok: true });
}
