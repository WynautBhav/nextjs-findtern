import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";
import { canLeaveFeedback } from "@/lib/employer-interview-rules";

// 1-2000 characters, as legacy (R:11277).
const bodySchema = z.object({ feedback: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write some feedback (up to 2000 characters)." }, { status: 400 });

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A meeting marked missed can still get feedback (legacy allowed it, e.g.
  // after marking missed by mistake; EMB-22).
  if (!["scheduled", "completed", "missed"].includes(interview.status)) {
    return NextResponse.json({ error: "Feedback can be added after a scheduled interview." }, { status: 409 });
  }
  // Once, and only after the meeting is over.
  if ((interview.notes ?? "").includes("feedback_text:")) {
    return NextResponse.json({ error: "Feedback has already been shared for this interview." }, { status: 409 });
  }
  if (!canLeaveFeedback(interview)) {
    return NextResponse.json({ error: "You can add feedback once the interview is completed." }, { status: 409 });
  }
  const notes = interview.notes ? `${interview.notes}\nfeedback_text: ${parsed.data.feedback}` : `feedback_text: ${parsed.data.feedback}`;
  await db.update(schema.interviews).set({ notes, status: interview.status === "missed" ? "missed" : "completed", updatedAt: new Date() }).where(eq(schema.interviews.id, id));
  await notify({
    to: { type: "intern", id: interview.internId },
    type: "interview_feedback",
    title: "Interview feedback",
    message: "The company shared feedback on your interview.",
    data: { interviewId: id },
    dedupeKey: `interview_feedback:${id}`,
  });
  return NextResponse.json({ ok: true });
}
