import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { tryPublicOrigin } from "@/lib/origin";
import { planTakedown } from "./takedown";

/**
 * Shared by the takedown and restore routes. One transaction holds the row lock, the update and
 * the audit row, so a takedown is never half-recorded. The employer notification runs after the
 * commit and can only cost the notification, never turn the saved decision into a 500.
 */
export async function applyTakedown(input: {
  projectId: string;
  adminId: string;
  action: "takedown" | "restore";
  reason?: string;
}): Promise<NextResponse> {
  const db = getDb();
  const out = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        employerId: schema.projects.employerId,
        takenDownAt: schema.projects.takenDownAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, input.projectId))
      .for("update")
      .limit(1);
    if (!project) return { kind: "missing" as const };

    const plan = planTakedown({ project, action: input.action, adminId: input.adminId, reason: input.reason });
    if (!plan.ok) return { kind: "refused" as const, plan };
    if (plan.noop) return { kind: "noop" as const, down: Boolean(project.takenDownAt) };

    await tx.update(schema.projects).set({ ...plan.set, updatedAt: new Date() }).where(eq(schema.projects.id, input.projectId));
    // strict: if the audit row can't be written the takedown rolls back with it.
    await recordAdminAudit(tx, {
      adminId: input.adminId,
      action: input.action === "takedown" ? "project.takedown" : "project.restore",
      targetType: "project",
      targetId: input.projectId,
      meta: { projectName: project.projectName, ...(input.action === "takedown" ? { reason: plan.set.takenDownReason } : {}) },
    }, { strict: true });
    return { kind: "changed" as const, project, reason: plan.set.takenDownReason };
  });

  if (out.kind === "missing") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (out.kind === "refused") return NextResponse.json({ error: out.plan.error }, { status: out.plan.status });
  if (out.kind === "noop") return NextResponse.json({ ok: true, takenDown: out.down, unchanged: true });

  const down = input.action === "takedown";
  const name = out.project.projectName;
  const site = tryPublicOrigin();
  try {
    await notify({
      to: { type: "employer", id: out.project.employerId },
      type: down ? "project_taken_down" : "project_restored",
      title: down ? "Your internship was taken down" : "Your internship is back up",
      message: down ? `"${name}" was taken down by Findtern: ${out.reason}` : `"${name}" is visible to candidates again.`,
      data: { projectId: input.projectId },
      dedupeKey: `project-takedown:${input.projectId}:${input.action}:${Date.now()}`,
      email:
        site === null
          ? undefined
          : {
              subject: down ? `Your internship "${name}" was taken down` : `Your internship "${name}" is back up`,
              heading: down ? "Your internship was taken down" : "Your internship is back up",
              greeting: "Hello,",
              lines: down
                ? [`"${name}" was taken down by Findtern and is no longer visible to candidates.`, `Reason: ${out.reason}`, "Contact support if you think this is a mistake."]
                : [`"${name}" was restored and is visible to candidates again.`],
              status: down ? "Taken down" : "Restored",
              tone: down ? "wait" : "done",
              cta: { label: "Open your projects", url: `${site}/employer/projects` },
            },
    });
  } catch (err) {
    console.error("[admin/projects/takedown] notify failed", err);
  }
  return NextResponse.json({ ok: true, takenDown: down });
}
