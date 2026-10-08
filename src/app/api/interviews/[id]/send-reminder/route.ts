import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { sendSmtpMail } from "@/lib/mailer";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [intern] = await db.select().from(schema.users).where(eq(schema.users.id, interview.internId)).limit(1);
  if (intern) {
    await sendSmtpMail({
      to: intern.email,
      subject: "Interview reminder",
      text: `You have an upcoming interview. Meeting link: ${interview.meetingLink ?? "pending"}`,
    });
  }
  return NextResponse.json({ ok: true });
}
