import { inArray } from "drizzle-orm";
import { inBatches, sendAccountNotice, shouldNotify } from "@/lib/account-notices";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin/audit";
import { forgetAccountStatus } from "@/lib/account-status";
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
      { error: "Select at least one intern and choose a status." },
      { status: 400 },
    );
  }

  const { ids, isActive } = parsed.data;
  const db = getDb();

  const prior = await db.select({ id: schema.users.id, was: schema.users.isActive, email: schema.users.email, firstName: schema.users.firstName }).from(schema.users).where(inArray(schema.users.id, ids));
  const updated = await db
    .update(schema.users)
    .set({ isActive })
    .where(inArray(schema.users.id, ids))
    .returning({ id: schema.users.id });
  ids.forEach((uid) => forgetAccountStatus("intern", uid));
  // Only accounts whose flag really flipped are mailed, a few at a time.
  const flipped = prior.filter((u) => shouldNotify(Boolean(u.was), isActive));
  let emailed = false;
  let emailFailed = false;
  await inBatches(flipped, 5, async (u) => {
    const r = await sendAccountNotice({ kind: "intern", active: isActive, name: "", to: [{ email: u.email, name: u.firstName }] });
    emailed ||= r.emailed;
    emailFailed ||= r.emailFailed;
  });
  await recordAdminAudit(db, {
    adminId: guard.session.uid,
    action: isActive ? "user.activate" : "user.deactivate",
    targetType: "intern",
    targetId: updated.length === 1 ? updated[0].id : null,
    meta: { count: updated.length, ids: updated.map((u) => u.id), bulk: true, notice: { recipients: flipped.length, emailed, emailFailed } },
  });

  if (updated.length !== ids.length) {
    return NextResponse.json({
      error: `Updated ${updated.length} of ${ids.length}. Some selected interns could not be found.`,
      updated: updated.length,
      requested: ids.length,
      emailed,
      emailFailed,
    });
  }

  return NextResponse.json({ ok: true, updated: updated.length, emailed, emailFailed });
}
