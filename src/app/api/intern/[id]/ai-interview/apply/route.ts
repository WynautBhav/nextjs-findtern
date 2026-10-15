import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Apply for the AI interview.
 *
 * This is not a call to an external service. The legacy build created an
 * interview row against a synthetic employer (`ai-interview@findtern.ai`) with
 * status "waiting", and the actual interview happened over a link an admin sent
 * afterwards. That queue is the whole mechanism, and it needs no vendor - which
 * is why the feature can come back without waiting on anyone.
 *
 * Two gates, both from the legacy behaviour and both load-bearing:
 *   1. Payment. The ₹2,499 activation is what makes the profile visible, and
 *      the interview is the thing that produces the score, so an unpaid profile
 *      cannot enter the queue.
 *   2. One in flight. A second application would put a duplicate in the admin's
 *      queue, so a pending/waiting/scheduled interview returns 409 with the
 *      existing row rather than creating another.
 */

const AI_EMAIL = "ai-interview@findtern.ai";
const IN_FLIGHT = ["waiting", "pending", "scheduled"];

/**
 * Preflight: is an application already in the queue?
 *
 * Without this the button is a live-looking control that 409s for anyone who
 * already applied, which reads as a broken page rather than as "you are done".
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [aiEmployer] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, AI_EMAIL))
    .limit(1);

  if (!aiEmployer) return NextResponse.json({ pending: false });

  const [existing] = await db
    .select({ id: schema.interviews.id, status: schema.interviews.status })
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.internId, id),
        eq(schema.interviews.employerId, aiEmployer.id),
        inArray(schema.interviews.status, IN_FLIGHT),
      ),
    )
    .limit(1);

  return NextResponse.json({
    pending: Boolean(existing),
    status: existing?.status ?? null,
    message: existing ? "Your application is already in the queue." : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();

  // Gate 1 - has the activation payment landed?
  const [payment] = await db
    .select({ id: schema.internPayments.id })
    .from(schema.internPayments)
    .where(and(eq(schema.internPayments.internId, id), eq(schema.internPayments.status, "paid")))
    .limit(1);
  if (!payment) {
    return NextResponse.json({ error: "Activate your profile before applying" }, { status: 402 });
  }

  // The synthetic employer is a row like any other; create it if a fresh
  // database has not been seeded with it yet.
  let [aiEmployer] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, AI_EMAIL))
    .limit(1);
  if (!aiEmployer) {
    const [created] = await db
      .insert(schema.employers)
      .values({
        name: "Findtern AI Interview",
        companyName: "Findtern AI Interview",
        companyEmail: AI_EMAIL,
        emailVerified: true,
        countryCode: "+91",
        phoneNumber: "0000000000",
        // Unusable credential: this account exists to own interview rows and
        // must never be able to sign in.
        password: "!ai-interview-account-cannot-sign-in",
        agreedToTerms: true,
      })
      .returning({ id: schema.employers.id });
    aiEmployer = created;
  }

  // Gate 2 - one application in flight.
  const [existing] = await db
    .select({ id: schema.interviews.id, status: schema.interviews.status })
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.internId, id),
        eq(schema.interviews.employerId, aiEmployer.id),
        inArray(schema.interviews.status, IN_FLIGHT),
      ),
    )
    .orderBy(desc(schema.interviews.createdAt))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Your application is already in progress", interview: existing },
      { status: 409 },
    );
  }

  const [interview] = await db
    .insert(schema.interviews)
    .values({
      employerId: aiEmployer.id,
      internId: id,
      projectId: null,
      status: "waiting",
      timezone: "Asia/Kolkata",
      notes: "AI interview - awaiting scheduling",
    })
    .returning({ id: schema.interviews.id });

  await db.insert(schema.notifications).values({
    recipientType: "intern",
    recipientId: id,
    type: "ai_interview_applied",
    title: "AI interview requested",
    message: "You are in the queue. The interview link arrives here, usually within two working days.",
    dedupeKey: `ai_interview_applied:${interview.id}`,
  });

  return NextResponse.json({ ok: true, interviewId: interview.id });
}