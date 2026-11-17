import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { formatSupportMessage } from "@/lib/admin/contact-meta";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

const bodySchema = z.object({ message: z.string().trim().min(1, "Write a message for admin.").max(2000, "Keep the message under 2000 characters.") });

/**
 * "Contact admin" on a taken-down project: the one thing the owner can still do about it. It lands in the admin
 * Messages inbox (contact_messages, the same table and envelope as the in-app "Report a problem") with the project
 * name and id, the company and the takedown reason on record, so staff can see which project it is about. The takedown
 * guard is deliberately NOT called here. Works for any of the employer's own projects; a project that is not theirs is a 404.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const employerId = guard.session.uid;

  if (!limiters.takedownContact.take(bucketKey(clientIp(req.headers), employerId))) {
    return NextResponse.json({ error: "Too many messages. Try again in a while." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id, projectName: schema.projects.projectName, takenDownAt: schema.projects.takenDownAt, takenDownReason: schema.projects.takenDownReason })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.employerId, employerId)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [company] = await db
    .select({ name: schema.employers.companyName, contact: schema.employers.name, email: schema.employers.companyEmail })
    .from(schema.employers)
    .where(eq(schema.employers.id, employerId))
    .limit(1);

  const name = (project.projectName ?? "Untitled project").trim();
  const companyName = (company?.name ?? "Employer").trim();
  const lines = [
    `Project: ${name} (${project.id})`,
    `Company: ${companyName} (${employerId})`,
    project.takenDownAt ? `Reason on record: ${project.takenDownReason ?? "none"}` : "Status: not taken down",
    "",
    parsed.data.message,
  ];
  await db.insert(schema.contactMessages).values({
    firstName: companyName || "Employer",
    lastName: "",
    email: company?.email || "employer@findtern.support",
    subject: `Takedown: ${name}`,
    message: formatSupportMessage({
      kind: "report",
      userType: "employer",
      userId: employerId,
      pageUrl: `/employer/projects/${project.id}`,
      topic: "takedown",
      message: lines.join("\n"),
    }),
    queryType: "hiring",
  });
  return NextResponse.json({ ok: true });
}
