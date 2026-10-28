import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";
import { hasOpenOrderFor } from "@/lib/payments";
import { modeProblem, workPreferenceOf } from "@/lib/work-preference";
import {
  hybridDaysOf,
  jdToHtml,
  normalizeLaptop,
  offerScore,
  PAID_LEAVE_OPTIONS,
  parseOffer,
  placeOf,
  scheduledMonthlyHours,
  shiftFields,
  todayIst,
  WEEKLY_SCHEDULES,
  workingDaysPerWeek,
  type WeeklySchedule,
} from "@/lib/offer";

// Same rules as the composer (api/employer/[id]/proposals), field by field.
const offerSchema = z
  .object({
    roleTitle: z.string().trim().min(2).max(120).optional(),
    duration: z.enum(["1m", "2m", "3m", "6m"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01.").optional(),
    weeklySchedule: z.enum(Object.keys(WEEKLY_SCHEDULES) as [WeeklySchedule, ...WeeklySchedule[]]).optional(),
    paidLeavesPerMonth: z
      .number()
      .refine((n) => (PAID_LEAVE_OPTIONS as readonly number[]).includes(n), "Paid leave is 0 to 3 days a month, in half days.")
      .optional(),
    message: z.string().trim().min(1, "Add a job description.").max(4000).optional(),
    mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    officeDays: z.number().int().min(1).max(6).optional(),
    homeDays: z.number().int().min(1).max(6).optional(),
    shiftFrom: z.string().trim().min(1).max(10).optional(),
    shiftTo: z.string().trim().min(1).max(10).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    laptop: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

/** Accepted counts until the employer pays (then it is hired). An offer
 *  waiting on its interview can be edited too (legacy; EMH-30). */
const EDITABLE = ["draft", "sent", "interview_scheduled", "accepted"];

const bodySchema = z.object({ offer: offerSchema }).refine((b) => Object.keys(b.offer).length > 0, {
  message: "Nothing to update",
});

/**
 * Edit a live offer's terms: draft, sent, or accepted but not yet paid for
 * (bug sheet 23 Oct). Editing an accepted offer sends it back to the intern
 * to accept again - they agreed to the old terms, not the new ones. Once it
 * is rejected, paid (hired), withdrawn or expired the terms are history.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid offer" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(schema.proposals)
    .where(eq(schema.proposals.id, id))
    .limit(1);
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role !== "admin" && proposal.employerId !== session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!EDITABLE.includes(proposal.status) || proposal.hiredAt) {
    return NextResponse.json(
      { error: `A ${proposal.status} proposal can no longer be edited` },
      { status: 409 },
    );
  }

  if (proposal.status === "accepted" && (await hasOpenOrderFor(proposal.employerId, proposal.id))) {
    return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
  }

  const current = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const before = parseOffer(current, proposal.currency);
  // A full-time offer is a signed letter, not editable terms (legacy UI).
  if (before.fullTime) {
    return NextResponse.json({ error: "A full-time offer can't be edited. Withdraw it and send a new one." }, { status: 409 });
  }

  const { message, ...edits } = parsed.data.offer;
  // No "candidate's own laptop" for someone without one (EMH-18).
  if (edits.laptop !== undefined && normalizeLaptop(edits.laptop) === "candidate") {
    const [ob] = await db
      .select({ hasLaptop: schema.internOnboarding.hasLaptop })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    if (ob?.hasLaptop === false) {
      return NextResponse.json({ error: "This candidate doesn't have a laptop. The company needs to provide one." }, { status: 400 });
    }
  }
  // A mode the offer already had stays allowed; a change has to fit the candidate.
  if (edits.mode !== undefined && edits.mode !== parseOffer(proposal.offerDetails ?? {}, proposal.currency).mode) {
    const [pref] = await db
      .select({ locationTypes: schema.internOnboarding.locationTypes, preferredLocations: schema.internOnboarding.preferredLocations })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    const modeIssue = modeProblem(workPreferenceOf(pref), edits.mode);
    if (modeIssue) return NextResponse.json({ error: modeIssue }, { status: 400 });
  }
  if (edits.startDate !== undefined && edits.startDate <= todayIst()) {
    return NextResponse.json({ error: "Pick a start date after today." }, { status: 400 });
  }
  // Below a score of 6 an offer runs at most two months (legacy R:14365).
  let score = offerScore(current);
  if (score == null) {
    const [ob] = await db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    score = Number(((ob?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0;
  }
  if (score > 0 && score < 6 && (edits.duration === "3m" || edits.duration === "6m")) {
    return NextResponse.json({ error: "Candidates scoring below 6 can be offered up to 2 months." }, { status: 400 });
  }

  // Paragraph HTML, which legacy pages render (EMH-44); new pages read it back as text.
  const next: Record<string, unknown> = { ...current, ...edits, ...(message !== undefined ? { jd: jdToHtml(message) } : {}) };
  // Legacy rows hold only "City, State" (DB-10): split it so an edit that
  // doesn't touch the place keeps it instead of failing.
  if (next.city === undefined && next.state === undefined) Object.assign(next, placeOf(current));
  if (edits.laptop !== undefined) next.laptop = normalizeLaptop(edits.laptop);
  if (edits.shiftFrom !== undefined || edits.shiftTo !== undefined) {
    Object.assign(next, shiftFields(String(next.shiftFrom ?? ""), String(next.shiftTo ?? "")));
  }
  // Back to the intern: the acceptance was of the old terms.
  const reopen = proposal.status === "accepted";
  if (reopen) {
    delete next.termsAcceptedAt;
    next.reopenedAfterEditAt = new Date().toISOString();
  }
  // Logistics stay coherent with the mode, as the composer writes them.
  const mode = String(next.mode ?? "remote");
  if (mode === "remote") {
    next.location = "Remote";
    delete next.city;
    delete next.state;
    delete next.wfoDays;
    delete next.wfhDays;
    next.workFromOfficeDays = 0;
    next.workFromHomeDays = 0;
  } else {
    if (!String(next.city ?? "").trim() || !String(next.state ?? "").trim()) {
      return NextResponse.json({ error: "An on-site or hybrid role needs a city and state." }, { status: 400 });
    }
    next.location = [next.city, next.state].filter(Boolean).join(", ");
    if (mode === "hybrid") {
      const stored = hybridDaysOf(current);
      const office = edits.officeDays ?? stored.officeDays ?? 0;
      const home = edits.homeDays ?? stored.homeDays ?? 0;
      const week = workingDaysPerWeek(parseOffer(next, proposal.currency).weeklySchedule);
      // Legacy rule (EMH-27): the split covers the working week exactly. An
      // edit that leaves the split and the week alone keeps an older row's.
      const touchesSplit =
        edits.officeDays !== undefined || edits.homeDays !== undefined || edits.weeklySchedule !== undefined || edits.mode !== undefined;
      if (!(office >= 1) || !(home >= 1) || (touchesSplit ? office + home !== week : office + home > 7)) {
        return NextResponse.json(
          { error: `A hybrid role needs office and home days adding up to ${week}, the working days in a week.` },
          { status: 400 },
        );
      }
      // Legacy keys (EMH-02); the older new-app keys go.
      next.workFromOfficeDays = office;
      next.workFromHomeDays = home;
      delete next.wfoDays;
      delete next.wfhDays;
    } else {
      delete next.wfoDays;
      delete next.wfhDays;
      next.workFromOfficeDays = 0;
      next.workFromHomeDays = 0;
    }
  }
  delete next.officeDays;
  delete next.homeDays;

  // Money, as the composer works it out: hours from the schedule less paid
  // leave, times the band rate the offer was priced on. An edit that touches
  // neither keeps the stored hours (legacy rows may predate the schedule).
  const touchesHours = edits.weeklySchedule !== undefined || edits.paidLeavesPerMonth !== undefined;
  // The fee as it stood before the edit: a legacy row has no perHireCharge,
  // and inferring it from the new months and the old total would move it.
  if (before.perHireMinor != null) next.perHireCharge = before.perHireMinor / 100;
  const o = parseOffer(next, proposal.currency);
  if (touchesHours) next.monthlyHours = scheduledMonthlyHours(o.weeklySchedule, o.paidLeavesPerMonth);
  const hours = touchesHours ? Number(next.monthlyHours) : o.monthlyHours;
  const monthlyMinor = o.hourlyRateMinor ? Math.round(hours * o.hourlyRateMinor) : (o.monthlyMinor ?? 0);
  next.monthlyAmount = monthlyMinor / 100;
  next.totalPrice = (monthlyMinor * o.months + (before.perHireMinor ?? 0)) / 100;
  const [updated] = await db
    .update(schema.proposals)
    .set({ offerDetails: next, updatedAt: new Date(), ...(reopen ? { status: "sent" } : {}) })
    // Unchanged since it was read, so an acceptance or a payment in between
    // is never overwritten.
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.status, proposal.status)))
    .returning({ updatedAt: schema.proposals.updatedAt });
  if (!updated) {
    return NextResponse.json({ error: "This offer changed a moment ago. Refresh and try again." }, { status: 409 });
  }

  // Tell the intern to look again (legacy routes.ts:14392). A draft is not
  // visible to them yet, so there is nothing to re-review.
  if (proposal.status === "sent" || proposal.status === "interview_scheduled" || reopen) {
    await notify({
      to: { type: "intern", id: proposal.internId },
      type: "proposal_updated",
      title: reopen ? "Offer changed - accept again" : "Proposal updated",
      message: reopen
        ? "The company changed the offer you accepted. Review the new terms and accept again."
        : "The proposal has been updated, please review.",
      data: { proposalId: id, employerId: proposal.employerId, projectId: proposal.projectId },
      dedupeKey: `proposal_updated:${id}:${updated.updatedAt?.getTime() ?? Date.now()}`,
    });
  }

  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt ?? null });
}
