import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { tryPublicOrigin } from "@/lib/origin";
import { planTakedown } from "./takedown";
import { lockOpenOfferRows, notifyWithdrawnOffers, withdrawOpenOffers } from "./takedown-withdraw";

/**
 * Shared by the takedown and restore routes. One transaction holds the row lock, the update, the
 * withdrawal of every open offer on the project and the audit rows, so a takedown is never
 * half-recorded and there is no window where the project is down but its offers are still open.
 * The notifications run after the commit and can only cost a notification, never turn the saved
 * decision into a 500.
 *
 * Restore does NOT revive the offers a takedown withdrew: they stay withdrawn and the employer
 * sends new ones.
 *
 * Taking down an already-down listing is a no-op (the row locks above are still taken first): it does
 * not sweep offers that slipped in afterwards, for example ones the legacy app created. Restore and
 * take down again to sweep those. Accepted offers with a checkout open are not withdrawn; they are
 * counted and audited (`skippedOffers`) and the admin withdraws them by hand once the checkout lapses.
 */
export async function applyTakedown(input: {
  projectId: string;
  adminId: string;
  action: "takedown" | "restore";
  reason?: string;
}): Promise<NextResponse> {
  const db = getDb();
  const out = await db.transaction(async (tx) => {
    // Offer rows before the project row: the intern's accept locks its proposal rows, then the
    // project row (share), so taking them in the same order here cannot deadlock with it.
    if (input.action === "takedown") await lockOpenOfferRows(tx, input.projectId);
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
    const { withdrawn, skipped } = input.action === "takedown" ? await withdrawOpenOffers(tx, { projectId: input.projectId, employerId: project.employerId }) : { withdrawn: [], skipped: [] };
    // strict: if an audit row can't be written the takedown rolls back with it.
    await recordAdminAudit(tx, {
      adminId: input.adminId,
      action: input.action === "takedown" ? "project.takedown" : "project.restore",
      targetType: "project",
      targetId: input.projectId,
      meta: {
        projectName: project.projectName,
        ...(input.action === "takedown" ? { reason: plan.set.takenDownReason, withdrawnOffers: withdrawn.length, skippedOffers: skipped.map((o) => o.id) } : {}),
      },
    }, { strict: true });
    for (const o of withdrawn) {
      await recordAdminAudit(tx, {
        adminId: input.adminId,
        action: "proposal.takedown_withdraw",
        targetType: "proposal",
        targetId: o.id,
        meta: { projectId: input.projectId, projectName: project.projectName, internId: o.internId, previousStatus: o.previousStatus },
      }, { strict: true });
    }
    return { kind: "changed" as const, project, reason: plan.set.takenDownReason, withdrawn, skipped };
  });

  if (out.kind === "missing") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (out.kind === "refused") return NextResponse.json({ error: out.plan.error }, { status: out.plan.status });
  if (out.kind === "noop") return NextResponse.json({ ok: true, takenDown: out.down, unchanged: true });

  const down = input.action === "takedown";
  const name = out.project.projectName;
  const count = out.withdrawn.length;
  const withdrawnNote = count > 0 ? ` ${count === 1 ? "1 open offer on it was" : `${count} open offers on it were`} withdrawn.` : "";
  // Neutral: accepted offers with a payment in progress are left as they are; the team closes them if the payment lapses.
  const skippedCount = out.skipped.length;
  const skippedNote = skippedCount > 0 ? ` ${skippedCount === 1 ? "1 accepted offer" : `${skippedCount} accepted offers`} with a payment in progress ${skippedCount === 1 ? "was" : "were"} left as it is.` : "";
  await notifyWithdrawnOffers(out.withdrawn, input.projectId);
  const site = tryPublicOrigin();
  try {
    await notify({
      to: { type: "employer", id: out.project.employerId },
      type: down ? "project_taken_down" : "project_restored",
      title: down ? "Your internship was taken down" : "Your internship is back up",
      message: down ? `"${name}" was taken down by Findtern: ${out.reason}${withdrawnNote}${skippedNote}` : `"${name}" is visible to candidates again.`,
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
                ? [`"${name}" was taken down by Findtern and is no longer visible to candidates.`, `Reason: ${out.reason}`, ...(count > 0 ? [withdrawnNote.trim()] : []), ...(skippedCount > 0 ? [skippedNote.trim()] : []), "Contact support if you think this is a mistake."]
                : [`"${name}" was restored and is visible to candidates again.`],
              status: down ? "Taken down" : "Restored",
              tone: down ? "wait" : "done",
              cta: { label: "Open your projects", url: `${site}/employer/projects` },
            },
    });
  } catch (err) {
    console.error("[admin/projects/takedown] notify failed", err);
  }
  return NextResponse.json({ ok: true, takenDown: down, ...(down ? { withdrawnOffers: count, skippedOffers: skippedCount, skippedOfferIds: out.skipped.map((o) => o.id) } : {}) });
}
