import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { ArrowLeft, ChevronDown, Clock, CreditCard, Download, Send } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatDate as formatWords, formatMoney, formatSlotTime } from "@/lib/format";
import { interviewStage, meetingTime } from "@/lib/employer-interview-rules";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { fullTimeFeeMinor, hireFeeMinor } from "@/lib/checkout";
import { feeDisplay } from "@/lib/fee-display";
import { getPerHireFeeSetting } from "@/lib/platform-settings";
import { laptopLabel, offerScore, parseOffer, WEEKLY_SCHEDULES } from "@/lib/offer";
import { projectZone, shiftInIst } from "@/lib/timezones";
import type { PlaceOfSupply } from "@/lib/gst";
import { offerBreakdown, offerPlace } from "@/lib/offer-breakdown";
import { OfferBreakdownList } from "@/components/employer/offer-breakdown-list";
import { DetailRow, Pill } from "@/components/app/primitives";
import { LeadStat, Section, StatList, Overview } from "@/components/app/stat";
import { RollingNumber } from "@/components/app/rolling-number";
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
import { stageTrail } from "@/components/employer/proposal-trail";
import { MoneyLedger, type LedgerRow } from "@/components/employer/proposal-detail/money-ledger";
import { btnOutline } from "@/components/employer/proposal-ui";
import { MeetingRulesList } from "@/components/employer/meeting-rules";
import { workPreferenceOf, type WorkPreference } from "@/lib/work-preference";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

type Proposal = typeof schema.proposals.$inferSelect;

