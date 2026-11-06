import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("take_down"),
    reason: z.string({ error: "Give a reason for taking this listing down." }).trim().min(3, "Give a reason of at least 3 characters.").max(500, "Keep the reason under 500 characters."),
  }),
  z.object({ action: z.literal("restore") }),
]);

/**
 * Moderation (OA8): listings go live at once; an admin can take one down with
 * a reason, and restore it. The employer cannot reopen a taken-down listing.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  if (!allows(guard.session.permissions, ["companies:write"])) {
    return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  const p = schema.projects;

  const [project] = await db
    .select({ id: p.id, name: p.projectName, employerId: p.employerId, takenDownAt: p.takenDownAt })
    .from(p)
    .where(eq(p.id, id))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const down = parsed.data.action === "take_down";
  if (down && project.takenDownAt) return NextResponse.json({ error: "This listing is already taken down." }, { status: 409 });
  if (!down && !project.takenDownAt) return NextResponse.json({ error: "This listing is not taken down." }, { status: 409 });

  // The guard in the WHERE keeps two admins from both "winning".
  const changed = await db
    .update(p)
    .set(
      down
        ? { takenDownAt: new Date(), takenDownBy: guard.session.uid, takenDownReason: parsed.data.action === "take_down" ? parsed.data.reason : null, updatedAt: new Date() }
        : { takenDownAt: null, takenDownBy: null, takenDownReason: null, updatedAt: new Date() },
    )
    .where(and(eq(p.id, id), down ? isNull(p.takenDownAt) : isNotNull(p.takenDownAt)))
    .returning({ id: p.id });
  if (changed.length === 0) return NextResponse.json({ error: "Someone else just changed this listing. Refresh and try again." }, { status: 409 });

  await recordAdminAudit(db, {
    adminId: guard.session.uid,
    action: down ? "project.take_down" : "project.restore",
    targetType: "project",
    targetId: id,
    meta: { name: project.name, employerId: project.employerId, ...(parsed.data.action === "take_down" ? { reason: parsed.data.reason } : {}) },
  });

  // Best effort: the change is already done.
  try {
    await notify({
      to: { type: "employer", id: project.employerId },
      type: down ? "project_taken_down" : "project_restored",
      title: down ? "A listing was taken down" : "A listing is live again",
      message: down
        ? `Findtern took down "${project.name}": ${parsed.data.action === "take_down" ? parsed.data.reason : ""}. Contact support.`
        : `"${project.name}" was restored by Findtern.`,
      data: { projectId: id },
      dedupeKey: `project-${down ? "down" : "restored"}:${id}:${Date.now()}`,
    });
  } catch (err) {
    console.error("[projects] notify failed", err);
  }
  return NextResponse.json({ ok: true });
}
