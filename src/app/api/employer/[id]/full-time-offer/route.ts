import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { sendSmtpMail } from "@/lib/mailer";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";

const bodySchema = z.object({
  proposalId: z.string().min(1),
  jobTitle: z.string().trim().min(2).max(120),
  jobMode: z.enum(["remote", "hybrid", "onsite"]),
  jobLocationCity: z.string().trim().max(80).default(""),
  jobLocationState: z.string().trim().max(80).default(""),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  shiftFrom: z.string().min(1),
  shiftTo: z.string().min(1),
  ctcCurrency: z.enum(["INR", "USD"]),
  annualCtc: z.number().positive().max(100_000_000),
  /** Key returned by /api/uploads (kind offer_letter). */
  offerLetterKey: z.string().min(10),
});

/**
 * Offer a hired intern a full-time role. Same shape as the legacy route: a new
 * proposal carrying `offerDetails.fullTimeOffer`, which the intern accepts and
 * the employer then pays the hiring fee for at checkout.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const b = parsed.data;
  if (b.jobMode !== "remote" && (!b.jobLocationCity || !b.jobLocationState)) {
    return NextResponse.json({ error: "City and state are needed for onsite or hybrid roles." }, { status: 400 });
  }
  if (!b.offerLetterKey.startsWith(id.replace(/[^a-z0-9_-]/gi, "").slice(0, 32))) {
    return NextResponse.json({ error: "Upload the offer letter again." }, { status: 400 });
  }

  const db = getDb();
  const [[employer], [base]] = await Promise.all([
    db.select().from(schema.employers).where(eq(schema.employers.id, id)).limit(1),
    db.select().from(schema.proposals).where(eq(schema.proposals.id, b.proposalId)).limit(1),
  ]);
  if (!base || base.employerId !== id) return NextResponse.json({ error: "Unknown placement" }, { status: 404 });
  if (base.status !== "hired") return NextResponse.json({ error: "Full-time offers go to interns you've hired." }, { status: 409 });
  if (b.ctcCurrency === "USD" && employer?.internationalFteStatus !== "approved") {
    return NextResponse.json({ error: "USD offers need International FTE approval first." }, { status: 403 });
  }

  const existing = await db
    .select({ offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, id),
        eq(schema.proposals.internId, base.internId),
        inArray(schema.proposals.status, ["draft", "sent", "accepted", "processing", "hired"]),
      ),
    );
  if (existing.some((p) => parseOffer(p.offer, p.currency).fullTime)) {
    return NextResponse.json({ error: "You've already sent this intern a full-time offer." }, { status: 409 });
  }

  const [proposal] = await db
    .insert(schema.proposals)
    .values({
      employerId: id,
      internId: base.internId,
      projectId: base.projectId,
      flowType: base.flowType,
      status: "sent",
      currency: b.ctcCurrency,
      offerDetails: {
        fullTimeOffer: {
          baseProposalId: b.proposalId,
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
          createdAt: new Date().toISOString(),
        },
        currency: b.ctcCurrency,
      },
      skills: base.skills,
      // The assessment the hire was made on travels with the full-time offer
      // (legacy routes.ts:13261).
      aiRatings: base.aiRatings ?? null,
    })
    .returning();

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
    `candidate: ${base.internId}`,
    `proposal: ${proposal.id}`,
    `jobTitle: ${b.jobTitle}`,
    `jobMode: ${b.jobMode}`,
    ...(b.jobMode !== "remote" ? [`jobLocation: ${b.jobLocationCity}, ${b.jobLocationState}`] : []),
    `timezone: ${b.timezone}`,
    `shift: ${b.shiftFrom} - ${b.shiftTo}`,
    `annualCtc: ${b.ctcCurrency} ${b.annualCtc}`,
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
      to: process.env.ADMIN_ALERT_EMAIL ?? "admin@findtern.in",
      subject: `PPO - Full-time offer proposal from ${companyName}`,
      text: summary,
    });
  } catch (err) {
    console.error("[full-time-offer] admin alert failed", err);
  }
  return NextResponse.json({ proposal }, { status: 201 });
}
