import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";
import { offerScore, parseOffer, todayIst } from "@/lib/offer";

// Same rules as the composer (api/employer/[id]/proposals), field by field.
const offerSchema = z
  .object({
    roleTitle: z.string().trim().min(2).max(120).optional(),
    duration: z.enum(["1m", "2m", "3m", "6m"]).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01.").optional(),
    monthlyHours: z.number().int().min(1).max(300).optional(),
    /** Employer's own monthly figure, major units. */
    monthlyAmount: z.number().positive().max(10_000_000).optional(),
    paidLeavesPerMonth: z.number().int().min(0).max(10).optional(),
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

const bodySchema = z.object({ offer: offerSchema }).refine((b) => Object.keys(b.offer).length > 0, {
  message: "Nothing to update",
});

/**
 * Edit a live offer's terms. Draft / sent only - once the intern responds
 * (accepted / rejected) or the trail closes (hired / withdrawn / expired),
 * the terms are history and editing them would rewrite what both sides saw.
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
  if (!["draft", "sent"].includes(proposal.status)) {
    return NextResponse.json(
      { error: `A ${proposal.status} proposal can no longer be edited` },
      { status: 409 },
    );
  }

  const current = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const before = parseOffer(current, proposal.currency);
  // A full-time offer is a signed letter, not editable terms (legacy UI).
  if (before.fullTime) {
    return NextResponse.json({ error: "A full-time offer can't be edited. Withdraw it and send a new one." }, { status: 409 });
  }

  const { message, monthlyAmount, ...edits } = parsed.data.offer;
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

  const next: Record<string, unknown> = { ...current, ...edits, ...(message !== undefined ? { jd: message } : {}) };
  // Logistics stay coherent with the mode, as the composer writes them.
  const mode = String(next.mode ?? "remote");
  if (mode === "remote") {
    next.location = "Remote";
    delete next.city;
    delete next.state;
    delete next.wfoDays;
    delete next.wfhDays;
  } else {
    if (!String(next.city ?? "").trim() || !String(next.state ?? "").trim()) {
      return NextResponse.json({ error: "An on-site or hybrid role needs a city and state." }, { status: 400 });
    }
    next.location = [next.city, next.state].filter(Boolean).join(", ");
    if (mode === "hybrid") {
      const office = edits.officeDays ?? Number(current.wfoDays ?? 0);
      const home = edits.homeDays ?? Number(current.wfhDays ?? 0);
      if (!(office >= 1) || !(home >= 1) || office + home > 7) {
        return NextResponse.json({ error: "A hybrid role needs office and home days that fit in a week." }, { status: 400 });
      }
      next.wfoDays = office;
      next.wfhDays = home;
    } else {
      delete next.wfoDays;
      delete next.wfhDays;
    }
  }
  delete next.officeDays;
  delete next.homeDays;

  // Money: an explicit monthly figure wins. Otherwise a figure the employer
  // typed before (not hours × rate) is kept as typed; a derived one follows
  // the new hours.
  const o = parseOffer(next, proposal.currency);
  const derivedBefore = before.hourlyRateMinor ? Math.round(before.monthlyHours * before.hourlyRateMinor) : null;
  const wasCustom = before.monthlyMinor != null && derivedBefore != null && before.monthlyMinor !== derivedBefore;
  const monthlyMinor =
    monthlyAmount !== undefined
      ? Math.round(monthlyAmount * 100)
      : wasCustom
        ? (before.monthlyMinor ?? 0)
        : o.hourlyRateMinor
          ? Math.round(o.monthlyHours * o.hourlyRateMinor)
          : (o.monthlyMinor ?? 0);
  next.monthlyAmount = monthlyMinor / 100;
  next.totalPrice = (monthlyMinor * o.months + (o.perHireMinor ?? 0)) / 100;
  const [updated] = await db
    .update(schema.proposals)
    .set({ offerDetails: next, updatedAt: new Date() })
    // Still unanswered at write time, so an acceptance can't be overwritten.
    .where(and(eq(schema.proposals.id, id), inArray(schema.proposals.status, ["draft", "sent"])))
    .returning({ updatedAt: schema.proposals.updatedAt });
  if (!updated) {
    return NextResponse.json({ error: "The candidate has already answered this offer." }, { status: 409 });
  }

  // Tell the intern to look again (legacy routes.ts:14392). A draft is not
  // visible to them yet, so there is nothing to re-review.
  if (proposal.status === "sent") {
    await notify({
      to: { type: "intern", id: proposal.internId },
      type: "proposal_updated",
      title: "Proposal updated",
      message: "The proposal has been updated, please review.",
      data: { proposalId: id, employerId: proposal.employerId, projectId: proposal.projectId },
      dedupeKey: `proposal_updated:${id}:${updated.updatedAt?.getTime() ?? Date.now()}`,
    });
  }

  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt ?? null });
}
