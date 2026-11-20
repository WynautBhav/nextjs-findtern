import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Clock } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatDate as formatWords, formatMoney, formatSlotTime } from "@/lib/format";
import { interviewStage, meetingTime } from "@/lib/employer-interview-rules";
import { serializeJoinInput } from "@/lib/interview-join";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { fullTimeFeeMinor, hireFeeMinor } from "@/lib/checkout";
import { feeDisplay } from "@/lib/fee-display";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { offerScore, parseOffer } from "@/lib/offer";
import { projectZone, shiftInIst } from "@/lib/timezones";
import type { PlaceOfSupply } from "@/lib/gst";
import { offerBreakdown, offerPlace } from "@/lib/offer-breakdown";
import { ProposalAvatar } from "@/components/employer/proposal-avatar";
import { avatarUrl } from "@/lib/employer-pool";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { buttonClass } from "@/components/ui/button";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";
import { offerState } from "@/components/employer/proposal-state";
import { CgpaNotice, ExpiredNotice } from "@/components/employer/proposal-detail/cgpa-notice";
import { proposalCgpaGate } from "@/lib/cgpa-verification";
import { hasOpenOrderFor } from "@/lib/payments";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { offerTimeline } from "@/components/employer/proposal-timeline";
import { ProposalView } from "./proposal-view";
import { BookMeetingButton } from "@/components/meetings/book-meeting-dialog";
import { workPreferenceOf, type WorkPreference } from "@/lib/work-preference";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

type Proposal = typeof schema.proposals.$inferSelect;

/**
 * One proposal, from the employer's side.
 *
 * The session says who you are; `canAccess` says whether this proposal is
 * yours. Checking only the first is the legacy IDOR. A proposal belonging to
 * another employer is a `notFound()`, not a 403.
 *
 * Layout: the four numbers an employer decides on sit in one strip under the
 * title; the terms follow in the order the candidate reads them; status, the
 * next step and every action stay in the side column. `offerState` is shared
 * with the list, so the two never disagree about what can still be done.
 */
