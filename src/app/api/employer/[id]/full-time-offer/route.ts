import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { SITE } from "@/lib/content/site";
import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProposalActionable } from "@/lib/projects/takedown-guard-server";
import { sendSmtpMail } from "@/lib/mailer";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { startDateProblem } from "@/lib/business-days";
import { DRIVE_FULL_TIME_FEE } from "@/lib/checkout";
import { logDriveActivity } from "@/lib/college/campus-lock";
import { calculateHireFees, ppoRate } from "@/lib/college/drive-pricing";
import { fullTimeReady } from "@/lib/college/eligibility";
import { driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { candidatePoolClauses, heldElsewhereIds } from "@/lib/employer-pool";
import { CANDIDATE_UNAVAILABLE } from "@/lib/candidate-hold";
import { ON_HOLD_REFUSAL } from "@/lib/account-hold";
import { parseOffer } from "@/lib/offer";
import { isProjectOpen } from "@/lib/project-locations";
import { requirePublicOrigin } from "@/lib/origin";
import { TAKEDOWN_BLOCKS, takedownBlock } from "@/lib/projects/takedown";

const bodySchema = z.object({
  /** A hired intern's placement: the offer converts it to full time. */
  proposalId: z.string().min(1).optional(),
  /** Or a full-time campus drive the employer is in, with the student and one of the employer's projects (the offer's project). */
  driveId: z.string().min(1).optional(),
  internId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  jobTitle: z.string().trim().min(2).max(120),
  jobMode: z.enum(["remote", "hybrid", "onsite"]),
  jobLocationCity: z.string().trim().max(80).default(""),
  jobLocationState: z.string().trim().max(80).default(""),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  shiftFrom: z.string().min(1),
  shiftTo: z.string().min(1),
  ctcCurrency: z.enum(["INR", "USD"]),
  annualCtc: z.number().positive().max(100_000_000),
  /** USD offers only (Findtern runs their payroll): what an hour above 8 in a day pays, in dollars. */
  /** Key returned by /api/uploads (kind offer_letter). */
  offerLetterKey: z.string().min(10),
  /** Optional joining date. When sent it is held to the hiring start rule (a weekday, two days after sending). Stored inside fullTimeOffer, so it never lapses the offer. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date.").optional(),
}).refine((b) => (b.proposalId ? !b.driveId : Boolean(b.driveId && b.internId && b.projectId)), { message: "Invalid input" });

/**
 * Offer a full-time role, to a hired intern or to a student in a full-time campus drive. Same shape as the
 * legacy route: a new proposal carrying `offerDetails.fullTimeOffer`, which the intern accepts and the employer
 * then pays the hiring fee for at checkout. A drive offer carries the drive and its 1% fee, stamped here only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const dateProblem = b.startDate === undefined ? null : startDateProblem(b.startDate, new Date());
  if (dateProblem) return NextResponse.json({ error: dateProblem }, { status: 400 });
  if (b.jobMode !== "remote" && (!b.jobLocationCity || !b.jobLocationState)) {
    return NextResponse.json({ error: "City and state are needed for onsite or hybrid roles." }, { status: 400 });
  }
  if (!b.offerLetterKey.startsWith(id.replace(/[^a-z0-9_-]/gi, "").slice(0, 32))) {
    return NextResponse.json({ error: "Upload the offer letter again." }, { status: 400 });
  }

  const db = getDb();
  const [employer] = await db.select().from(schema.employers).where(eq(schema.employers.id, id)).limit(1);
  let base: Pick<typeof schema.proposals.$inferSelect, "internId" | "projectId" | "flowType" | "skills" | "aiRatings">;
  let from: { baseProposalId: string; driveId?: string; feeRate?: number } | { driveId: string; feeRate: number };
  let fees = calculateHireFees({ driveId: null });
  let driveLog: { driveId: string; collegeId: string } | null = null;
  if (b.proposalId) {
    const [placement] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, b.proposalId)).limit(1);
    if (!placement || placement.employerId !== id) return NextResponse.json({ error: "Unknown placement" }, { status: 404 });
    const td = await assertProposalActionable(b.proposalId, id);
    if (!td.ok) return td.response;
    if (placement.status !== "hired") return NextResponse.json({ error: "Full-time offers go to interns you've hired." }, { status: 409 });
    base = placement;
    // A PPO keeps the terms the internship was hired on: an intern sourced from a campus drive converts at the drive's 1%,
    // whenever it happens (after the drive ended or the company left). Read from the stored internship, never the request.
    if (placement.driveId) {
      fees = { ...calculateHireFees({ driveId: placement.driveId }), discountPercent: 0, ppoFeePercent: Number(placement.ppoFeePercent) };
      from = { baseProposalId: b.proposalId, driveId: placement.driveId, feeRate: ppoRate(placement.ppoFeePercent) };
    } else {
      from = { baseProposalId: b.proposalId };
    }
  } else {
    // A drive offer: the drive must be open to this employer (joined from the link, inside its window), a
    // full-time drive, the student one of its students and the project the employer's own.
    const loaded = await driveForEmployer(b.driveId!, guard.session);
    if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!loaded.access.ok) return NextResponse.json({ error: "No access to this drive", reason: loaded.access.reason }, { status: 403 });
    if (loaded.exited) return NextResponse.json({ error: "You left this drive.", reason: "exited" }, { status: 403 });
    const student = (await eligibleStudents(loaded.drive)).find((s) => s.userId === b.internId);
    if (!student) return NextResponse.json({ error: "Student not in this drive" }, { status: 404 });
    // Every drive has both tracks; the full-time one is the final year only (B.Tech 4th, BCA 3rd: lib/college/eligibility.ts).
    if (!fullTimeReady(student)) {
      return NextResponse.json({ error: "Full-time offers go to final-year students only. Send this student an internship instead.", code: "not_final_year" }, { status: 422 });
    }
    // Only a student in Findtern's candidate pool takes offers (the card shows the button for them alone).
    const [inPool] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(eq(schema.users.id, b.internId!), ...candidatePoolClauses()))
      .limit(1);
    if (!inPool) return NextResponse.json({ error: "This student can't take offers yet." }, { status: 409 });
    // An intern this employer already hired converts through the placement, at the rate that placement was hired on.
    const [held] = await db
      .select({ id: schema.proposals.id })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, id), eq(schema.proposals.internId, b.internId!), inArray(schema.proposals.status, ["accepted", "processing", "hired"])))
      .limit(1);
    if (held) return NextResponse.json({ error: "You've already hired this intern. Make the full-time offer from their placement." }, { status: 409 });
    const [project] = await db
      .select({ id: schema.projects.id, status: schema.projects.status, takenDownAt: schema.projects.takenDownAt })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, b.projectId!), eq(schema.projects.employerId, id)))
      .limit(1);
    if (!project) return NextResponse.json({ error: "Pick one of your projects." }, { status: 404 });
    if (!isProjectOpen(project.status, project.takenDownAt)) return NextResponse.json({ error: "That project is closed. Pick an open one." }, { status: 409 });
    base = { internId: b.internId!, projectId: project.id, flowType: "direct", skills: [], aiRatings: null };
    from = { driveId: loaded.drive.id, feeRate: DRIVE_FULL_TIME_FEE };
    fees = calculateHireFees({ driveId: loaded.drive.id });
    driveLog = { driveId: loaded.drive.id, collegeId: loaded.drive.collegeId };
  }
  // The candidate rules of the internship proposals route, on both paths: an active intern account, not frozen
  // (on hold), and not held by another company's accepted offer or running hire. Otherwise the offer goes out but
  // can only fail when the intern accepts it. Neutral on purpose: nothing about the other company.
  const [candidate] = await db
    .select({ role: schema.users.role, isActive: schema.users.isActive, frozenAt: schema.users.frozenAt })
    .from(schema.users)
    .where(eq(schema.users.id, base.internId))
    .limit(1);
  if (!candidate || candidate.role !== "intern" || !candidate.isActive) return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  if (candidate.frozenAt) return NextResponse.json(ON_HOLD_REFUSAL, { status: 409 });
  if ((await heldElsewhereIds(db, id, [base.internId])).has(base.internId)) {
    return NextResponse.json(CANDIDATE_UNAVAILABLE, { status: 409 });
  }
  // A taken-down listing sends no new offers, a full-time one included.
  if (base.projectId) {
    const [project] = await db.select({ takenDownAt: schema.projects.takenDownAt }).from(schema.projects).where(eq(schema.projects.id, base.projectId)).limit(1);
    const blocked = takedownBlock(project, "send");
    if (blocked) return NextResponse.json({ error: blocked, code: "listing_taken_down" }, { status: 409 });
  }
  if (b.ctcCurrency === "USD" && employer?.internationalFteStatus !== "approved") {
    return NextResponse.json({ error: "USD offers need International FTE approval first." }, { status: 403 });
  }

  // EMH-05: legacy and the admin read the letter from `offerLetterUrl`. The
  // file is private, so the URL is the access-checked letter route (parties
  // and admins only), never a public /uploads path.
  const proposalId = randomUUID();
  const origin = requirePublicOrigin();
  const offerLetterUrl = `${origin}/api/proposals/${proposalId}/offer-letter`;
  const [intern] = await db
    .select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, base.internId))
    .limit(1);
  const internName = `${intern?.first ?? ""} ${intern?.last ?? ""}`.trim() || "Candidate";

  // One full-time offer per intern: checked and inserted under one lock, so two
  // requests at once (a double click gave three offers) can't both pass.
  const proposal = await withLock(`offer:${id}:${base.internId}`, async (tx) => {
    // Re-read the takedown under a shared row lock (see the proposals route): the early check can be stale.
    if (base.projectId) {
      const [live] = await tx.select({ takenDownAt: schema.projects.takenDownAt }).from(schema.projects).where(eq(schema.projects.id, base.projectId)).for("share").limit(1);
      if (takedownBlock(live, "send")) return "taken_down" as const;
    }
    const existing = await tx
      .select({ offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.employerId, id),
          eq(schema.proposals.internId, base.internId),
          inArray(schema.proposals.status, ["draft", "sent", "accepted", "processing", "hired"]),
        ),
      );
    if (existing.some((p) => parseOffer(p.offer, p.currency).fullTime)) return null;
    const [created] = await tx
      .insert(schema.proposals)
      .values({
        id: proposalId,
        employerId: id,
        internId: base.internId,
        projectId: base.projectId,
        flowType: base.flowType,
        status: "sent",
        currency: b.ctcCurrency,
        offerDetails: {
          fullTimeOffer: {
            ...from,
            jobTitle: b.jobTitle,
            jobMode: b.jobMode,
            jobLocationCity: b.jobLocationCity,
            jobLocationState: b.jobLocationState,
            timezone: b.timezone,
            shiftFrom: b.shiftFrom,
            shiftTo: b.shiftTo,
            ctcCurrency: b.ctcCurrency,
            annualCtc: b.annualCtc,
            offerLetterKey: b.offerLetterKey,
            offerLetterUrl,
            ...(b.startDate ? { startDate: b.startDate } : {}),
            createdAt: new Date().toISOString(),
          },
          currency: b.ctcCurrency,
        },
        skills: base.skills,
        // The assessment the hire was made on travels with the full-time offer
        // (legacy routes.ts:13261).
        aiRatings: base.aiRatings ?? null,
        // Server-decided drive terms (lib/college/drive-pricing.ts); any pricing field in the body is never read.
        driveId: fees.driveId,
        pricingTier: fees.pricingTier,
        discountPercent: fees.discountPercent,
        ppoFeePercent: String(fees.ppoFeePercent),
      })
      .returning();
    return created;
  });
  if (proposal === "taken_down") {
    return NextResponse.json({ error: TAKEDOWN_BLOCKS.send, code: "listing_taken_down" }, { status: 409 });
  }
  if (!proposal) {
    return NextResponse.json({ error: "You've already sent this intern a full-time offer." }, { status: 409 });
  }

  if (driveLog) await logDriveActivity(db, { ...driveLog, employerId: id, action: "sent_fulltime_offer", metadata: { proposalId: proposal.id, internId: base.internId } });

  await notify({
    to: { type: "intern", id: base.internId },
    type: "full_time_offer_received",
    title: "Full-time offer",
    message: `You've received a full-time job offer for ${b.jobTitle}.`,
    data: { proposalId: proposal.id },
    email: emails.fullTimeOfferReceived({
      internName: await internFirstName(base.internId),
      companyName: (await employerNames(id)).company,
      role: b.jobTitle,
      proposalId: proposal.id,
    }),
  });

  // Internal alert, as legacy (routes.ts:13326): a row in the admin inbox and
  // a mail to the team, so a PPO is followed up by a person. The offer is
  // already saved, so a failed alert must not fail the request.
  const companyName = (employer?.companyName ?? "").trim() || "Employer";
  const summary = [
    `employer: ${companyName} (${id})`,
    `candidate: ${internName} (${base.internId})`,
    ...(intern?.email ? [`candidateEmail: ${intern.email}`] : []),
    `proposal: ${proposal.id}`,
    `jobTitle: ${b.jobTitle}`,
    `jobMode: ${b.jobMode}`,
    ...(b.jobMode !== "remote" ? [`jobLocation: ${b.jobLocationCity}, ${b.jobLocationState}`] : []),
    `timezone: ${b.timezone}`,
    `shift: ${b.shiftFrom} - ${b.shiftTo}`,
    `annualCtc: ${b.ctcCurrency} ${b.annualCtc}`,
    ...(fees.driveId ? [`campusDrive: ${fees.driveId} (hiring fee ${fees.ppoFeePercent}%)`] : []),
    `offerLetter: ${offerLetterUrl}`,
  ].join("\n");
  try {
    await db.insert(schema.contactMessages).values({
      firstName: companyName,
      lastName: id.slice(0, 36),
      email: employer?.companyEmail ?? "employer@findtern.in",
      queryType: "hiring",
      subject: `Full-time offer: ${b.jobTitle.slice(0, 120)}`,
      message: summary,
    });
    await sendSmtpMail({
      to: process.env.ADMIN_ALERT_EMAIL ?? SITE.adminEmail,
      ...renderEmail(
        emails.fullTimeOfferAdminAlert({
          companyName,
          employerId: id,
          internName,
          internId: base.internId,
          internEmail: intern?.email,
          proposalId: proposal.id,
          jobTitle: b.jobTitle,
          jobMode: b.jobMode,
          jobLocation: b.jobMode !== "remote" ? `${b.jobLocationCity}, ${b.jobLocationState}` : undefined,
          timezone: b.timezone,
          shiftFrom: b.shiftFrom,
          shiftTo: b.shiftTo,
          ctcCurrency: b.ctcCurrency,
          annualCtc: b.annualCtc,
          offerLetterUrl,
        }),
      ),
    });
  } catch (err) {
    console.error("[full-time-offer] admin alert failed", err);
  }
  return NextResponse.json({ proposal: { id: proposal.id, status: proposal.status } }, { status: 201 });
}
