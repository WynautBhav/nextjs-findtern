import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { allows } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";

/** Legacy buckets: "intern" queries vs everything else (employers / hiring). */
function bucketOf(queryType: string | null): "intern" | "employer" {
  return String(queryType ?? "").trim().toLowerCase() === "intern" ? "intern" : "employer";
}

/**
 * The messages, or a response: 404 if any is missing, 403 if the caller's
 * role doesn't handle one of their buckets. All or nothing, so a bulk action
 * never half-applies.
 */
async function loadForWrite(ids: string[], permissions: string[] | undefined) {
  const found = await getDb()
    .select({ id: schema.contactMessages.id, queryType: schema.contactMessages.queryType })
    .from(schema.contactMessages)
    .where(inArray(schema.contactMessages.id, ids));
  if (found.length !== ids.length) {
    return { response: NextResponse.json({ error: ids.length === 1 ? "Message not found" : "Some messages no longer exist. Refresh and try again." }, { status: 404 }) };
  }
  for (const message of found) {
    const needed = bucketOf(message.queryType) === "intern" ? "contact:intern:write" : "contact:employer:write";
    if (!allows(permissions, [needed])) {
      return { response: NextResponse.json({ error: "Your role doesn't handle some of these messages" }, { status: 403 }) };
    }
  }
  return { ids };
}

/** One id (`id`) or a bulk selection (`ids`, legacy bulk read / delete). */
const idsSchema = z.union([
  z.object({ id: z.string().min(1) }).transform((v) => [v.id]),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).transform((v) => [...new Set(v.ids)]),
]);

function parseIds(body: unknown) {
  const parsed = idsSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const ids = parseIds(body);
  const isRead = z.boolean().safeParse((body as { isRead?: unknown } | null)?.isRead);
  if (!ids || !isRead.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const found = await loadForWrite(ids, guard.session.permissions);
  if (found.response) return found.response;
  await getDb()
    .update(schema.contactMessages)
    .set({ isRead: isRead.data })
    .where(inArray(schema.contactMessages.id, ids));

  return NextResponse.json({ ok: true, updated: ids.length });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const ids = parseIds(await req.json().catch(() => null));
  if (!ids) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const found = await loadForWrite(ids, guard.session.permissions);
  if (found.response) return found.response;
  await getDb().delete(schema.contactMessages).where(inArray(schema.contactMessages.id, ids));

  return NextResponse.json({ ok: true, deleted: ids.length });
}
