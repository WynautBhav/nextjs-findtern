import { desc, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { AUTO_NOTIFICATION_TYPES } from "@/lib/admin/notification-types";

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(notInArray(schema.notifications.type, AUTO_NOTIFICATION_TYPES))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return NextResponse.json({ notifications: rows });
}
