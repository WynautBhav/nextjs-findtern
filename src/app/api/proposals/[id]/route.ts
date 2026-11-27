import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { discountedMonthlyMinor } from "@/lib/college/drive-pricing";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProposalActionable } from "@/lib/projects/takedown-guard-server";
import { notify } from "@/lib/notify";
import { fullTimeEdit, fullTimeTermsProblem, offerLetterKeyProblem } from "@/lib/full-time-offer-terms";
import { proposalActionRefusal } from "@/lib/proposal-permissions";
import { expiryOf } from "@/lib/proposal-expiry";
import { learnField } from "@/lib/proposal-copy";
import { projectZone } from "@/lib/timezones";
import { hasOpenOrderFor } from "@/lib/payments";
import { withLock, type Tx } from "@/lib/advisory-lock";
import { openOrderProposalIds } from "@/lib/employer-payable";
import { takedownBlock } from "@/lib/projects/takedown";
import { modeProblem, workPreferenceOf } from "@/lib/work-preference";
import {
  carryPricingSnapshot,
  hybridDaysOf,
  jdToHtml,
  normalizeLaptop,
  offerScore,
  offerEditTermIssues,
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
    roleTitle: z.string().trim().min(2, "Enter a role title of at least 2 characters.").max(120, "Keep the role title under 120 characters.").optional(),
    duration: z.enum(["1m", "2m", "3m", "6m"], "Pick a duration of 1, 2, 3 or 6 months.").optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01.").optional(),
    weeklySchedule: z.enum(Object.keys(WEEKLY_SCHEDULES) as [WeeklySchedule, ...WeeklySchedule[]]).optional(),
    paidLeavesPerMonth: z
      .number()
      .refine((n) => (PAID_LEAVE_OPTIONS as readonly number[]).includes(n), "Paid leave is 0 to 3 days a month, in half days.")
      .optional(),
    message: z.string().trim().min(1, "Add a job description.").max(4000, "Keep the job description under 4000 characters.").optional(),
    // What the intern will learn stays mandatory: optional here (left alone when absent) but never blank.
    additionalInfo: learnField.optional(),
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

/** An internship offer's terms (`offer`) or a full-time offer's (`fullTimeOffer`), never both. */
const bodySchema = z
  .object({ offer: offerSchema.optional(), fullTimeOffer: fullTimeEdit.optional() })
  .refine((b) => (b.offer ? 1 : 0) + (b.fullTimeOffer ? 1 : 0) === 1 && Object.keys(b.offer ?? b.fullTimeOffer ?? {}).length > 0, { message: "Nothing to update" });

/**
 * Edit a live offer's terms. Who may, and in which state, is proposal-permissions.ts (the one table): the employer while
 * the offer is unanswered (draft, sent, interview booked), an internship or a full-time offer alike; once the candidate
 * accepts, only Findtern (27 Nov). Editing an accepted offer (admin) sends it back to the intern to accept again - they
 * agreed to the old terms, not the new ones. Rejected, paid (hired), withdrawn or expired: the terms are history.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;
  // Before the body is read: an offer on a taken-down project answers 409 whatever the request says.
  if (session.role === "employer") {
    const td = await assertProposalActionable((await ctx.params).id, session.uid);
    if (!td.ok) return td.response;
  }

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
  const current = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const before = parseOffer(current, proposal.currency);
  const refusal = proposalActionRefusal("edit", session.role === "admin" ? "admin" : "employer", {
    status: proposal.status,
    hiredAt: proposal.hiredAt,
    fullTime: Boolean(before.fullTime),
    expired: expiryOf(proposal).expired,
  });
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  if (proposal.status === "accepted" && (await hasOpenOrderFor(proposal.employerId, proposal.id))) {
    return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
  }

  // Editing an accepted offer sends it back to the intern as `sent`. On a taken-down listing that
  // would bring back an offer the takedown froze (the intern could not accept it anyway).
  if (proposal.status === "accepted" && proposal.projectId) {
    const [project] = await db
      .select({ takenDownAt: schema.projects.takenDownAt })
      .from(schema.projects)
      .where(eq(schema.projects.id, proposal.projectId))
      .limit(1);
    const blocked = takedownBlock(project, "send");
    if (blocked) return NextResponse.json({ error: blocked, code: "listing_taken_down" }, { status: 409 });
  }

  if (Boolean(before.fullTime) !== Boolean(parsed.data.fullTimeOffer)) {
    return NextResponse.json({ error: before.fullTime ? "This is a full-time offer. Edit its full-time terms." : "This is an internship offer." }, { status: 400 });
  }
  if (parsed.data.fullTimeOffer) return editFullTime({ proposal, current, edits: parsed.data.fullTimeOffer, employerId: proposal.employerId });

  const { message, ...edits } = parsed.data.offer!;
  // The offer's zone is the project's (feedback sheet 2, row 7): an edit cannot move it elsewhere.
  if (edits.timezone !== undefined && proposal.projectId) {
    const [pz] = await db
      .select({ timezone: schema.projects.timezone })
      .from(schema.projects)
      .where(eq(schema.projects.id, proposal.projectId))
      .limit(1);
    if (pz?.timezone) edits.timezone = projectZone(pz.timezone, edits.timezone);
  }
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
      .select({
        locationTypes: schema.internOnboarding.locationTypes,
        preferredLocations: schema.internOnboarding.preferredLocations,
        extraData: schema.internOnboarding.extraData,
      })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    // The score the offer was priced on decides the band, so a later change to the candidate's score
    // cannot turn a free-rate offer into an on-site one (or block an honest edit).
    const liveScore = Number(((pref?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0;
    const modeIssue = modeProblem(workPreferenceOf(pref, offerScore(current) ?? liveScore), edits.mode);
    if (modeIssue) return NextResponse.json({ error: modeIssue }, { status: 400 });
  }
  // Judge only what this edit changes (legacy offers may not meet today's rules); same checks as the composer.
  // A changed start date is measured from now (the edit time); one left as it was is not judged against the lead.
  const termIssue = offerEditTermIssues(
    edits,
    {
      startDate: before.startDate,
      timezone: current.timezone,
      shiftFrom: current.shiftFrom,
      shiftTo: current.shiftTo,
    },
    new Date(),
  )[0];
  if (termIssue) return NextResponse.json({ error: termIssue.message }, { status: 400 });
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
  // The stipend and hiring fee the offer was sent with stay as they were: a rate-card edit since never reprices it.
  carryPricingSnapshot(current, next);
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
  // A campus drive offer keeps its drive discount (stamped when sent, read from the stored offer, never from the edit).
  const drivePct = parseOffer(current, proposal.currency).driveDiscountPercent;
  delete next.driveDiscountPercent;
  delete next.listMonthlyAmount;
  const listMonthlyMinor = o.hourlyRateMinor ? Math.round(hours * o.hourlyRateMinor) : null;
  const monthlyMinor = listMonthlyMinor === null ? (o.monthlyMinor ?? 0) : drivePct > 0 ? discountedMonthlyMinor(listMonthlyMinor, drivePct) : listMonthlyMinor;
  if (drivePct > 0) {
    next.driveDiscountPercent = drivePct;
    if (listMonthlyMinor !== null) next.listMonthlyAmount = listMonthlyMinor / 100;
    else if (current.listMonthlyAmount !== undefined) next.listMonthlyAmount = current.listMonthlyAmount;
  }
  next.monthlyAmount = monthlyMinor / 100;
  next.totalPrice = (monthlyMinor * o.months + (before.perHireMinor ?? 0)) / 100;
  // Reopening an accepted offer runs under the order route's lock (`employer-pay:<id>`), with the open-order check re-read
  // inside it: an order opened in another tab either committed first (seen here, refused) or waits and then finds the
  // offer back at `sent` (its own re-check refuses). Never an order on an offer that is no longer accepted.
  const write = async (tx: Tx) => {
    if (reopen && (await openOrderProposalIds(tx, proposal.employerId)).has(proposal.id)) return "paying" as const;
    const [row] = await tx
      .update(schema.proposals)
      .set({ offerDetails: next, updatedAt: new Date(), ...(reopen ? { status: "sent" } : {}) })
      // Unchanged since it was read, so an acceptance or a payment in between
      // is never overwritten.
      .where(and(eq(schema.proposals.id, id), eq(schema.proposals.status, proposal.status)))
      .returning({ updatedAt: schema.proposals.updatedAt });
    return row;
  };
  const updated = reopen ? await withLock(`employer-pay:${proposal.employerId}`, write) : await db.transaction(write);
  if (updated === "paying") {
    return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
  }
  if (!updated) {
    return NextResponse.json({ error: "This offer changed a moment ago. Refresh and try again." }, { status: 409 });
  }

  await tellInternToReview(proposal, updated.updatedAt, reopen);

  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt ?? null });
}

type ProposalRow = typeof schema.proposals.$inferSelect;

/** Tell the intern to look again (legacy routes.ts:14392). A draft is not visible to them yet, so there is nothing to re-review. */
async function tellInternToReview(proposal: ProposalRow, updatedAt: Date | null, reopen: boolean) {
  if (!(proposal.status === "sent" || proposal.status === "interview_scheduled" || reopen)) return;
  await notify({
    to: { type: "intern", id: proposal.internId },
    type: "proposal_updated",
    title: reopen ? "Offer changed - accept again" : "Proposal updated",
    message: reopen
      ? "The company changed the offer you accepted. Review the new terms and accept again."
      : "The proposal has been updated, please review.",
    data: { proposalId: proposal.id, employerId: proposal.employerId, projectId: proposal.projectId },
    dedupeKey: `proposal_updated:${proposal.id}:${updatedAt?.getTime() ?? Date.now()}`,
  });
}

/**
 * A full-time offer's terms: the same fields the send form has (full-time-offer-terms.ts), judged the same way, on the
 * stored `fullTimeOffer`. What is left out stays. The fee rate, drive and base placement are server-stamped and never read from the body.
 * Only reached once proposalActionRefusal has let the edit through (unanswered offers).
 */
async function editFullTime({ proposal, current, edits, employerId }: { proposal: ProposalRow; current: Record<string, unknown>; edits: z.infer<typeof fullTimeEdit>; employerId: string }) {
  const { offerLetterKey, ...terms } = edits;
  const was = (current.fullTimeOffer ?? {}) as Record<string, unknown>;
  const mode = terms.jobMode ?? String(was.jobMode ?? "remote");
  const remote = mode === "remote";
  const city = remote ? "" : (terms.jobLocationCity ?? String(was.jobLocationCity ?? ""));
  const state = remote ? "" : (terms.jobLocationState ?? String(was.jobLocationState ?? ""));
  // A joining date left as it was is not held to today's lead (it was valid when sent).
  const problem =
    fullTimeTermsProblem({ jobMode: mode, jobLocationCity: city, jobLocationState: state, startDate: terms.startDate }, new Date(), terms.startDate !== was.startDate) ??
    (offerLetterKey === undefined ? null : offerLetterKeyProblem(offerLetterKey, employerId));
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const ft: Record<string, unknown> = { ...was, ...terms, ...(offerLetterKey ? { offerLetterKey } : {}), jobMode: mode, jobLocationCity: city, jobLocationState: state, updatedAt: new Date().toISOString() };
  // A stored minor-unit figure (older rows) would outrank the edited CTC when the offer is read.
  if (terms.annualCtc !== undefined) delete ft.annualCtcMinor;
  const [row] = await getDb()
    .update(schema.proposals)
    .set({ offerDetails: { ...current, fullTimeOffer: ft }, updatedAt: new Date() })
    // Unchanged since it was read, so an acceptance in between is never overwritten.
    .where(and(eq(schema.proposals.id, proposal.id), eq(schema.proposals.status, proposal.status)))
    .returning({ updatedAt: schema.proposals.updatedAt });
  if (!row) return NextResponse.json({ error: "This offer changed a moment ago. Refresh and try again." }, { status: 409 });
  await tellInternToReview(proposal, row.updatedAt, false);
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt });
}
