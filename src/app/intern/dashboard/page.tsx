import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";

import { EmptyScene, HeroBand, Pill, SectionHead, StatTile, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { StatusStrip, Thread } from "@/components/app/thread";
import { ActivationCard } from "@/components/intern/activation-card";
import { GettingStarted } from "@/components/intern/getting-started";
import { MeetingJoinButton } from "@/components/intern/meeting-join";
import { CompanyInitials } from "@/components/marketing/role-card";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { aiInterviewPhase, isAiInterview, isScored, joinableLink, latestAiInterview } from "@/lib/ai-interview";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { nextAction, slotOf } from "@/lib/journey";
import { formatMoney, formatSlotTime } from "@/lib/format";
import { isInternPaid } from "@/lib/payments";
import { isHiredProposal } from "@/lib/hire-status";
import { paymentsAreFree } from "@/lib/razorpay";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { visibleAgainAt } from "@/lib/profile-hide";
import { profileCompletion } from "@/lib/onboarding";
import { membershipOf } from "@/lib/college/membership";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/**
 * Home.
 *
 * One main column for what is happening (the pending action once, then the
 * activity thread, then open roles while searching) and a narrow rail of
 * glanceable facts: next interview, score, profile completeness, visibility,
 * money. Nothing appears twice, and nothing shows a number it does not have:
 * no score before the interview, no "₹0 on its way".
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

  const data = await loadInternData(session.uid);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const open = working ? [] : await openProjects(6, { strict: true });

  const [user] = await getDb()
    .select({
      first: schema.users.firstName,
      last: schema.users.lastName,
      email: schema.users.email,
      countryCode: schema.users.countryCode,
      phoneNumber: schema.users.phoneNumber,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  // Activation: the one-time ₹2,499 that takes a profile live. Once any paid
  // row exists the card leaves the dashboard for good.
  const activated = await isInternPaid(session.uid);
  const activationFeeMinor = await getInternActivationFeeMinor();

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
  const college = await membershipOf(session.uid).catch(() => null);
  const score = scoreOf(data.onboarding);
  const ratings = ratingsOf(data.onboarding);
  // Profile → activation → AI interview, in that order, until all three are done.
  const completion = profileCompletion(data.onboarding, {
    hasPanImage: Boolean(data.document?.panImageName),
    hasAadhaarImage: Boolean(data.document?.aadhaarImageName),
    hasPhoto: Boolean(data.document?.profilePhotoName),
  });
  const gettingStarted = !working && (!completion.complete || !activated || aiPhase !== "scored");
  // Legacy badge (dashboard.tsx:1031): live only when paid and scored.
  const profileStatus = !openToWork
    ? { tone: "closed" as const, label: "Profile hidden" }
    : activated && aiPhase === "scored"
      ? { tone: "live" as const, label: "Profile live" }
      : { tone: "waiting" as const, label: "Profile pending" };

  // The pending action is shown once, in the strip; the thread skips it.
  const history = action ? data.thread.filter((n) => n !== action) : data.thread;

  const offersWaiting = data.proposals.filter((p) => p.status === "sent").length;
  const showInterviewTile = !working || Boolean(upcomingInterviewItem);
  // Hours open only once the company has paid (bug sheet 7, S1 r65); an
  // accepted, unpaid offer is "working" but has nothing to log yet.
  const hired = data.proposals.some((p) => isHiredProposal(p));
  const lede = working
    ? hired
      ? "Your internship, and anything waiting on you."
      : "You accepted an offer. Logging hours opens once the company completes its payment."
    : gettingStarted
      ? "Three steps, in order, before employers can find you."
      : action
        ? "One thing is waiting on you."
        : openToWork
          ? "Nothing is waiting on you. Employers can find your profile."
          : "Nothing is waiting on you. Your profile is hidden from new employers.";

  return (
    <div>
      <HeroBand
        eyebrow={working ? "Your internship" : gettingStarted ? "Getting started" : openToWork ? "Your profile is live" : "Your profile is hidden"}
        title={`Hello, ${user?.first ?? "there"}`}
        lede={lede}
        actions={
          action?.href ? (
            <Link href={action.href} className={buttonClass({ variant: "accent" })}>
              {action.action ?? "Open"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : working && !hired && data.engagement ? (
            <Link href={`/intern/proposals/${data.engagement.id}`} className={buttonClass({ variant: "outlineLight" })}>
              See your offer
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : working ? (
            // Amber means "do this now"; a sheet that is due arrives as the
            // action above. With nothing waiting it was false urgency.
            <Link href="/intern/timesheets" className={buttonClass({ variant: "outlineLight" })}>
              Timesheets
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : !gettingStarted ? (
            <Link href="/intern/opportunities" className={buttonClass({ variant: "outlineLight" })}>
              See open roles
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      >
        <div className={cn("grid grid-cols-2 gap-3", showInterviewTile && "sm:grid-cols-3")}>
          <StatTile
            tone="onDark"
            label="Findtern Score"
            value={score === null ? null : <>{score.toFixed(1)}<span className="ml-0.5 text-base font-normal text-on-dark-subtle">/10</span></>}
            empty="After your AI interview"
            href="/intern/record"
          />
          {working ? (
            <StatTile
              tone="onDark"
              label="Paid to you"
              value={data.money.paidMinor > 0 ? formatMoney(data.money.paidMinor, "INR") : null}
              empty="Nothing paid yet"
              hint={
                data.money.incomingMinor > 0
                  ? `${formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way`
                  : undefined
              }
              href="/intern/earnings"
            />
          ) : (
            <StatTile
              tone="onDark"
              label="Offers waiting on you"
              value={offersWaiting > 0 ? offersWaiting : null}
              empty="None right now"
              href="/intern/proposals"
            />
          )}
          {/* Not for someone already working with nothing booked: "None booked" was noise. */}
          {showInterviewTile ? (
            <StatTile
              tone="onDark"
              label="Next interview"
              className="col-span-2 sm:col-span-1"
              value={null}
              empty={upcomingInterviewItem ? formatSlotTime(upcomingInterviewItem.when, IST) : "None booked"}
              href="/intern/interviews"
            />
          ) : null}
        </div>
      </HeroBand>

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          {gettingStarted ? (
            <GettingStarted
              completion={completion}
              activated={activated}
              feeMinor={activationFeeMinor}
              internId={session.uid}
              aiPhase={aiPhase}
              aiLink={aiPhase === "ready" ? joinableLink(aiRow?.meetingLink) : null}
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

          <StatusStrip node={action} stage={data.stage} />

          <section>
            <SectionHead
              title="Activity"
              action={
                history.length > 4 ? (
                  <Link href="/intern/record" className="text-sm font-medium text-primary hover:underline">
                    Full record
                  </Link>
                ) : null
              }
            />
            {data.thread.length === 0 && gettingStarted ? (
              <p className="text-sm text-ink-600">
                Offers, interviews, timesheets and payments appear here once your profile is live.
              </p>
            ) : data.thread.length === 0 ? (
              <EmptyScene
                title="Your activity starts with your profile"
                body="Once your profile is filled in, every application, interview, timesheet and payment lands here in order."
                next={{ label: "Fill in your profile", href: "/intern/onboarding" }}
                who="About four minutes"
              />
            ) : history.length === 0 ? (
              <p className="text-sm text-ink-600">Nothing else yet.</p>
            ) : (
              <Thread nodes={history.slice(0, 6)} compact />
            )}
          </section>

          {/* Roles open up once activation is paid (payment needs a complete profile). */}
          {!working && activated && openRoles.length > 0 ? (
            <section>
              <SectionHead
                title="Open roles"
                hint="Companies hiring now."
                action={
                  <Link href="/intern/opportunities" className="text-sm font-medium text-primary hover:underline">
                    See all
                  </Link>
                }
              />
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {openRoles.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/intern/opportunities/${p.id}`}
                      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50/70"
                    >
                      <CompanyInitials name={p.companyName} />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] font-medium text-ink-900 group-hover:text-brand-700">
                          {p.projectName}
                        </span>
                        <span className="block truncate text-sm text-ink-600">
                          {p.scopeOfWork}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-ink-300 group-hover:text-brand-700" aria-hidden />
                    </Link>
                  </li>
                ))}
              </Surface>
            </section>
          ) : null}
        </div>

        {/* ── Rail: glanceable facts ─────────────────────────────────── */}
        <aside className="space-y-4">
          {upcomingInterviewItem ? (
            <Surface className="p-5">
              <p className="text-sm font-medium text-ink-600">Next interview</p>
              <p className="mt-1 text-base font-semibold text-ink-900">
                {data.names[upcomingInterviewItem.interview.employerId] ?? "Company interview"}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {/* Interns always see India time, labelled (bug sheet 7, S2 r7). */}
                {formatSlotTime(upcomingInterviewItem.when, IST)}
              </p>
              {upcomingInterviewItem.interview.meetingLink ? (
                <div className="mt-4">
                  <MeetingJoinButton link={upcomingInterviewItem.interview.meetingLink} block />
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink-600">The meeting link arrives before the start time.</p>
              )}
            </Surface>
          ) : null}

          {ratings ? (
            <Surface className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-ink-900">How your score is made</h2>
                <Link href="/intern/record" className="text-sm font-medium text-primary hover:underline">
                  Details
                </Link>
              </div>
              <dl className="mt-4 space-y-3">
                {ratings.map(([label, v]) => (
                  <div key={label} className="grid grid-cols-[1fr_auto] gap-x-2 text-sm">
                    {/* dt and dd straight under the div (axe definition-list); the bar is a hidden second dd. */}
                    <dt className="text-ink-600">{label}</dt>
                    <dd className="nums font-semibold text-ink-900">{v.toFixed(1)}</dd>
                    <dd className="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, v * 10)}%` }} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Surface>
          ) : null}

          <Surface className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink-600">Profile status</p>
              <Pill tone={profileStatus.tone}>{profileStatus.label}</Pill>
            </div>
            <OpenToWorkToggle initial={openToWork} visibleAgainAt={visibleAgain} />
          </Surface>

          {college ? (
            <Link
              href="/intern/college"
              className="apple-spring flex min-h-14 items-center gap-3 rounded-apple-xl border border-ink-200/80 bg-white px-5 py-4 text-sm text-ink-700 shadow-xs hover:border-ink-300"
            >
              <GraduationCap className="size-4 shrink-0 text-brand-700" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink-900">{college.name}</span>
                {college.status === "verified" ? " · verified" : " · not verified yet"}
              </span>
              <ArrowRight className="size-4 shrink-0 text-text-subtle" aria-hidden />
            </Link>
          ) : (
            <Surface className="p-5">
              <h2 className="text-base font-semibold text-ink-900">Is your college on Findtern?</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                Join it to be seen in your college&apos;s placement drives, where employers call students the same day.
              </p>
              <Link
                href="/intern/college"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Find your college
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Surface>
          )}

          {!working && data.money.paidMinor > 0 ? (
            <Surface className="p-5">
              <p className="text-sm font-medium text-ink-600">Paid to you</p>
              <p className="nums mt-1 text-2xl font-semibold tracking-tight text-ink-900">
                {formatMoney(data.money.paidMinor, "INR")}
              </p>
              {data.money.incomingMinor > 0 ? (
                <p className="mt-1 text-sm text-ink-600">
                  {formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way
                  {data.money.nextExpectedAt
                    ? `, due ${data.money.nextExpectedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }).replace(/\bSept\b/, "Sep")}`
                    : ""}
                </p>
              ) : null}
              <Link href="/intern/earnings" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                Stipend breakdown
              </Link>
            </Surface>
          ) : null}

          <Link
            href="/intern/profile"
            className="apple-spring flex min-h-14 items-center justify-between rounded-apple-xl border border-dashed border-ink-200 px-5 py-4 text-sm font-medium text-ink-700 hover:border-brand-300 hover:bg-white"
          >
            See your profile as employers do
            <ArrowRight className="size-4 text-text-subtle" aria-hidden />
          </Link>
        </aside>
      </div>
    </div>
  );
}