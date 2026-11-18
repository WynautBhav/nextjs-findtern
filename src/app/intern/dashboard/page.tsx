import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Section, StatList, type StatItem } from "@/components/app/stat";
import { ActivityList, ScoreScale } from "@/components/app/tiles";
import { buttonClass } from "@/components/ui/button";
import { ActivationCard } from "@/components/intern/activation-card";
import { CollegePromoCard, SwitchToCollegeButton } from "@/components/intern/college-promo-card";
import { DismissedGuard } from "@/components/dismissed-guard";
import { GettingStarted } from "@/components/intern/getting-started";
import { HiddenProfileBanner } from "@/components/intern/hidden-profile-banner";
import { JoinGate } from "@/components/intern/ai-interview-join-card";
import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { VisibilityPill } from "@/components/intern/visibility-pill";
import { visibilityState } from "@/components/intern/visibility-state";
import { PresenceNotice } from "@/components/intern/presence-notice";
import { aiInterviewPhase, isAiInterview, isScored, joinableLink, latestAiInterview } from "@/lib/ai-interview";
import { requireRole } from "@/lib/auth";
import { HoursScale } from "@/components/intern/home/hours-scale";
import { MilestoneNote } from "@/components/intern/home/milestone-note";
import { NextUpTile } from "@/components/intern/home/next-up-tile";
import { pickNextUp } from "@/components/intern/home/next-up";
import { parseOffer } from "@/lib/offer";
import { formatPeriodDays, isoDay, todayIst } from "@/lib/timesheet-days";
import { getDb, schema } from "@/lib/db";
import { pendingClaimFor } from "@/lib/drives/claim";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { eq } from "drizzle-orm";
import { loadInternData } from "@/lib/intern-data";
import { isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { companyIn, hoursByMonth, hoursIn, nextAction, roleOf, slotOf } from "@/lib/journey";
import { formatMoney, formatSlotTime, shortDate } from "@/lib/format";
import { internPaidMinor, isInternPaid } from "@/lib/payments";
import { internUnlockState } from "@/lib/intern-unlock";
import { lockEnabled } from "@/lib/intern-lock";
import { isHiredProposal } from "@/lib/hire-status";
import { paymentsAreFree } from "@/lib/razorpay";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { profileCompletion } from "@/lib/onboarding";
import { collegeAccountState } from "@/lib/college/account-state";
import { canSwitchBackToCollege } from "@/lib/college/identity-match";
import { membershipOf } from "@/lib/college/membership";
import { presenceNoticeKey } from "@/lib/dismissed-keys";
import { paidSeatTotal } from "@/lib/college/seat-gate";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/**
 * Home.
 *
 * A bento (SPECS §2 dashboard exception): the one thing waiting and the dark
 * "Next up" date beside the hours chart first, then the key numbers (one of
 * them brand-filled), then activity and the glanceable facts. Nothing appears twice, and nothing shows a number it does
 * not have: no score before the interview, no "₹0 on its way", no hours tile
 * before the first timesheet.
 */
function extraBag(onboarding: { extraData?: Record<string, unknown> | null } | null) {
  const extra = onboarding?.extraData;
  return extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
}

/** Assigned assessment score, if any - null when unscored (never a fake number). */
function scoreOf(onboarding: { extraData?: Record<string, unknown> | null } | null): number | null {
  const raw = extraBag(onboarding).findternScore;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Legacy rating order and labels (dashboard.tsx ratingItems); "academic" was shown too. */
const RATING_LABELS: [key: string, label: string][] = [
  ["coding", "Coding"],
  ["aptitude", "Aptitude"],
  ["interview", "AI interview"],
  ["communication", "Communication"],
  ["academic", "Academics"],
];

/** Per-axis scores backing the breakdown. Null when never assessed. */
function ratingsOf(onboarding: { extraData?: Record<string, unknown> | null } | null): [string, number][] | null {
  const raw = extraBag(onboarding).ratings;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rows = RATING_LABELS.flatMap(([key, label]) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? [[label, Math.max(0, Math.min(10, value))] as [string, number]] : [];
  });
  return rows.length > 0 ? rows : null;
}

const IST = "Asia/Kolkata";


export default async function InternHome() {
  const session = await requireRole("intern");

  // Independent reads, in parallel. loadInternData is cache()d: the layout's call already did the work.
  const [data, [user], activated, activationFeeMinor, paidMinor, college, [presenceRow], lockState, acct] = await Promise.all([
    loadInternData(session.uid),
    getDb()
      .select({
        first: schema.users.firstName,
        last: schema.users.lastName,
        email: schema.users.email,
        countryCode: schema.users.countryCode,
        phoneNumber: schema.users.phoneNumber,
      })
      .from(schema.users)
      .where(eq(schema.users.id, session.uid))
      .limit(1),
    // Activation: the one-time ₹2,499 that takes a profile live. Once any paid
    // row exists the card leaves the dashboard for good.
    isInternPaid(session.uid),
    getInternActivationFeeMinor(),
    internPaidMinor(session.uid),
    membershipOf(session.uid).catch(() => null),
    // The one-time "employers can see when you're active" notice shows only while this is still on.
    getDb()
      .select({ show: schema.userPresence.showActivity })
      .from(schema.userPresence)
      .where(eq(schema.userPresence.userId, session.uid))
      .limit(1),
    // Payment lock: before payment this page links only to open pages (Documents, profile, Settings), never into a locked one.
    lockEnabled() ? internUnlockState(session.uid) : "unlocked",
    // College account (WP4): read from the database, never from the URL or the browser.
    collegeAccountState(session.uid),
  ]);
  // A college-account intern sees a different Home: no price, no Pay now, a promo field instead (until paid).
  const collegeHome = acct.home !== "normal" ? { name: college?.name ?? "your college", state: acct.home === "college_paid" ? ("paid" as const) : ("unpaid" as const) } : null;
  const collegeUnpaid = acct.home === "college_unpaid";
  const canSwitchBack = canSwitchBackToCollege(acct);
  const canOpen = lockState !== "locked";
  // The college covers the interview fee only once it has paid for a batch (owner, 6 Nov).
  const collegePaid =
    college?.isPartner && !activated
      ? await paidSeatTotal(getDb(), college.collegeId).then((r) => r.seats > 0, () => false)
      : false;
  // A matched student whose college paid accepts in one click. Never breaks the dashboard if this lookup fails.
  const claim = activated || collegeUnpaid
    ? null
    : await (async () => pendingClaimFor(getDb().$client, session.uid, driveCodeSecret()))().catch(() => null);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const presenceOn = presenceRow?.show ?? true;
  const extra = data.onboarding?.extraData;
  const openToWork =
    !extra || typeof extra !== "object" || (extra as Record<string, unknown>).openToWork !== false;

  // Next interview: company meetings with a booked slot only. AI interview
  // rows have no slot and ~210 live ones sit in "scheduled" forever, so they
  // stay out of this rail (INT-33); the AI interview has its own step.
  const upcomingInterviewItem =
    data.interviews
      .filter(
        (i) =>
          !isAiInterview(i, data.aiEmployerIds) &&
          String(i.status ?? "").toLowerCase() === "scheduled" &&
          Boolean(i.selectedSlot),
      )
      .map((i) => ({ interview: i, when: slotOf(i) }))
      .filter((x): x is { interview: (typeof data.interviews)[number]; when: Date } =>
        // A booked meeting keeps its Join link until slot + 60 min (legacy).
        Boolean(x.when && isMeetingLinkLive(x.interview)),
      )
      .sort((a, b) => a.when.getTime() - b.when.getTime())[0] ?? null;

  const aiRow = latestAiInterview(data.interviews, data.aiEmployerIds);
  const aiPhase = aiInterviewPhase(aiRow, isScored(data.onboarding?.extraData));

  const fullName = `${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate";
  const score = scoreOf(data.onboarding);
  const ratings = ratingsOf(data.onboarding);
  // Profile → activation → AI interview, in that order, until all three are done.
  const completion = profileCompletion(data.onboarding, {
    hasPanImage: Boolean(data.document?.panImageName),
    hasAadhaarImage: Boolean(data.document?.aadhaarImageName),
    hasPhoto: Boolean(data.document?.profilePhotoName),
  });
  // Unpaid and not complete: Home is the Getting started / Complete profile card and nothing else, because every other
  // page it could link to is closed until the profile is done (lib/intern-lock.ts, precompleteVerdict).
  const preComplete = lockState === "locked" && !completion.complete;
  const gettingStarted = !working && (!completion.complete || !activated || aiPhase !== "scored");
  // Whether employers can find this profile (legacy dashboard.tsx:1031: paid and
  // scored). Someone already hired got there through a visible profile, even when
  // the activation predates payment rows, so they never read as "pending".
  const profileStatus = !openToWork
    ? { tone: "closed" as const, label: "Hidden" }
    : (activated || working) && aiPhase === "scored"
      ? { tone: "live" as const, label: "Visible" }
      : { tone: "waiting" as const, label: "Not visible yet" };

  // Hours open only once the company has paid (bug sheet 7, S1 r65); an
  // accepted, unpaid offer is "working" but has nothing to log yet.
  const hired = data.proposals.some((p) => isHiredProposal(p));
  const now = new Date();
  const today = todayIst(now);

  // The one dated thing coming: an interview, a stipend payout, or the next
  // timesheet period opening. Same period rule as the Timesheets page.
  const sheetOffer =
    working && data.engagement && isHiredProposal(data.engagement)
      ? parseOffer(data.engagement.offerDetails, data.engagement.currency)
      : null;
  const next = pickNextUp({
    now,
    interview: upcomingInterviewItem?.when ?? null,
    payoutDue: data.money.incomingMinor > 0 ? data.money.nextExpectedAt : null,
    sheet:
      sheetOffer && !sheetOffer.fullTime
        ? {
            startDate: sheetOffer.startDate,
            months: sheetOffer.months,
            taken: data.timesheets
              .filter((t) => t.proposalId === data.engagement!.id && t.periodStart && t.periodEnd)
              .map((t) => ({ start: isoDay(t.periodStart!), end: isoDay(t.periodEnd!) })),
          }
        : null,
  });

  // Key numbers: only the ones this person has. Money paid is the one lead figure; the rest is a ruled list.
  const approvedHours = data.timesheets.filter((t) => t.status === "approved").reduce((sum, t) => sum + hoursIn(t), 0);
  const waitingHours = data.timesheets.filter((t) => t.status === "submitted").reduce((sum, t) => sum + hoursIn(t), 0);
  const allMonths = data.timesheets.length > 0 && !preComplete ? hoursByMonth(data.timesheets, now, 6, sheetOffer?.startDate ? new Date(sheetOffer.startDate) : null) : null;
  const paidLead =
    !preComplete && data.money.paidMinor > 0
      ? {
          value: data.money.paidMinor / 100,
          note:
            data.money.incomingMinor > 0
              ? `${formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way` +
                // Next up carries the due date when it is the payout.
                (data.money.nextExpectedAt && next?.kind !== "payout"
                  ? `, due ${shortDate(data.money.nextExpectedAt, { day: "numeric", month: "short" })}`
                  : "")
              : data.money.lastPaidAt
                ? `Last paid ${shortDate(data.money.lastPaidAt, { day: "numeric", month: "short" })}`
                : undefined,
        }
      : null;
  const restStats: StatItem[] = preComplete
    ? []
    : [
        ...(data.timesheets.length > 0
          ? [
              {
                label: "Hours approved",
                value: `${Number(approvedHours.toFixed(1))} h`,
                hint: waitingHours > 0 ? `${Number(waitingHours.toFixed(1))} h waiting for review` : undefined,
                href: canOpen ? "/intern/timesheets" : undefined,
              },
            ]
          : []),
        ...(score !== null ? [{ label: "Findtern Score", value: `${score.toFixed(1)} / 10`, href: canOpen ? "/intern/record" : undefined }] : []),
      ];

  // The pending action is shown once, in its tile; the thread skips it.
  const history = action ? data.thread.filter((n) => n !== action) : data.thread;

  // Who this person works for, and for how long: the line the references
  // spend on a subtitle, from rows we already have.
  const role = working && data.engagement
    ? `${roleOf(data.engagement.offerDetails)} at ${companyIn(data.names[data.engagement.employerId])}` +
      (hired && data.engagement.hiredAt && data.engagement.hiredAt <= now
        ? `, day ${Math.floor((now.getTime() - data.engagement.hiredAt.getTime()) / 86_400_000) + 1}`
        : "")
    : null;

  const interviewCompany = upcomingInterviewItem
    ? data.names[upcomingInterviewItem.interview.employerId] ?? "the company"
    : "";
  const nextUp = canOpen && !preComplete && next ? (
    next.kind === "interview" && upcomingInterviewItem ? (
      <NextUpTile next={next} today={today} heading={`Interview with ${interviewCompany}`} href="/intern/interviews" hrefLabel="Interviews">
        {upcomingInterviewItem.interview.meetingLink ? (
          <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
        ) : (
          <p className="text-sm text-ink-600">The meeting link arrives before the start time.</p>
        )}
      </NextUpTile>
    ) : next.kind === "payout" ? (
      <NextUpTile
        next={next}
        today={today}
        heading="Stipend payout due"
        detail={`${formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way`}
        href="/intern/earnings"
        hrefLabel="Stipend"
      />
    ) : (
      <NextUpTile
        next={next}
        today={today}
        heading="Your next timesheet opens"
        detail={next.end ? `Covers ${formatPeriodDays(next.day, next.end)}` : undefined}
        href="/intern/timesheets"
        hrefLabel="Timesheets"
      />
    )
  ) : null;

  // What needs this person next, in one fixed order: an offer waiting,
  // the AI interview, the college's cover, the profile. Each line has one action.
  const nextSteps: { key: string; title: string; detail?: string; href?: string; label?: string; joinLink?: string }[] = [];
  // nextAction() returns one node; the count comes from the thread.
  const waitingOffers = action?.kind === "proposal" ? data.thread.filter((n) => n.tone === "action" && n.kind === action.kind).length : 0;
  // Locked: no offer line can exist (an offer is a proposal, which unlocks), and none may link out.
  if (canOpen && waitingOffers > 1) {
    nextSteps.push({
      key: "offer",
      title: `${waitingOffers} offers waiting on you`,
      detail: "Each closes as rejected on its joining date if you don't answer.",
      href: "/intern/proposals",
      label: "Read your offers",
    });
  } else if (canOpen && action) {
    nextSteps.push({ key: "offer", title: action.title, detail: action.detail, href: action.href ?? undefined, label: action.action ?? "Open" });
  }
  if (aiPhase === "ready") {
    const link = joinableLink(aiRow?.meetingLink);
    if (link) {
      nextSteps.push({
        key: "ai-interview",
        title: "Your AI interview is ready",
        detail: "It is the last step before employers can find you.",
        // Never the raw link: the terms and instructions gate opens first (bug sheet 12 Nov, row 20).
        label: "Start the interview",
        joinLink: link,
      });
    }
  }
  if (!completion.complete) {
    const missing = completion.items.filter((i) => !i.done);
    nextSteps.push({
      key: "profile",
      title: "Finish your profile",
      detail: `${completion.done} of ${completion.total} steps done${missing[0] ? `. Next: ${missing[0].label}.` : "."}`,
      href: missing[0]?.href ?? "/intern/onboarding",
      label: "Continue",
    });
  }

  // No status line while anything is pending (an offer, a profile step): the "What next" card says it,
  // and "Nothing is waiting" above it would contradict it.
  const pending = nextSteps.length > 0;
  const status = working
    ? hired
      ? pending ? undefined : "Nothing is waiting on you right now."
      : "You accepted an offer. Logging hours opens once the company completes its payment."
    : gettingStarted
      ? activated
        ? "Activation is done. The AI interview is the last step before employers can find you."
        : completion.complete
          ? collegeUnpaid
            ? "Your profile is complete. Enter the promo code your college gave you to finish activation."
            : "Your profile is complete. Activation is next, and it is the only payment."
          : "Build your profile first. It is free, and employers shortlist you on your score once the AI interview is done."
      : pending
        ? undefined
        : openToWork
          ? "Nothing is waiting on you. Employers can find your profile."
          : "Nothing is waiting on you. Your profile is hidden from new employers.";
  const lede = role ? (status ? `${role}. ${status}` : role) : status;
  // The priority slot: ONE thing at a time, set as a statement with the page's one filled button.
  const lead = nextSteps[0];
  const more = nextSteps.slice(1);
  const waiting = lead ? (
    <section aria-labelledby="priority-title" className="min-w-0">
      <p className="text-sm font-medium text-ink-700">{nextSteps.length === 1 ? "1 thing needs you" : `${nextSteps.length} things need you, in this order`}</p>
      <h2 id="priority-title" className="mt-1 text-balance font-display text-2xl font-semibold leading-tight text-ink-900">
        {lead.title}
      </h2>
      {lead.detail ? <p className="mt-2 max-w-xl text-pretty text-base text-ink-700">{lead.detail}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {lead.joinLink ? (
          <JoinGate link={lead.joinLink} label={lead.label} variant="primary" className="max-sm:w-full" />
        ) : lead.href ? (
          <Link href={lead.href} className={buttonClass({ variant: "primary", className: "max-sm:w-full" })}>
            {lead.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {more.length > 0 ? (
        <ol className="mt-5 divide-y divide-ink-200 border-y border-ink-200">
          {more.map((step) => (
            <li key={step.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <p className="min-w-0 text-sm text-ink-900">
                {step.title}
                {step.detail ? <span className="block text-xs text-ink-600">{step.detail}</span> : null}
              </p>
              {step.joinLink ? (
                <JoinGate link={step.joinLink} label={step.label} variant="outline" />
              ) : step.href ? (
                <Link href={step.href} className={buttonClass({ variant: "outline", size: "sm" })}>
                  {step.label}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  ) : null;

  const activity = (
    <Section
      title="Activity"
      action={
        canOpen && history.length > 0 ? (
          <Link href="/intern/record" className="font-medium text-brand-800 underline-offset-4 hover:underline">
            Full record
          </Link>
        ) : undefined
      }
    >
      {data.thread.length === 0 ? (
        // Profile done, activated and scored: the next move is a company's.
        <EmptyScene
          title="No offers or interviews yet"
          body={
            openToWork
              ? "Your profile is in front of employers. When a company books an interview or sends an offer, it lands here, then your timesheets and payments."
              : "Your profile is hidden from employers, so no one can book an interview or send an offer. Switch on Open to work in your profile to be found."
          }
          next={openToWork ? { label: "See your profile as employers do", href: "/intern/profile" } : { label: "Open your profile", href: "/intern/profile" }}
          who={openToWork ? "Waiting on employers" : "Waiting on you"}
        />
      ) : history.length === 0 ? (
        <p className="text-sm text-ink-700">Nothing else yet.</p>
      ) : (
        <ActivityList nodes={history.slice(0, 5)} />
      )}
    </Section>
  );

  // The glanceable facts: the narrow column on every state of Home.
  const interviewTile = (
    <>
      {canOpen && upcomingInterviewItem && next?.kind !== "interview" ? (
        <Section title="Next interview" action={<Link href="/intern/interviews" className="font-medium text-brand-800 underline-offset-4 hover:underline">Interviews</Link>}>
          <p className="text-lg font-medium text-ink-900">{interviewCompany}</p>
          {/* Interns always see India time, labelled (bug sheet 7, S2 r7). */}
          <p className="mt-1 text-sm text-ink-700">{formatSlotTime(upcomingInterviewItem.when, IST)}</p>
          {upcomingInterviewItem.interview.meetingLink ? (
            <div className="mt-4">
              <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-700">The meeting link arrives before the start time.</p>
          )}
        </Section>
      ) : null}

    </>
  );
  const scoreTile = (
    <>
      {ratings && !preComplete ? (
        <Section
          title="How your score is made"
          action={canOpen ? <Link href="/intern/record" className="font-medium text-brand-800 underline-offset-4 hover:underline">Score details</Link> : undefined}
        >
          <ScoreScale rows={ratings.map(([label, value]) => ({ label, value }))} />
        </Section>
      ) : null}

    </>
  );
  const statusTile = (
    <>
      {/* Before going live the journey's last stop carries this; the switch stays on Your profile. */}
      {gettingStarted ? null : (
        <Section
          title="Profile status"
          action={<VisibilityPill state={visibilityState(profileStatus.tone)}>{profileStatus.label}</VisibilityPill>}
        >
          <OpenToWorkToggle initial={openToWork} brief />
          <Link href="/intern/profile" className="mt-3 inline-flex min-h-8 items-center text-sm font-medium text-brand-800 underline-offset-4 hover:underline touch:min-h-11">
            See your profile as employers do
          </Link>
        </Section>
      )}

    </>
  );
  const collegeTile = (
    <>
      {college ? (
        <Section title="Your college" action={<Link href="/intern/settings#college" className="font-medium text-brand-800 underline-offset-4 hover:underline">College</Link>}>
          <p className="flex items-center gap-2 text-sm text-ink-700">
            <GraduationCap className="size-4 shrink-0 text-brand-700" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-ink-900">{college.name}</span>
              {college.status === "verified" ? " · verified" : " · not verified yet"}
            </span>
          </p>
          {/* An individual account that is still linked to its college and unpaid may go back to the college paying. */}
          {canSwitchBack ? (
            <>
              <p className="mt-3 text-sm text-ink-700">You are on an individual account, so you pay the activation fee yourself.</p>
              <SwitchToCollegeButton />
            </>
          ) : null}
        </Section>
      ) : null}
    </>
  );
  const asideTiles = (
    <>
      {interviewTile}
      {scoreTile}
      {statusTile}
      {collegeTile}
    </>
  );

  // The page's own heading is the date: the day is the signature, the role line sits under it.
  const todayDay = new Date(`${today}T12:00:00Z`);
  const headline = shortDate(todayDay, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div>
      <PageHead
        title={headline}
        lede={lede}
        action={
          !canOpen || action?.href || lead ? null : working && !hired && data.engagement ? (
            <Link href={`/intern/proposals/${data.engagement.id}`} className={buttonClass({ variant: "outline" })}>
              See your offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : working ? (
            <Link href="/intern/timesheets" className={buttonClass({ variant: "outline" })}>
              Timesheets
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      />

      <div className="space-y-8">
        {/* One notice at a time: the first that applies wins and the others wait (a notice shows nothing once dismissed). */}
        <div className="empty:hidden [&>div:not(:empty)~div]:hidden">
          <div>{openToWork ? null : <HiddenProfileBanner />}</div>
          <div>
            <MilestoneNote data={data} userId={session.uid} now={now} />
          </div>
          <div>
            <PresenceNotice userId={session.uid} on={presenceOn} />
            {/* Hides a dismissed notice before first paint on a hard load (the notice is server-rendered). */}
            {presenceOn ? <DismissedGuard store="local" storageKey={presenceNoticeKey(session.uid)} name="presence" /> : null}
          </div>
        </div>

        {gettingStarted ? (
          <GettingStarted
            completion={completion}
            activated={activated}
            // Once paid, show what was charged (promo applied), not the list price.
            feeMinor={activated ? (paidMinor ?? activationFeeMinor) : activationFeeMinor}
            internId={session.uid}
            aiPhase={aiPhase}
            aiLink={aiPhase === "ready" ? joinableLink(aiRow?.meetingLink) : null}
            hidden={!openToWork}
            collegeName={collegePaid && college ? college.name : null}
            collegeAccount={collegeHome}
            aside={asideTiles}
            payment={
              collegeUnpaid ? (
                <CollegePromoCard collegeName={college?.name ?? "your college"} feeLabel={formatMoney(activationFeeMinor, "INR")} />
              ) : (
                <ActivationCard
                  alreadyPaid={activated}
                  claim={claim}
                  testMode={paymentsAreFree()}
                  feeMinor={activationFeeMinor}
                  internId={session.uid}
                  prefill={{
                    name: fullName,
                    email: user?.email,
                    contact: user ? `${user.countryCode}${user.phoneNumber}` : undefined,
                  }}
                />
              )
            }
          />
        ) : null}

        {/* Two columns, one grid: left is what to do and what happened, right is the date and the money.
            DOM order is reading order on a phone. */}
        <div className="grid gap-x-12 gap-y-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-8">
            {waiting}
            {allMonths ? (
              <Section
                title="Hours by month"
                hint="Hours you logged, by how far they got in review"
                action={<Link href="/intern/timesheets" className="font-medium text-brand-800 underline-offset-4 hover:underline">Timesheets</Link>}
              >
                <HoursScale months={allMonths} now={now} />
              </Section>
            ) : null}
            {gettingStarted ? (history.length > 0 && !preComplete ? activity : null) : activity}
            {gettingStarted ? null : collegeTile}
          </div>
          <div className="grid min-w-0 content-start gap-8">
            {nextUp}
            {paidLead || restStats.length > 0 ? (
              <div>
                {paidLead ? (
                  <LeadStat
                    label="Paid to you"
                    value={<RollingNumber value={paidLead.value} currency="INR" />}
                    note={paidLead.note}
                    action={canOpen ? { label: "Stipend", href: "/intern/earnings" } : undefined}
                    className={restStats.length > 0 ? "mb-6" : undefined}
                  />
                ) : null}
                {restStats.length > 0 ? <StatList items={restStats} /> : null}
              </div>
            ) : null}
            {gettingStarted ? null : (
              <>
                {interviewTile}
                {scoreTile}
                {statusTile}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
