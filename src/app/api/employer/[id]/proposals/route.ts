import { and, eq, inArray } from "drizzle-orm";
import { after, NextResponse } from "next/server";

import { isHiredProposal } from "@/lib/hire-status";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { scoreOf, toCandidateProfile } from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { requireMutation } from "@/lib/guards-mutation";
import { emails } from "@/lib/emails";
import { employerNames, notify } from "@/lib/notify";
import { buildOffer, parseOffer, PAID_LEAVE_OPTIONS, scheduledMonthlyHours, todayIst, WEEKLY_SCHEDULES, type WeeklySchedule } from "@/lib/offer";
import { employerRegion } from "@/lib/employer-pricing";
import { canEmployerSeeIntern } from "@/lib/employer-pool";
import { isBlockingInterview } from "@/lib/employer-interview-rules";
import { modeProblem, workPreferenceOf } from "@/lib/work-preference";

const LIVE = ["draft", "sent", "accepted", "interview_scheduled", "processing"];

const bodySchema = z
  .object({
  internId: z.string().min(1),
  projectId: z.string().min(1),
  flowType: z.enum(["direct", "interview_first"]).default("direct"),
  /** Ignored: the currency follows the company's country (India → INR). */
  currency: z.enum(["INR", "USD"]).optional(),
  /** The hiring-policy agreement shown before every proposal. */
  agreedToPolicy: z.literal(true, { message: "Agree to Findtern's hiring policies to send a proposal." }),
  roleTitle: z.string().trim().min(2).max(120),
  // Legacy required a job description, a city and state off-remote, the
  // hybrid split, a shift, a timezone and the laptop answer.
  jd: z.string().trim().min(1, "Add a job description.").max(4000),
  mode: z.enum(["remote", "hybrid", "onsite"]),
  location: z.string().trim().max(120).default(""),
  city: z.string().trim().max(80).default(""),
  state: z.string().trim().max(80).default(""),
  officeDays: z.number().int().min(1).max(6).optional(),
  homeDays: z.number().int().min(1).max(6).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.enum(["1m", "2m", "3m", "6m"]),
  /** Ignored: hours follow the schedule and paid leave (scheduledMonthlyHours). */
  monthlyHours: z.number().optional(),
  weeklySchedule: z.enum(Object.keys(WEEKLY_SCHEDULES) as [WeeklySchedule, ...WeeklySchedule[]]).default("mon_fri"),
  shiftFrom: z.string().min(1, "Pick the working hours.").max(10),
  shiftTo: z.string().min(1, "Pick the working hours.").max(10),
  timezone: z.string().min(1, "Pick a timezone.").max(64),
  laptop: z.string().min(1, "Say who provides the laptop.").max(20),
  paidLeavesPerMonth: z
    .number()
    .refine((n) => (PAID_LEAVE_OPTIONS as readonly number[]).includes(n), "Paid leave is 0 to 3 days a month, in half days.")
    .default(0),
  skills: z.array(z.string()).max(30).default([]),
})
  .superRefine((b, ctx) => {
    if (b.mode !== "remote" && (!b.city || !b.state)) {
      ctx.addIssue({ code: "custom", message: "An on-site or hybrid role needs a city and state." });
    }
    if (b.mode === "hybrid") {
      if (!b.officeDays || !b.homeDays) {
        ctx.addIssue({ code: "custom", message: "A hybrid role needs office and work-from-home days." });
      } else if (b.officeDays + b.homeDays > 7) {
        ctx.addIssue({ code: "custom", message: "Office and home days add up to more than a week." });
      }
    }
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
  // An offer lapses on its start date, so the start has to be after today.
  if (b.startDate <= todayIst()) {
    return NextResponse.json({ error: "Pick a start date after today." }, { status: 400 });
  }

  const db = getDb();
  // Indian companies are billed in INR, everyone else in USD (row 64).
  const [employer] = await db
    .select({ country: schema.employers.country, countryCode: schema.employers.countryCode })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  const currency = employerRegion(employer ?? {}) === "IN" ? "INR" : "USD";
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, b.projectId), eq(schema.projects.employerId, id)))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });

  // Only a pool candidate, or one this employer already works with.
  if (!(await canEmployerSeeIntern(db, id, b.internId))) {
    return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  }

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
  if (!user || !onboarding || user.role !== "intern" || !user.isActive) {
    return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  }
  // Work location follows the candidate's own preference (bug sheet 23 Oct).
  const modeIssue = modeProblem(workPreferenceOf(onboarding), b.mode);
  if (modeIssue) return NextResponse.json({ error: modeIssue }, { status: 400 });
  // A full-time offer that is still open blocks an internship proposal
  // (legacy R:12767).
  const openOffers = await db
    .select({
      offerDetails: schema.proposals.offerDetails,
      currency: schema.proposals.currency,
      status: schema.proposals.status,
      hiredAt: schema.proposals.hiredAt,
    })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, id),
        eq(schema.proposals.internId, b.internId),
        inArray(schema.proposals.status, [...LIVE, "hired"]),
      ),
    );
  if (openOffers.some((o) => parseOffer(o.offerDetails, o.currency).fullTime)) {
    return NextResponse.json({ error: "A full-time offer has already been sent to this candidate." }, { status: 409 });
  }
  const { ratings } = toCandidateProfile(user, onboarding);
  const score = scoreOf(onboarding);
  if (!(score > 0)) {
    return NextResponse.json({ error: "This candidate hasn't completed the AI interview yet." }, { status: 400 });
  }
  // An interview booked for this project holds the offer until it happens.
  // One whose slots have all passed no longer blocks (legacy R:12880).
  const interviewRows = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.employerId, id), eq(schema.interviews.internId, b.internId)));
  const pendingInterview = interviewRows.find(
    (iv) => (!iv.projectId || iv.projectId === b.projectId) && isBlockingInterview(iv),
  );
  if (pendingInterview) {
    return NextResponse.json({ error: "The offer opens once the interview has happened." }, { status: 409 });
  }
  if (score < 6 && (b.duration === "3m" || b.duration === "6m")) {
    return NextResponse.json({ error: "Candidates scoring below 6 can be offered up to 2 months." }, { status: 400 });
  }

  // Price comes from the candidate's band, never from the request.
  const plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
  const rate = resolvePricing(score, plans, currency, null);
  const offerDetails = buildOffer({
    ...b,
    // Hours and money are worked out here, never taken from the request.
    monthlyHours: scheduledMonthlyHours(b.weeklySchedule, b.paidLeavesPerMonth),
    currency,
    hourlyRateMinor: rate.hourlyRateMinor,
    // Per-hire applies below a score of 6 only (legacy rule).
    perHireMinor: rate.perHireMinor,
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
      currency,
      offerDetails: { ...offerDetails, policyAcceptedAt: new Date().toISOString() },
      aiRatings: { communication: ratings.communication, coding: ratings.coding, aptitude: ratings.aptitude, overall: score },
      skills: b.skills,
      status: "sent",
    })
    .returning();
  // The company stays hidden from the intern until it hires them. This used
  // to reveal it whenever any offer was merely open.
  const companyName = openOffers.some(isHiredProposal) ? (await employerNames(id)).company : "A company on Findtern";
  // The proposal is saved; tell the intern after responding, so the composer
  // is not held on the SMTP round-trip (bug sheet 22 Oct: "kept me on send
  // proposal page") and a mail failure cannot turn a sent offer into a 500.
  after(() =>
    notify({
      to: { type: "intern", id: b.internId },
      type: "proposal_received",
      title: "New proposal",
      message: `You have a new internship proposal for ${b.roleTitle}.`,
      data: { proposalId: proposal.id },
      email: emails.proposalReceived({ internName: user.firstName, companyName, role: b.roleTitle, proposalId: proposal.id }),
    }).catch((e) => console.error("[employer/proposals] notify", e)),
  );
  return NextResponse.json({ proposal }, { status: 201 });
}
