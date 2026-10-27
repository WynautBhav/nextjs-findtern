import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { adminVisibilityExtra } from "@/lib/admin/visibility";

/**
 * Bulk-set intern directory visibility.
 *
 * `visibility` is an admin control: `hidden` removes an intern from the public
 * directory and employer search without touching the account, which is the
 * distinction from deactivating them (which blocks sign-in). Both exist because
 * they answer different questions.
 *
 * Legacy reads only `extraData.openToWork`, so the same write also mirrors
 * the hide there (DB-11, see `adminVisibilityExtra`).
 *
 * Auth comes from `requireMutation`, which bundles session + role + CSRF so a
 * handler cannot accidentally ship only the first two.
 */

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  visibility: z.enum(["live", "hidden"]),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Select at least one intern and choose live or hidden." },
      { status: 400 },
    );
  }

  const { ids, visibility } = parsed.data;
  const db = getDb();

  const updated = await db.transaction(async (tx) => {
    const users = await tx
      .update(schema.users)
      .set({ profileVisibility: visibility })
      // `inArray` on a validated, length-capped id list - no interpolation of
      // user input into SQL.
      .where(inArray(schema.users.id, ids))
      .returning({ id: schema.users.id });

    const rows = await tx
      .select({ id: schema.internOnboarding.id, extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(inArray(schema.internOnboarding.userId, ids));
    for (const row of rows) {
      const next = adminVisibilityExtra(row.extra as Record<string, unknown> | null, visibility);
      if (next) await tx.update(schema.internOnboarding).set({ extraData: next }).where(eq(schema.internOnboarding.id, row.id));
    }
    return users;
  });

  // A short id list can still name ids that do not exist. Reporting the count
  // rather than assuming success lets the UI tell the truth.
  if (updated.length !== ids.length) {
    return NextResponse.json({
      error: `Updated ${updated.length} of ${ids.length}. Some selected interns could not be found.`,
      updated: updated.length,
      requested: ids.length,
    });
  }

  return NextResponse.json({ ok: true, updated: updated.length });
}
