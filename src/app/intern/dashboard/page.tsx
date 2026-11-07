import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BigFigure, FigureStrip, Surface } from "@/components/app/primitives";
import { ScoreDial } from "@/components/app/score-dial";
import { buttonClass } from "@/components/ui/button";
import { CollegeCard, ProfileCard } from "@/components/intern/home/side-cards";
import { ActivityCard, MonthsCard, OpenRolesCard } from "@/components/intern/home/dashboard-cards";
import { CountUp } from "@/components/motion/count-up";
import { Stagger } from "@/components/intern/kit/motion";
import { SignatureHero } from "@/components/intern/kit/hero";
import { ActivationCard } from "@/components/intern/activation-card";
import { GettingStarted } from "@/components/intern/getting-started";
import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { aiInterviewPhase, isAiInterview, isScored, joinableLink, latestAiInterview } from "@/lib/ai-interview";
import { requireRole } from "@/lib/auth";
import { ratingsOf, scoreOf } from "@/components/intern/home/score-data";
import { NextUpTile } from "@/components/intern/home/next-up-tile";
import { pickNextUp } from "@/components/intern/home/next-up";
import { parseOffer } from "@/lib/offer";
import { formatPeriodDays, isoDay, todayIst } from "@/lib/timesheet-days";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { companyIn, hoursByMonth, hoursIn, nextAction, roleOf, slotOf } from "@/lib/journey";
import { formatMoney, shortDate } from "@/lib/format";
import { internPaidMinor, isInternPaid } from "@/lib/payments";
import { isHiredProposal } from "@/lib/hire-status";
import { paymentsAreFree, testPayEnabled } from "@/lib/razorpay";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { profileCompletion } from "@/lib/onboarding";
import { membershipOf } from "@/lib/college/membership";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/**
 * Home.
 *
 * A bento (SPECS §2 dashboard exception): the key numbers first, one of them
 * brand-filled, then the one thing waiting and the dark "Next up" date beside
 * the hours chart, then activity and the glanceable facts. Nothing appears twice, and nothing shows a number it does
 * not have: no score before the interview, no "₹0 on its way", no hours tile
 * before the first timesheet.
 */
