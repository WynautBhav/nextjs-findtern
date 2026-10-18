import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { scoreOf, toCandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { requireMutation } from "@/lib/guards-mutation";
import { emails } from "@/lib/emails";
import { employerNames, notify } from "@/lib/notify";
import { buildOffer } from "@/lib/offer";

const LIVE = ["draft", "sent", "accepted", "interview_scheduled", "processing"];

const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().min(1),
  flowType: z.enum(["direct", "interview_first"]).default("direct"),
  currency: z.enum(["INR", "USD"]).default("INR"),
  roleTitle: z.string().trim().min(2).max(120),
  jd: z.string().trim().max(4000).default(""),
  mode: z.enum(["remote", "hybrid", "onsite"]),
  location: z.string().trim().max(120).default(""),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.enum(["1m", "2m", "3m", "6m"]),
  monthlyHours: z.number().int().min(1).max(300),
  /** Employer's own monthly figure, major units. Omitted = hours × band rate. */
  monthlyAmount: z.number().positive().max(10_000_000).optional(),
  shiftFrom: z.string().max(10).default(""),
  shiftTo: z.string().max(10).default(""),
  timezone: z.string().max(64).default("Asia/Kolkata"),
  laptop: z.string().max(20).default(""),
  paidLeavesPerMonth: z.number().int().min(0).max(10).default(0),
  skills: z.array(z.string()).max(30).default([]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const b = parsed.data;
  if (b.startDate < new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "The start date can't be in the past." }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, b.projectId), eq(schema.projects.employerId, id)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });

  // One live offer per candidate per employer, across projects (legacy rule).
  const [live] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, id),
        eq(schema.proposals.internId, b.internId),
        inArray(schema.proposals.status, LIVE),
      ),
    )
    .limit(1);
  if (live) {
    return NextResponse.json(
      { error: "You already have a live offer with this candidate. Withdraw it or wait for their reply.", proposalId: live.id },
      { status: 409 },
    );
  }

  const [[user], [onboarding]] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, b.internId)).limit(1),
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, b.internId)).limit(1),
  ]);
  if (!user || !onboarding) return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  const { ratings } = toCandidateProfile(user, onboarding);
  const score = scoreOf(onboarding);
  if (!(score > 0)) {
    return NextResponse.json({ error: "This candidate hasn't completed the AI interview yet." }, { status: 400 });
  }
  const [pendingInterview] = await db
    .select({ id: schema.interviews.id })
    .from(schema.interviews)
    .where(
      and(eq(schema.interviews.employerId, id), eq(schema.interviews.internId, b.internId), eq(schema.interviews.status, "pending")),
    )
    .limit(1);
  if (pendingInterview) {
    return NextResponse.json({ error: "Wait for the candidate to confirm the interview slot before sending an offer." }, { status: 409 });
  }
  if (score < 6 && (b.duration === "3m" || b.duration === "6m")) {
    return NextResponse.json({ error: "Candidates scoring below 6 can be offered up to 2 months." }, { status: 400 });
  }

  // Price comes from the candidate's band, never from the request.
  const plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
  const rate = resolvePricing(score, plans, b.currency, null);
  const offerDetails = buildOffer({
    ...b,
    hourlyRateMinor: rate.hourlyRateMinor,
    // Per-hire applies below a score of 6 only (legacy rule).
    perHireMinor: score < 6 ? rate.perHireMinor : 0,
    monthlyOverrideMinor: b.monthlyAmount != null ? Math.round(b.monthlyAmount * 100) : null,
    candidateScore: score,
    projectSkills: b.skills,
  });

  const [proposal] = await db
    .insert(schema.proposals)
    .values({
      employerId: id,
      internId: b.internId,
      projectId: b.projectId,
      flowType: b.flowType,
      currency: b.currency,
      offerDetails,
      aiRatings: { communication: ratings.communication, coding: ratings.coding, aptitude: ratings.aptitude, overall: score },
      skills: b.skills,
      status: "sent",
    })
    .returning();
  await notify({
    to: { type: "intern", id: b.internId },
    type: "proposal_received",
    title: "New proposal",
    message: `You have a new internship proposal for ${b.roleTitle}.`,
    data: { proposalId: proposal.id },
    email: emails.proposalReceived({
      internName: user.firstName,
      companyName: (await employerNames(id)).company,
      role: b.roleTitle,
      proposalId: proposal.id,
    }),
  });
  return NextResponse.json({ proposal }, { status: 201 });
}
