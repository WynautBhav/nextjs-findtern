import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";

import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { ActivityList, ScoreScale, STAT_ROW, StatTile, Tile } from "@/components/app/tiles";
import { buttonClass } from "@/components/ui/button";
import { ActivationCard } from "@/components/intern/activation-card";
import { GettingStarted } from "@/components/intern/getting-started";
import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { aiInterviewPhase, isAiInterview, isScored, joinableLink, latestAiInterview } from "@/lib/ai-interview";
import { requireRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { HoursPills } from "@/components/intern/home/hours-pills";
import { NextUpTile } from "@/components/intern/home/next-up-tile";
import { pickNextUp } from "@/components/intern/home/next-up";
import { parseOffer } from "@/lib/offer";
import { formatPeriodDays, isoDay, todayIst } from "@/lib/timesheet-days";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { companyIn, hoursByMonth, hoursIn, nextAction, roleOf, slotOf } from "@/lib/journey";
import { formatMoney, formatSlotTime, shortDate } from "@/lib/format";
import { isInternPaid } from "@/lib/payments";
import { isHiredProposal } from "@/lib/hire-status";
import { paymentsAreFree } from "@/lib/razorpay";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { visibleAgainAt } from "@/lib/profile-hide";
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
  const [data, [user], activated, activationFeeMinor, college] = await Promise.all([
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
    membershipOf(session.uid).catch(() => null),
  ]);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const open = working ? [] : await openProjects(6, { strict: true });

  const openRoles = open.filter((p) => !data.proposals.some((mine) => mine.projectId === p.id));

  const extra = data.onboarding?.extraData;
  const openToWork =
    !extra || typeof extra !== "object" || (extra as Record<string, unknown>).openToWork !== false;
  const visibleAgain = openToWork
    ? null
    : visibleAgainAt((extra as Record<string, unknown> | null)?.hiddenAt)?.toISOString() ?? null;

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

  // Key numbers: only the ones this person has. The first one is brand-filled.
  const approvedHours = data.timesheets.filter((t) => t.status === "approved").reduce((sum, t) => sum + hoursIn(t), 0);
  const waitingHours = data.timesheets.filter((t) => t.status === "submitted").reduce((sum, t) => sum + hoursIn(t), 0);
  const allMonths = data.timesheets.length > 0 ? hoursByMonth(data.timesheets, now, 6, sheetOffer?.startDate ? new Date(sheetOffer.startDate) : null) : null;
  const stats: React.ComponentProps<typeof StatTile>[] = [
    ...(data.money.paidMinor > 0
      ? [{
          label: "Paid to you",
          value: formatMoney(data.money.paidMinor, "INR"),
          meta:
            data.money.incomingMinor > 0
              ? `${formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way` +
                // Next up carries the due date when it is the payout.
                (data.money.nextExpectedAt && next?.kind !== "payout"
                  ? `, due ${shortDate(data.money.nextExpectedAt, { day: "numeric", month: "short" })}`
                  : "")
              : data.money.lastPaidAt
                ? `Last paid ${shortDate(data.money.lastPaidAt, { day: "numeric", month: "short" })}`
                : undefined,
          href: "/intern/earnings",
        }]
      : []),
    ...(data.timesheets.length > 0
      ? [{
          label: "Hours approved",
          value: Number(approvedHours.toFixed(1)),
          unit: "h",
          meta: waitingHours > 0 ? `${Number(waitingHours.toFixed(1))} h waiting for review` : undefined,
          href: "/intern/timesheets",
        }]
      : []),
    ...(score !== null
      ? [{ label: "Findtern Score", value: score.toFixed(1), unit: "/10", href: "/intern/record" }]
      : []),
  ].map((s, i) => ({ ...s, featured: i === 0, index: i }));

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
  // No status line while an action is pending: the "Waiting on you" tile says it.
  const status = working
    ? hired
      ? action ? undefined : "Nothing is waiting on you right now."
      : "You accepted an offer. Logging hours opens once the company completes its payment."
    : gettingStarted
      ? activated
        ? "Activation is done. The AI interview is the last step before employers can find you."
        : completion.complete
          ? "Your profile is complete. Activation is next, and it is the only payment."
          : "Build your profile, activate once, take the AI interview. Then employers shortlist you on your score."
      : action
        ? undefined
        : openToWork
          ? "Nothing is waiting on you. Employers can find your profile."
          : "Nothing is waiting on you. Your profile is hidden from new employers.";
  const lede = role ? (status ? `${role}. ${status}` : role) : status;

  const interviewCompany = upcomingInterviewItem
    ? data.names[upcomingInterviewItem.interview.employerId] ?? "the company"
    : "";
  const nextUp = next ? (
    next.kind === "interview" && upcomingInterviewItem ? (
      <NextUpTile next={next} today={today} heading={`Interview with ${interviewCompany}`} href="/intern/interviews" hrefLabel="Interviews">
        {upcomingInterviewItem.interview.meetingLink ? (
          <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
        ) : (
          <p className="text-sm text-white/75">The meeting link arrives before the start time.</p>
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

  const waiting = action ? (
    // The screen's one focal point: the only amber button.
    <Tile title="Waiting on you" className="bg-accent-100/60">
      <p className="text-pretty text-lg font-medium leading-snug text-ink-900">{action.title}</p>
      <p className="mt-1 text-sm text-text-subtle">{action.detail}</p>
      {action.href ? (
        <Link href={action.href} className={buttonClass({ variant: "accent", className: "mt-4 w-full" })}>
          {action.action ?? "Open"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </Tile>
  ) : null;

  const activity = (
    <Tile
      title="Activity"
      action={history.length > 0 ? { href: "/intern/record", label: "Full record" } : undefined}
    >
      {data.thread.length === 0 ? (
        // Profile done, activated and scored: the next move is a company's.
        <EmptyScene
          title="No offers or interviews yet"
          body="Your profile is in front of employers. When a company books an interview or sends an offer, it lands here, then your timesheets and payments."
          next={{ label: "See open roles", href: "/intern/opportunities" }}
          who="Waiting on employers"
        />
      ) : history.length === 0 ? (
        <p className="text-sm text-ink-600">Nothing else yet.</p>
      ) : (
        <ActivityList nodes={history.slice(0, 5)} />
      )}
    </Tile>
  );

  // Roles open up once activation is paid (payment needs a complete profile).
  const openRolesTile = openRoles.length > 0 ? (
    <Tile title="Open roles" action={{ href: "/intern/opportunities", label: "See all open roles" }}>
      <ul className="-mx-2 divide-y divide-ink-100">
        {openRoles.slice(0, 5).map((p) => (
          <li key={p.id}>
            <Link
              href={`/intern/opportunities/${p.id}`}
              className="group grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-apple-sm px-2 py-3 transition-colors hover:bg-ink-50"
            >
              {/* No company mark before a hire (bug sheet 7, S1 r27/r67). */}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                  {p.projectName}
                </span>
                <span className="block truncate text-xs text-text-subtle">{p.scopeOfWork}</span>
              </span>
              <ArrowRight className="size-4 text-ink-300 group-hover:text-brand-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  ) : null;

  // The glanceable facts: the narrow column on every state of Home.
  const asideTiles = (
    <>
      {upcomingInterviewItem && next?.kind !== "interview" ? (
        <Tile title="Next interview" action={{ href: "/intern/interviews", label: "Interviews" }}>
          <p className="text-lg font-medium text-ink-900">{interviewCompany}</p>
          <p className="mt-1 text-sm text-text-subtle">
            {/* Interns always see India time, labelled (bug sheet 7, S2 r7). */}
            {formatSlotTime(upcomingInterviewItem.when, IST)}
          </p>
          {upcomingInterviewItem.interview.meetingLink ? (
            <div className="mt-4">
              <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-subtle">The meeting link arrives before the start time.</p>
          )}
        </Tile>
      ) : null}

      {ratings ? (
        <Tile title="How your score is made" action={{ href: "/intern/record", label: "Score details" }}>
          <ScoreScale rows={ratings.map(([label, value]) => ({ label, value }))} />
        </Tile>
      ) : null}

      {/* Before going live the journey's last stop carries this; the switch stays on Your profile. */}
      {gettingStarted ? null : (
        <Tile
          title="Profile status"
          aside={<Pill tone={profileStatus.tone}>{profileStatus.label}</Pill>}
          action={{ href: "/intern/profile", label: "See your profile as employers do" }}
        >
          <OpenToWorkToggle initial={openToWork} visibleAgainAt={visibleAgain} brief />
        </Tile>
      )}

      {college ? (
        <Tile title="Your college" action={{ href: "/intern/college", label: "College" }}>
          <p className="flex items-center gap-2 text-sm text-ink-700">
            <GraduationCap className="size-4 shrink-0 text-brand-700" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-ink-900">{college.name}</span>
              {college.status === "verified" ? " · verified" : " · not verified yet"}
            </span>
          </p>
        </Tile>
      ) : working ? null : (
        <Tile title="Is your college on Findtern?" action={{ href: "/intern/college", label: "Find your college" }}>
          <p className="text-sm text-text-subtle">
            Join it to be seen in your college&apos;s placement drives, where employers call students the same day.
          </p>
        </Tile>
      )}
    </>
  );

  return (
    <div>
      {/* Template: Dashboard (SPECS §5): key numbers, then the bento. */}
      <PageHead
        title={`Hello, ${user?.first ?? "there"}`}
        lede={lede}
        action={
          action?.href ? null : working && !hired && data.engagement ? (
            <Link href={`/intern/proposals/${data.engagement.id}`} className={buttonClass({ variant: "outline" })}>
              See your offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : working ? (
            <Link href="/intern/timesheets" className={buttonClass({ variant: "outline" })}>
              Timesheets
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : !gettingStarted ? (
            <Link href="/intern/opportunities" className={buttonClass({ variant: "outline" })}>
              See open roles
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      />

      <div className="space-y-4">
        {gettingStarted ? (
          <GettingStarted
            completion={completion}
            activated={activated}
            feeMinor={activationFeeMinor}
            internId={session.uid}
            aiPhase={aiPhase}
            aiLink={aiPhase === "ready" ? joinableLink(aiRow?.meetingLink) : null}
            hidden={!openToWork}
            aside={asideTiles}
            payment={
              <ActivationCard
                alreadyPaid={activated}
                testMode={paymentsAreFree()}
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
        ) : null}

        {stats.length > 0 ? (
          <div className={STAT_ROW}>
            {stats.map((s) => (
              <StatTile key={s.label} {...s} />
            ))}
          </div>
        ) : null}

        {/* DOM order is reading order at every width: what needs you and what's
            next lead (first on a phone, left on a desktop), the chart beside them. */}
        {waiting || nextUp || allMonths ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {waiting || nextUp ? (
              <div className={cn("grid min-w-0 gap-4", waiting && nextUp && "md:max-xl:grid-cols-2", !allMonths && "xl:col-span-3 xl:grid-cols-2")}>
                {waiting}
                {nextUp}
              </div>
            ) : null}
            {allMonths ? (
              <Tile
                title="Hours by month"
                action={{ href: "/intern/timesheets", label: "Timesheets" }}
                className={waiting || nextUp ? "xl:col-span-2" : "xl:col-span-3"}
              >
                <HoursPills months={allMonths} now={now} />
              </Tile>
            ) : null}
          </div>
        ) : null}

        {/* Before the profile is live the glanceable facts sit beside the current
            stage, and Activity shows only once there is some. */}
        {gettingStarted ? (
          history.length > 0 || (activated && openRolesTile) ? (
            <div className="grid gap-4 xl:grid-cols-2 xl:[&>:only-child]:col-span-2">
              {history.length > 0 ? activity : null}
              {activated ? openRolesTile : null}
            </div>
          ) : null
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="grid min-w-0 content-start gap-4 xl:col-span-2">
              {activity}
              {!working && activated ? openRolesTile : null}
            </div>

            {/* ── Narrow column: glanceable facts. ── */}
            <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 md:[&>:last-child:nth-child(odd)]:col-span-2 xl:grid-cols-1 xl:[&>:last-child:nth-child(odd)]:col-span-1">
              {asideTiles}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