export default async function InternHome() {
  const session = await requireRole("intern");

  // Independent reads, in parallel. loadInternData is cache()d: the layout's call already did the work.
  const [data, [user], activated, activationFeeMinor, paidMinor, college] = await Promise.all([
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
  ]);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const open = working ? [] : await openProjects(6, { strict: true });

  const openRoles = open.filter((p) => !data.proposals.some((mine) => mine.projectId === p.id));

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

  const approvedHours = data.timesheets.filter((t) => t.status === "approved").reduce((sum, t) => sum + hoursIn(t), 0);
  const waitingHours = data.timesheets.filter((t) => t.status === "submitted").reduce((sum, t) => sum + hoursIn(t), 0);
  const months = (data.timesheets.length > 0
    ? hoursByMonth(data.timesheets, now, 6, sheetOffer?.startDate ? new Date(sheetOffer.startDate) : null)
    : []
  ).filter((m) => m.approved + m.sent + m.draft > 0);

  // The pending action is shown once, in its card; the activity list skips it.
  const history = action ? data.thread.filter((n) => n !== action) : data.thread;

  const role = working && data.engagement
    ? `${roleOf(data.engagement.offerDetails)} at ${companyIn(data.names[data.engagement.employerId])}` +
      (hired && data.engagement.hiredAt && data.engagement.hiredAt <= now
        ? `, day ${Math.floor((now.getTime() - data.engagement.hiredAt.getTime()) / 86_400_000) + 1}`
        : "")
    : null;
  const lede = working
    ? hired
      ? role ?? undefined
      : "You accepted an offer. Logging hours opens once the company completes its payment."
    : gettingStarted
      ? "One step at a time. Employers can find you once all three are done."
      : undefined;

  const interviewCompany = upcomingInterviewItem
    ? data.names[upcomingInterviewItem.interview.employerId] ?? "the company"
    : "";
  const joinOrWait = upcomingInterviewItem?.interview.meetingLink ? (
    <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
  ) : (
    <p className="text-sm text-text-subtle">The meeting link arrives before the start time.</p>
  );
  const nextUp = next ? (
    next.kind === "interview" && upcomingInterviewItem ? (
      <NextUpTile next={next} today={today} heading={`Interview with ${interviewCompany}`} href="/intern/interviews" hrefLabel="Interviews">
        {joinOrWait}
      </NextUpTile>
    ) : next.kind === "payout" ? (
      <NextUpTile
        next={next}
        today={today}
        heading="Stipend payout due"
        detail={`${formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way`}
        href="/intern/earnings"
        hrefLabel="See your stipend"
      />
    ) : (
      <NextUpTile
        next={next}
        today={today}
        heading="Your next timesheet opens"
        detail={next.end ? `Covers ${formatPeriodDays(next.day, next.end)}` : undefined}
        href="/intern/timesheets"
        hrefLabel="Open timesheets"
      />
    )
  ) : null;

  // ONE primary action per state. The pending action wins; otherwise the next dated thing; otherwise the state's default.
  const primary = action ? (
    <Surface as="section" aria-labelledby="now-title" className="p-5 lg:p-6">
      <h2 id="now-title" className="text-base font-semibold text-ink-900">Needs you now</h2>
      <p className="mt-2 text-pretty text-lg font-medium leading-snug text-ink-900">{action.title}</p>
      <p className="mt-1 text-sm text-text-subtle">{action.detail}</p>
      {action.href ? (
        <Link href={action.href} className={buttonClass({ variant: "accent", className: "mt-4 max-sm:w-full" })}>
          {action.action ?? "Open"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Surface>
  ) : nextUp && !(next?.kind === "timesheet" && working && hired) ? (
    nextUp
  ) : (
    <Surface as="section" aria-labelledby="now-title" className="p-5 lg:p-6">
      <h2 id="now-title" className="text-base font-semibold text-ink-900">Nothing needs you right now</h2>
      <p className="mt-1 text-sm text-text-subtle">
        {working
          ? hired
            ? "Log your hours when the next timesheet opens."
            : "Your timesheets open once the company completes its payment."
          : openToWork
            ? "Employers can find your profile. An offer or interview request lands here first."
            : "Your profile is hidden from new employers, so nobody can send an offer."}
      </p>
      <Link
        href={working ? (hired ? "/intern/timesheets" : `/intern/proposals/${data.engagement?.id ?? ""}`) : "/intern/opportunities"}
        className={buttonClass({ className: "mt-4 max-sm:w-full" })}
      >
        {working ? (hired ? "Open timesheets" : "See your offer") : "See open roles"}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Surface>
  );
  const secondaryNext = action && nextUp && !(next?.kind === "timesheet" && working && hired) ? nextUp : null;

  const ratingOf = (label: string) => ratings?.find(([l]) => l === label)?.[1] ?? null;
  const dialAxes = {
    communication: ratingOf("Communication"),
    coding: ratingOf("Coding"),
    aptitude: ratingOf("Aptitude"),
    interview: ratingOf("AI interview"),
  };
  const profileCard = <ProfileCard status={profileStatus} score={score} openToWork={openToWork} />;

  const money = data.money;

  const activity = <ActivityCard thread={data.thread} history={history} now={now} openToWork={openToWork} />;

  const openRolesCard = openRoles.length > 0 ? <OpenRolesCard roles={openRoles} /> : null;

  const monthsCard = months.length > 0 ? <MonthsCard months={months} /> : null;

  const collegeCard = <CollegeCard college={college} working={working} />;

  const nextDay = next?.kind === "timesheet" ? next.day : null;
  const showFigures = working && hired;
  const heroLede = working
    ? hired
      ? role ?? lede
      : lede
    : score !== null
      ? gettingStarted
        ? "Your score is in. Finish the steps below and employers can find you."
        : openToWork
          ? "Your score is live. Employers can find you and send offers."
          : "Your profile is hidden. Switch on Open to work to be found."
      : lede ?? "Your Findtern Score appears here after your AI interview.";

  const hero = (
    <SignatureHero
      title={`Hello, ${user?.first ?? "there"}`}
      lede={heroLede}
      aside={
        score !== null ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
            <ScoreDial score={score} axes={dialAxes} size="md" tone="dark" className="lg:hidden" />
            <ScoreDial score={score} axes={dialAxes} size="lg" tone="dark" className="hidden lg:inline-grid" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {([["Communication", "communication"], ["Coding", "coding"], ["Aptitude", "aptitude"], ["Interview", "interview"]] as const).map(([label, k]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-on-dark-subtle">{label}</dt>
                  <dd className="nums font-medium text-white">{typeof dialAxes[k] === "number" ? dialAxes[k]!.toFixed(1) : "–"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null
      }
    >
      {showFigures ? (
        <FigureStrip tone="dark">
          <BigFigure
            tone="dark"
            label="Hours approved"
            value={<CountUp value={Number(approvedHours.toFixed(1))} decimals={Number.isInteger(Number(approvedHours.toFixed(1))) ? 0 : 1} duration={1.2} />}
          />
          <BigFigure
            tone="dark"
            label="Paid to date"
            value={<span className="max-sm:text-[32px]">{formatMoney(money.paidMinor, "INR")}</span>}
            hint={money.incomingMinor > 0 ? `${formatMoney(money.incomingMinor, money.currency, { zeroLabel: false })} on its way` : undefined}
          />
          {nextDay ? <BigFigure tone="dark" label="Waiting for review" value={Number(waitingHours.toFixed(1))} hint="hours submitted" /> : null}
          {nextDay ? (
            <BigFigure
              tone="dark"
              label="Next timesheet"
              value={shortDate(new Date(`${nextDay}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })}
              hint={next?.end ? `Covers ${formatPeriodDays(nextDay, next.end)}` : undefined}
            />
          ) : null}
        </FigureStrip>
      ) : null}
    </SignatureHero>
  );

  return (
    <Stagger className="space-y-4 lg:space-y-6">
      {hero}

      {gettingStarted ? (
        <div className="space-y-4">
          <GettingStarted
            completion={completion}
            activated={activated}
            feeMinor={activated ? (paidMinor ?? activationFeeMinor) : activationFeeMinor}
            internId={session.uid}
            aiPhase={aiPhase}
            aiLink={aiPhase === "ready" ? joinableLink(aiRow?.meetingLink) : null}
            hidden={!openToWork}
            aside={collegeCard}
            payment={
              <ActivationCard
                alreadyPaid={activated}
                testMode={paymentsAreFree()}
                testPay={testPayEnabled()}
                feeMinor={activationFeeMinor}
                internId={session.uid}
                prefill={{
                  name: fullName,
                  email: user?.email,
                  contact: user ? `${user.countryCode}${user.phoneNumber}` : undefined,
                }}
              />
            }
          />
          {history.length > 0 ? activity : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="grid min-w-0 content-start gap-4 xl:col-span-2">
            {primary}
            {secondaryNext}
            {activity}
            {monthsCard}
          </div>
          <aside className="grid min-w-0 content-start gap-4">
            {profileCard}
            {!working && activated ? openRolesCard : null}
            {collegeCard}
          </aside>
        </div>
      )}
    </Stagger>
  );
}