export default async function EmployerProposalDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?edit=1` (the list's Edit button, and old /proposals/:id/edit links) opens the editor. */
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const session = await requireRole("employer");

  let proposal: Proposal | undefined;
  try {
    const [row] = await getDb().select().from(schema.proposals).where(eq(schema.proposals.id, id)).limit(1);
    proposal = row;
  } catch (err) {
    // A real outage is an error page, not a 404 that says the offer is gone.
    console.error("[employer/proposal] load failed", err);
    throw new Error("Couldn't load this proposal. Try again in a moment.");
  }

  if (!proposal || !session || !canAccess(session, proposal.employerId)) notFound();

  // Names are decoration: a missing lookup must not 404 a proposal the
  // employer is entitled to read.
  let internName = "Candidate";
  let initials = "C";
  let unlocked = false;
  let projectName: string | null = null;
  let projectTimezone: string | null = null;
  let projectDown: { id: string; reason: string | null } | null = null;
  let preference: WorkPreference = { modes: [], cities: [] };
  let hasLaptop: boolean | null = null;
  // Read server-side only to derive the CGPA gate; the intern's data never goes to the page.
  let internExtra: unknown = null;
  let photoUrl: string | null = null;
  let presence: PresenceLabel | null = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        projectName: schema.projects.projectName,
        projectTimezone: schema.projects.timezone,
        projectId: schema.projects.id,
        takenDownAt: schema.projects.takenDownAt,
        takenDownReason: schema.projects.takenDownReason,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.proposals.internId, schema.users.id))
      .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
      .where(eq(schema.proposals.id, proposal.id))
      .limit(1);
    if (row) {
      const first = (row.firstName || "").trim();
      const last = (row.lastName || "").trim();
      const ini = initialsOf(first, last);
      initials = ini === "?" ? "C" : ini;
      // Unmasked once this employer hired them on any project.
      unlocked = (await hiredInternIds(db, proposal.employerId)).has(proposal.internId);
      internName = unlocked ? `${first} ${last}`.trim() || "Candidate" : ini === "?" ? "Candidate" : `Candidate ${ini}`;
    }
    projectName = row?.projectName ?? null;
    projectTimezone = row?.projectTimezone ?? null;
    projectDown = row?.takenDownAt && row.projectId ? { id: row.projectId, reason: row.takenDownReason } : null;
    const [pref] = await db
      .select({
        locationTypes: schema.internOnboarding.locationTypes,
        preferredLocations: schema.internOnboarding.preferredLocations,
        hasLaptop: schema.internOnboarding.hasLaptop,
        extraData: schema.internOnboarding.extraData,
      })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    preference = workPreferenceOf(pref, Number(((pref?.extraData ?? {}) as Record<string, unknown>).findternScore ?? 0) || 0);
    hasLaptop = typeof pref?.hasLaptop === "boolean" ? pref.hasLaptop : null;
    internExtra = pref?.extraData ?? null;
    // Photo and presence show before hire (owner call, 6 Nov); the name stays initials.
    const [doc] = await db
      .select({ userId: schema.internDocuments.userId })
      .from(schema.internDocuments)
      .where(and(eq(schema.internDocuments.userId, proposal.internId), isNotNull(schema.internDocuments.profilePhotoName)))
      .limit(1);
    photoUrl = doc ? avatarUrl(proposal.internId) : null;
    presence = (await presenceOf([proposal.internId]))[proposal.internId] ?? null;
  } catch (err) {
    console.error("[employer/proposal] names", err);
  }

  // The booked interview with this candidate that is still ahead or running, so it can be joined from here (bug sheet 12 Nov, row 12).
  let interview: typeof schema.interviews.$inferSelect | null = null;
  try {
    const rows = await getDb()
      .select()
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.employerId, proposal.employerId),
          eq(schema.interviews.internId, proposal.internId),
          eq(schema.interviews.status, "scheduled"),
        ),
      )
      .orderBy(desc(schema.interviews.createdAt));
    interview =
      rows.find(
        (iv) =>
          (!iv.projectId || !proposal.projectId || iv.projectId === proposal.projectId) && ["upcoming", "live"].includes(interviewStage(iv)),
      ) ?? null;
  } catch (err) {
    console.error("[employer/proposal] interview", err);
  }

  const raw = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const offer = parseOffer(raw, proposal.currency);
  const currency = offer.currency;
  // Where the company is taxed, for the GST inside the monthly amount. If the
  // profile can't be read the GST line is left out, never guessed.
  let place: PlaceOfSupply | null = null;
  try {
    const [employer] = await getDb().select().from(schema.employers).where(eq(schema.employers.id, proposal.employerId)).limit(1);
    place = offerPlace(employer, currency);
  } catch (err) {
    console.error("[employer/proposal] tax place", err);
  }
  // Findtern took the project down: the offer is view only (no pay, edit, withdraw or message).
  // An open payment order freezes expiry; the CGPA check blocks payment until Findtern confirms it (or a correction is confirmed).
  const hasOpenOrder = await hasOpenOrderFor(proposal.employerId, proposal.id).catch(() => false);
  const gate = proposalCgpaGate({ status: proposal.status, extraData: internExtra, offerDetails: proposal.offerDetails, updatedAt: proposal.updatedAt });
  const baseState = offerState({ ...proposal, hasOpenOrder, gate }, offer);
  const state = projectDown ? { ...baseState, canPay: false, canEdit: false, canWithdraw: false, canSendNew: false } : baseState;
  const confirmingCgpa = !projectDown && state.gate?.state === "incorrect_unacked";
  // An expired offer: start again with the same candidate and project.
  const sendNewHref = state.canSendNew ? `/employer/send-proposal?intern=${encodeURIComponent(proposal.internId)}${proposal.projectId ? `&project=${encodeURIComponent(proposal.projectId)}` : ""}` : null;
  const skills = Array.isArray(proposal.skills) ? proposal.skills.filter(Boolean) : [];
  const snapshot = Object.entries(proposal.aiRatings ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[0] !== "overall",
  );
  const score = offerScore(raw) ?? 0;
  // The hiring fee as it is charged now: the offer's amount if its band is switched on, else none. A hire
  // already made keeps the fee it paid (the stored one), so the setting never rewrites a settled order.
  const shownFeeMinor = proposal.status === "hired" ? offer.perHireMinor : hireFeeMinor(offer, { feeSetting: await getPerHireFeeSetting(), bandScore: score });
  // Struck-through "(FREE)" only on an offer still to be paid, where billing re-decides the fee from the live
  // setting (shownFeeMinor is that same figure). A settled hire or a closed offer shows what was charged, or nothing.
  const feeStillToPay = ["draft", "sent", "interview_scheduled", "accepted", "processing"].includes(proposal.status);
  const fee = feeDisplay({
    currency,
    chargedMinor: shownFeeMinor ?? 0,
    listMinor: hireFeeMinor(offer),
    applicable: !offer.fullTime && ((shownFeeMinor ?? 0) > 0 || feeStillToPay),
  });
  // The score shown is the one the offer was priced on, so it can never
  // disagree with the rate beside it.
  const ratings: [string, number][] = score > 0 ? [["overall", score], ...snapshot] : snapshot;
  const flexible = offer.shiftFrom === "flexible" || !offer.shiftFrom;
  const ist = flexible ? null : shiftInIst(offer.shiftFrom, offer.shiftTo, offer.timezone, offer.startDate);
  const ft = offer.fullTime;
  // "Free" only for a real zero (fee-only band stores hourly 0); a missing value stays "-".
  const monthlyFree = offer.monthlyMinor === 0 || (offer.monthlyMinor == null && offer.hourlyRateMinor === 0);

  const strip: [string, string][] = ft
    ? [
        ["Annual CTC", ft.annualCtcMinor ? formatMoney(ft.annualCtcMinor, currency) : "-"],
        ["Hiring fee", ft.annualCtcMinor ? formatMoney(fullTimeFeeMinor(ft.annualCtcMinor), currency) : "-"],
        ["Joining", formatDate(offer.startDate)],
        ["Type", "Full-time"],
      ]
    : [
        // One month's amount only (client QA) - no monthly × months total.
        ["Monthly", offer.monthlyMinor ? formatMoney(offer.monthlyMinor, currency) : monthlyFree ? "Free" : "-"],
        ["Hours a month", offer.monthlyHours ? `${offer.monthlyHours} h` : "-"],
        ["Starts", formatDate(offer.startDate)],
        ["Length", `${offer.months} month${offer.months === 1 ? "" : "s"}`],
      ];

  const breakdown = offerBreakdown({
    currency,
    hourlyRateMinor: offer.hourlyRateMinor,
    hours: offer.monthlyHours,
    monthlyMinor: offer.monthlyMinor,
    fee,
    place,
  });

  // An expired offer ends the timeline at its closed step, like an unanswered one.
  const timeline = offerTimeline(proposal, { startDate: offer.startDate, fullTime: Boolean(ft) }, { label: state.label, lapsed: state.lapsed || state.expiredReason === "unpaid_past_start" }, formatDate).map((step) =>
    // While Findtern confirms the CGPA the next step is not yours yet.
    state.verifying && /^You pay/.test(step.label) ? { ...step, label: state.gate?.state === "incorrect_unacked" ? "You confirm the CGPA, then pay" : "Findtern confirms the CGPA, then you pay" } : step,
  );
  const profileHref = `/employer/intern/${encodeURIComponent(proposal.internId)}`;

  const hasActions = state.canWithdraw || state.canEdit || proposal.status === "hired";
  const actionsBody = (
    <>
      {state.canEdit ? (
        <ProposalOfferForm
          proposalId={proposal.id}
          defaultOpen={edit === "1"}
          accepted={proposal.status === "accepted"}
          preference={preference}
          currency={currency}
          place={place}
          perHireMinor={shownFeeMinor}
          fee={fee}
          projectTimezone={projectTimezone}
          shortOnly={score > 0 && score < 6}
          hasLaptop={hasLaptop}
          initial={{
            roleTitle: offer.roleTitle,
            duration: offer.duration,
            startDate: offer.startDate ?? undefined,
            weeklySchedule: offer.weeklySchedule,
            hourlyRateMinor: offer.hourlyRateMinor,
            paidLeavesPerMonth: offer.paidLeavesPerMonth,
            message: offer.jd,
            additionalInfo: offer.additionalInfo,
            mode: offer.mode,
            city: offer.city,
            state: offer.state,
            officeDays: offer.officeDays ?? undefined,
            homeDays: offer.homeDays ?? undefined,
            shiftFrom: offer.shiftFrom,
            shiftTo: offer.shiftTo,
            timezone: offer.timezone,
            laptop: offer.laptop,
          }}
        />
      ) : null}
      <ProposalActions
        proposalId={proposal.id}
        status={proposal.status}
        canPay={false}
        canWithdraw={state.canWithdraw}
        {...(confirmingCgpa ? { withdrawLabel: "Withdraw proposal", withdrawSecondary: true } : {})}
      />
      {proposal.status === "hired" && !ft ? (
        <Link href="/employer/timesheets" className={buttonClass({ variant: "outline", block: true })}>
          <Clock className="size-4" aria-hidden />
          Timesheets
        </Link>
      ) : null}
    </>
  );

  return (
    <ProposalView
      proposalId={proposal.id}
      avatar={<ProposalAvatar photoUrl={photoUrl} initials={initials} presence={presence} />}
      internName={internName}
      profileHref={profileHref}
      projectName={projectName}
      title={offer.roleTitle || projectName || "Proposal"}
      state={state}
      offer={offer}
      score={score}
      strip={strip}
      breakdownLines={breakdown.lines}
      flexible={flexible}
      ist={ist}
      skills={skills}
      ratings={ratings}
      timeline={timeline}
      sendNewHref={sendNewHref}
      bookMeeting={
        projectDown ? null : (
          <BookMeetingButton internId={proposal.internId} projectId={proposal.projectId} projectName={projectName} candidateLabel={internName} meetingOpen={Boolean(interview)} className="max-sm:w-full" />
        )
      }
      takedown={projectDown ? <TakedownBanner projects={[{ id: projectDown.id, name: projectName ?? "This project", reason: projectDown.reason }]} /> : null}
      notices={
        <>
          <CgpaNotice proposalId={proposal.id} state={state} canConfirm={confirmingCgpa} />
          <ExpiredNotice state={state} />
        </>
      }
      interview={
        interview
          ? {
              when: formatSlotTime(new Date(meetingTime(interview) ?? 0), projectZone(projectTimezone, interview.timezone)),
              join: (
                <JoinMeetingButton interviewId={interview.id} link={interview.meetingLink} ready={Boolean(interview.meetingLink)} variant="outline" interview={serializeJoinInput(interview)} serverNow={new Date().toISOString()} zone={projectZone(projectTimezone, interview.timezone)} />
              ),
            }
          : null
      }
      actions={hasActions ? { heading: proposal.status === "hired" ? "Hire" : state.expiredReason ? "Close this offer" : "Change this offer", body: actionsBody } : null}
    />
  );
}

/** "1 Dec 2026", in India time (S6). */
function formatDate(value: Date | string | null): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatWords(d);
}

