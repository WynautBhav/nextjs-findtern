import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Bulk-set intern account status.
 *
 * Deactivating blocks sign-in (`is_active` is checked by the session/login
 * path) but leaves the profile and history intact, so it is reversible. This
 * is deliberately separate from directory visibility, which only affects
 * discovery - mixing the two is how a platform ends up with active accounts
 * missing from search for no traceable reason.
 */

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  isActive: z.boolean(),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { ids: string[], isActive: boolean }" },
      { status: 400 },
    );
  }

  const { ids, isActive } = parsed.data;
  const db = getDb();

  const updated = await db
    .update(schema.users)
    .set({ isActive })
    .where(inArray(schema.users.id, ids))
    .returning({ id: schema.users.id });

  if (updated.length !== ids.length) {
    return NextResponse.json({
      error: `Updated ${updated.length} of ${ids.length}. Some ids did not match an intern.`,
      updated: updated.length,
      requested: ids.length,
    });
  }

  return NextResponse.json({ ok: true, updated: updated.length });
}
