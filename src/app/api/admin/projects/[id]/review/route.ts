import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";
import { tryPublicOrigin } from "@/lib/origin";
import { isTransitionConflict, planReview } from "@/lib/projects/transition";

const bodySchema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().max(1000).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plan = planReview({ project, decision: parsed.data.decision, reason: parsed.data.reason });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const updated = await db
    .update(schema.projects)
    .set({ ...plan.set, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.status, project.status ?? "")))
    .returning({ id: schema.projects.id });
  if (isTransitionConflict(updated.length)) {
    return NextResponse.json({ error: "This project was just changed by someone else." }, { status: 409 });
  }

  await recordAdminAudit(db, {
    adminId: guard.session.uid,
    action: plan.to === "published" ? "project.approve" : "project.reject",
    targetType: "project",
    targetId: id,
    meta: { projectName: project.projectName, ...(plan.to === "rejected" ? { reason: plan.set.rejectionReason } : {}) },
  });

  // Best effort: a failed notification or email never undoes the decision, and it is already
  // committed, so nothing here may 500. No PUBLIC_ORIGIN (production) means no email link: the
  // employer still gets the in-app notification.
  const site = tryPublicOrigin();
  const approved = plan.to === "published";
  const name = project.projectName;
  await notify({
    to: { type: "employer", id: project.employerId },
    type: approved ? "project_approved" : "project_rejected",
    title: approved ? "Your internship is live" : "Your internship needs changes",
    message: approved ? `"${name}" is now visible to candidates.` : `"${name}" was not approved: ${plan.set.rejectionReason}`,
    data: { projectId: id },
    dedupeKey: `project-review:${id}:${plan.to}:${Date.now()}`,
    email: site === null ? undefined : {
      subject: approved ? `Your internship "${name}" is live` : `Your internship "${name}" needs changes`,
      heading: approved ? "Your internship is live" : "Your internship needs changes",
      greeting: "Hello,",
      lines: approved
        ? [`"${name}" passed review and is now visible to candidates.`]
        : [`"${name}" was not approved.`, `Reason: ${plan.set.rejectionReason}`, "Edit it and submit again when you are ready."],
      status: approved ? "Published" : "Needs changes",
      tone: approved ? "done" : "wait",
      cta: { label: "Open your projects", url: `${site}/employer/projects` },
    },
  }).catch((err) => console.error("[admin/projects/review] notify failed", err));

  return NextResponse.json({ ok: true, status: plan.to });
}