const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

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

  const breakdown = offerBreakdown({
    currency,
    hourlyRateMinor: offer.hourlyRateMinor,
    hours: offer.monthlyHours,
    monthlyMinor: offer.monthlyMinor,
    fee,
    place,
  });

  const profileHref = `/employer/intern/${encodeURIComponent(proposal.internId)}`;
  const closedOffer = state.bucket === "closed";
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  // The statement the page opens with: where this offer stands, in one line.
  const headline =
    proposal.status === "hired"
      ? `${internName} is hired`
      : state.canPay
        ? `${internName} accepted your offer`
        : state.verifying
          ? `${internName} accepted. Their CGPA is being confirmed`
          : proposal.status === "processing"
            ? `Payment for ${internName} is in progress`
            : state.bucket === "open"
              ? `Waiting for ${internName} to answer`
              : proposal.status === "draft"
                ? `Draft offer for ${internName}`
                : state.canSendNew
                  ? `This offer to ${internName} expired`
                  : proposal.status === "rejected"
                    ? `${internName} declined`
                    : proposal.status === "withdrawn"
                      ? "You withdrew this offer"
                      : `${internName}: ${state.label}`;
  // Amber is for what the employer owes or must confirm; waiting on the candidate is neutral; Hired is green.
  const statusTone = proposal.status === "hired" ? "live" : state.canPay || confirmingCgpa ? "waiting" : closedOffer ? "closed" : "neutral";

  // The lead figure and the three quiet ones beside it (one lead per page, never a row of equal tiles).
  const priceMinor = ft ? ft.annualCtcMinor : offer.monthlyMinor;
  const leadValue = priceMinor ? (
    currency.toUpperCase() === "INR" ? <RollingNumber value={priceMinor / 100} currency="INR" /> : formatMoney(priceMinor, currency)
  ) : monthlyFree && !ft ? (
    "Free"
  ) : (
    "-"
  );
  const rateLine = breakdown.lines.find((l) => l.key === "rate");
  const facts = ft
    ? [
        { label: "Hiring fee", value: ft.annualCtcMinor ? formatMoney(fullTimeFeeMinor(ft.annualCtcMinor), currency) : "-", hint: "8.33% of CTC, separate from it" },
        { label: "Joining", value: formatDate(offer.startDate) },
        { label: "Type", value: "Full-time" },
      ]
    : [
        { label: "Hours a month", value: offer.monthlyHours ? `${offer.monthlyHours} h` : "-" },
        { label: "Starts", value: formatDate(offer.startDate) },
        { label: "Length", value: plural(offer.months, "month") },
      ];

  // The money trail: one row per stage, the rupees where they move. Only dates the rows hold are printed.
  const trail = stageTrail(proposal, { startDate: offer.startDate }, { closed: closedOffer, acceptedBeforeClose: closedOffer && state.expiredReason === "unpaid_past_start" }, formatDate);
  const priceText = priceMinor ? formatMoney(priceMinor, currency) : null;
  const ledger: LedgerRow[] = [];
  for (const t of trail) {
    // A closed offer's trail stops where it stopped: the stages that never happened are not listed.
    if (closedOffer && (t.key === "paid" || t.key === "starts" || (t.key === "accepted" && t.state === "closed"))) continue;
    if (t.key === "sent") {
      ledger.push({
        key: t.key,
        state: t.state,
        date: t.date,
        title: "Offer sent",
        detail: `${offer.roleTitle || projectName || "Internship"}${proposal.status === "interview_scheduled" ? ". Interview booked." : ""}`,
        amount: priceText,
        amountNote: ft ? "a year" : "a month",
      });
    } else if (t.key === "accepted") {
      ledger.push({ key: t.key, state: t.state, date: null, title: t.state === "done" ? `Accepted by ${internName}` : `${internName} decides`, detail: t.state === "current" ? "They can accept until the start date." : undefined });
    } else if (t.key === "paid") {
      const feeRow =
        ft?.annualCtcMinor
          ? { amount: formatMoney(fullTimeFeeMinor(ft.annualCtcMinor), currency), amountNote: "hiring fee" }
          : fee.kind === "charged"
            ? { amount: formatMoney(fee.amountMinor, currency), amountNote: "hiring fee, one-time" }
            : fee.kind === "free"
              ? { struck: formatMoney(fee.listMinor, currency), amount: "Free", amountNote: "hiring fee, one-time" }
              : {};
      ledger.push({
        key: t.key,
        state: t.state,
        date: t.date,
        title:
          t.state === "done"
            ? "Paid, hire confirmed"
            : proposal.status === "processing"
              ? "Payment in progress"
              : state.verifying
                ? confirmingCgpa
                  ? "You confirm the CGPA, then pay"
                  : "Findtern confirms the CGPA, then you pay"
                : ft
                  ? "You pay the hiring fee"
                  : "You pay to confirm the hire",
        detail: t.state === "done" ? "The candidate's name and contact details are visible to you." : t.state === "current" && state.canPay ? "Names and contact details unlock once it is paid." : undefined,
        ...feeRow,
      });
    } else {
      ledger.push({
        key: t.key,
        state: t.state,
        date: t.date,
        title: ft ? (t.label === "Started" ? "Joined" : "Joins") : t.label,
        detail: ft ? undefined : `${plural(offer.months, "month")} from this day, billed monthly. Timesheets run monthly.`,
      });
    }
  }
  if (closedOffer) {
    ledger.push({ key: "closed", state: "closed", date: !state.lapsed && proposal.updatedAt ? formatDate(proposal.updatedAt) : null, title: state.label, detail: state.next || undefined });
  }

  const ratingRows = (
    <dl className="divide-y divide-ink-200">
      {ratings.map(([key, value]) => (
        <DetailRow key={key} label={key === "overall" ? "Findtern Score" : humanizeKey(key)} value={`${value}/10`} mono />
      ))}
    </dl>
  );
  // Who the offer is for: on a desktop in the side column, on a phone after the terms.
  const candidateInfo = (
    <>
      <Section title="Candidate">
        <div className="flex items-center gap-3">
          <ProposalAvatar photoUrl={photoUrl} initials={initials} presence={presence} className="size-12" />
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-ink-900">{internName}</p>
            <p className="nums text-sm text-ink-700">{score > 0 ? `${score.toFixed(1)} Findtern Score` : "Not scored"}</p>
          </div>
        </div>
        <Link
          href={profileHref}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 outline-none hover:decoration-brand-700 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-700"
        >
          View profile
        </Link>
      </Section>
      {ratings.length > 0 ? (
        <Section title="Assessment at sending">{ratingRows}</Section>
      ) : null}
    </>
  );

  const nextStepTitle = proposal.status === "hired" ? "Hire" : state.expiredReason ? "Close this offer" : state.canPay || state.canSendNew || confirmingCgpa ? "Your move" : "This offer";
  const actionsNeeded = state.canPay || Boolean(sendNewHref) || state.canEdit || state.canWithdraw || proposal.status === "hired";

  return (
    <div className="pb-20 lg:pb-0">
      <Link
        href="/employer/proposals"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-brand-800 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      {projectDown ? (
        <div className="mb-6">
          <TakedownBanner projects={[{ id: projectDown.id, name: projectName ?? "This project", reason: projectDown.reason }]} />
        </div>
      ) : null}

      {/* ── The statement: where this offer stands ───────────────────── */}
      <header className="max-w-4xl">
        <h1 className="text-balance break-words font-display text-2xl font-semibold text-ink-900 sm:text-4xl">{headline}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-700">
          <Pill tone={statusTone}>{state.label}</Pill>
          <span className="break-words">
            {offer.roleTitle || projectName || "Proposal"}
            {projectName && offer.roleTitle ? ` · ${projectName}` : ""}
          </span>
          <span>{ft ? "Full-time offer" : "Internship offer"}</span>
        </p>
      </header>

      <CgpaNotice proposalId={proposal.id} state={state} canConfirm={confirmingCgpa} />
      <ExpiredNotice state={state} />

      <div className="mt-8 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-10">
          <Overview
            className="lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]"
            lead={
              <LeadStat
                label={ft ? "Annual CTC" : currency.toUpperCase() === "INR" && offer.monthlyMinor ? "Monthly, incl. GST" : "Monthly"}
                value={leadValue}
                tone={proposal.status === "hired" ? "brand" : "ink"}
                note={ft ? undefined : rateLine ? rateLine.value : undefined}
              />
            }
            rest={<StatList items={facts} />}
          />

          <Section title="The money trail" hint="Each stage, with the date it happened and the rupees that moved.">
            <MoneyLedger rows={ledger} attention={state.canPay || confirmingCgpa} />
          </Section>

          {!ft ? (
            <>
              <Section title="What you pay">
                <OfferBreakdownList lines={breakdown.lines} />
              </Section>
              <Section title="Terms">
                <dl className="divide-y divide-ink-200">
                  <DetailRow label="Working week" value={WEEKLY_SCHEDULES[offer.weeklySchedule].label} />
                  <DetailRow label="Paid leave" value={offer.paidLeavesPerMonth ? `${offer.paidLeavesPerMonth} day${offer.paidLeavesPerMonth === 1 ? "" : "s"} a month` : "None"} />
                  <DetailRow
                    label="Working hours"
                    value={
                      flexible ? (
                        "Flexible, set by the intern"
                      ) : (
                        <>
                          {offer.shiftFrom}–{offer.shiftTo}
                          {ist ? <span className="block text-xs font-normal text-ink-700">{ist} for the intern</span> : null}
                        </>
                      )
                    }
                    mono
                  />
                  <DetailRow label="Timezone" value={offer.timezone || "Asia/Kolkata"} />
                  <DetailRow label="Mode" value={MODE[offer.mode] ?? "-"} />
                  {offer.mode !== "remote" ? (
                    <DetailRow label="Location" value={[offer.city, offer.state].filter(Boolean).join(", ") || offer.location || "-"} />
                  ) : null}
                  {offer.mode === "hybrid" ? (
                    <DetailRow label="Hybrid split" value={`${offer.officeDays ?? 0} office · ${offer.homeDays ?? 0} home days a week`} />
                  ) : null}
                  <DetailRow label="Laptop" value={laptopLabel(offer.laptop)} />
                </dl>
              </Section>
            </>
          ) : (
            <Section
              title="Full-time terms"
              action={
                ft.offerLetterKey || ft.offerLetterUrl ? (
                  <a href={`/api/proposals/${encodeURIComponent(proposal.id)}/offer-letter`} target="_blank" rel="noreferrer" className={btnOutline}>
                    <Download className="size-4" aria-hidden />
                    Offer letter
                  </a>
                ) : undefined
              }
            >
              <dl className="divide-y divide-ink-200">
                <DetailRow label="Job mode" value={MODE[ft.jobMode] ?? (ft.jobMode || "-")} />
                <DetailRow label="Location" value={ft.jobMode === "remote" ? "Remote" : ft.location || "-"} />
                <DetailRow label="Timezone" value={ft.timezone || offer.timezone || "-"} />
                <DetailRow label="Shift" value={ft.shiftFrom && ft.shiftTo ? `${ft.shiftFrom}–${ft.shiftTo}` : "-"} mono />
                <DetailRow label="Annual CTC" value={ft.annualCtcMinor ? formatMoney(ft.annualCtcMinor, currency) : "-"} mono />
                <DetailRow
                  label="Hiring fee"
                  value={ft.annualCtcMinor ? `${formatMoney(fullTimeFeeMinor(ft.annualCtcMinor), currency)} (8.33% of CTC, separate from it)` : "-"}
                  mono
                />
              </dl>
            </Section>
          )}

          {offer.jd ? (
            <Section title="Job description">
              {/* Text: legacy Quill HTML is read back as plain text (EMH-28). */}
              <p className="max-w-prose whitespace-pre-line text-pretty text-base leading-relaxed text-ink-900 [overflow-wrap:anywhere]">{offer.jd}</p>
            </Section>
          ) : null}

          {offer.additionalInfo ? (
            <Section title="What the intern will learn">
              <p className="max-w-prose whitespace-pre-line text-pretty text-base leading-relaxed text-ink-900 [overflow-wrap:anywhere]">{offer.additionalInfo}</p>
            </Section>
          ) : null}

          {skills.length > 0 ? (
            <Section title="Skills">
              <ul className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li key={skill} className="rounded-md bg-ink-100 px-2.5 py-1 text-sm font-medium text-ink-800">
                    {skill}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {interview ? (
            <section aria-labelledby="proposal-interview-h">
              <div className="mb-3 border-b border-ink-200 pb-2">
                <h2 id="proposal-interview-h" className="font-display text-lg font-semibold text-ink-900">
                  Interview
                </h2>
                <p className="nums mt-0.5 text-sm text-ink-700">{formatSlotTime(new Date(meetingTime(interview) ?? 0), projectZone(projectTimezone, interview.timezone))}</p>
              </div>
              <JoinMeetingButton interviewId={interview.id} link={interview.meetingLink} ready={Boolean(interview.meetingLink)} variant="outline" />
            </section>
          ) : null}

          {/* Meeting rules are for interviews; a full-time offer is not one (bug sheet 12 Nov, row 16). */}
          {!ft ? (
            <details className="group border-b border-ink-200 pb-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-display text-lg font-semibold text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden">
                Meeting rules
                <ChevronDown className="size-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-1 text-sm text-ink-700">By joining any meeting scheduled through Findtern, you agree to this conduct policy.</p>
              <MeetingRulesList className="mt-4" />
            </details>
          ) : null}

          {/* Phones: the candidate after the terms, not above them. */}
          <div className="space-y-10 lg:hidden">{candidateInfo}</div>
        </div>

        <aside className="order-first space-y-10 lg:order-none lg:sticky lg:top-24 lg:self-start">
          {actionsNeeded || state.next ? (
            <Section title={nextStepTitle}>
              {/* The CGPA and expiry notices above already say it in full. */}
              {!state.gate && !state.canSendNew && proposal.status !== "hired" && state.next ? <p className="mb-4 text-pretty text-sm leading-relaxed text-ink-700">{state.next}</p> : null}
              <div className="grid gap-2">
                {state.canPay ? (
                  <Link href="/employer/checkout" className={buttonClass({ block: true, className: "min-h-11" })}>
                    <CreditCard className="size-4" aria-hidden />
                    {ft ? "Pay the hiring fee" : "Pay to confirm hire"}
                  </Link>
                ) : null}
                {sendNewHref ? (
                  <Link href={sendNewHref} className={buttonClass({ block: true, className: "min-h-11" })}>
                    <Send className="size-4" aria-hidden />
                    Send a new proposal
                  </Link>
                ) : null}
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
                  <Link href="/employer/timesheets" className={btnOutline}>
                    <Clock className="size-4" aria-hidden />
                    Timesheets
                  </Link>
                ) : null}
              </div>
            </Section>
          ) : null}

          <div className="space-y-10 max-lg:hidden">{candidateInfo}</div>
        </aside>
      </div>
    </div>
  );
}

/** "1 Dec 2026", in India time (S6). */
function formatDate(value: Date | string | null): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatWords(d);
}

/** "problemSolving" / "problem_solving" → "Problem solving". */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
