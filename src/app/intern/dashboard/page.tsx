import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap, Video } from "lucide-react";

import { EmptyScene, PageHead, SectionHead, Surface } from "@/components/app/primitives";
import { ReadinessStrip } from "@/components/app/readiness";
import { StatusStrip, Thread } from "@/components/app/thread";
import { ActivationCard } from "@/components/intern/activation-card";
import { GettingStarted } from "@/components/intern/getting-started";
import { CompanyInitials } from "@/components/marketing/role-card";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { nextAction, slotOf } from "@/lib/journey";
import { formatMoney, formatSlotTime } from "@/lib/format";
import { isInternPaid } from "@/lib/payments";
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

/** Per-axis scores backing the dashboard breakdown. Null when never assessed. */
function ratingsOf(
  onboarding: { extraData?: Record<string, unknown> | null } | null,
): { communication: number; coding: number; aptitude: number; interview: number } | null {
  const raw = extraBag(onboarding).ratings;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(record[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const ratings = {
    communication: num("communication"),
    coding: num("coding"),
    aptitude: num("aptitude"),
    interview: num("interview"),
  };
  return ratings.communication + ratings.coding + ratings.aptitude + ratings.interview > 0
    ? ratings
    : null;
}

export default async function InternHome() {
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const action = nextAction(data.thread);
  const working = data.stage === "working";
  const open = working ? [] : await openProjects(6);

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

  // Scheduled company or AI assessment interview
  const scheduledInterviews = data.interviews.filter(
    (i) => String(i.status ?? "").toLowerCase() === "scheduled" && (i.selectedSlot || i.meetingLink),
  );
  const upcomingInterviewItem = scheduledInterviews
    .map((i) => ({ interview: i, when: slotOf(i) ?? (i.createdAt || new Date()) }))
    .filter((x): x is { interview: (typeof scheduledInterviews)[0]; when: Date } =>
      // A booked meeting keeps its Join link until slot + 60 min (legacy).
      Boolean(x.when && (!slotOf(x.interview) || isMeetingLinkLive(x.interview))),
    )
    .sort((a, b) => a.when.getTime() - b.when.getTime())[0] ?? null;

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
  const gettingStarted = !working && (!completion.complete || !activated || score === null);

  // The pending action is shown once, in the strip; the thread skips it.
  const history = action ? data.thread.filter((n) => n !== action) : data.thread;

  return (
    <div>
      <PageHead
        title={`Hello, ${user?.first ?? "there"}`}
        lede={
          working
            ? "Your internship, and anything waiting on you."
            : gettingStarted
              ? "Three steps, in order, before employers can find you."
              : action
              ? "One thing is waiting on you."
              : "Nothing is waiting on you. Employers can find your profile."
        }
      />

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          {gettingStarted ? (
            <GettingStarted
              completion={completion}
              activated={activated}
              scored={score !== null}
              feeMinor={activationFeeMinor}
              action={
                <ActivationCard
                  embedded
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
                        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                          {p.projectName}
                        </span>
                        <span className="block truncate text-[13px] text-ink-600">
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
              <p className="text-[13px] font-medium text-ink-600">Next interview</p>
              <p className="mt-1 text-[15px] font-semibold text-ink-900">
                {data.names[upcomingInterviewItem.interview.employerId] ?? "Employer interview"}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {/* In the meeting's zone, labelled: the server runs in UTC. */}
                {formatSlotTime(upcomingInterviewItem.when, upcomingInterviewItem.interview.timezone || "Asia/Kolkata")}
              </p>
              {upcomingInterviewItem.interview.meetingLink ? (
                <a
                  href={upcomingInterviewItem.interview.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
                >
                  <Video className="size-4" aria-hidden />
                  Join meeting
                </a>
              ) : null}
            </Surface>
          ) : null}

          <Surface className="p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-ink-600">Findtern Score</p>
              <Link href="/intern/record" className="text-xs font-medium text-primary hover:underline">
                Details
              </Link>
            </div>
            {score === null ? (
              <p className="mt-2 text-sm text-ink-600">Your score appears after the AI interview.</p>
            ) : (
              <>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink-900">
                  {score.toFixed(1)}
                  <span className="ml-0.5 text-sm font-normal text-ink-600">/10</span>
                </p>
                {ratings ? (
                  <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-[13px]">
                    {(
                      [
                        ["Coding", ratings.coding],
                        ["Aptitude", ratings.aptitude],
                        ["Interview", ratings.interview],
                        ["Communication", ratings.communication],
                      ] as const
                    )
                      .filter(([, v]) => v > 0)
                      .map(([label, v]) => (
                        <div key={label} className="flex justify-between gap-2">
                          <dt className="text-ink-600">{label}</dt>
                          <dd className="font-medium tabular-nums text-ink-900">{v.toFixed(1)}</dd>
                        </div>
                      ))}
                  </dl>
                ) : null}
              </>
            )}
          </Surface>

          {college ? (
            <Link
              href="/intern/college"
              className="flex items-center gap-3 rounded-[14px] border border-ink-200/80 bg-white px-5 py-3.5 text-sm text-ink-700 transition-colors hover:border-ink-300"
            >
              <GraduationCap className="size-4 shrink-0 text-brand-700" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink-900">{college.name}</span>
                {college.status === "verified" ? " · verified" : " · not verified yet"}
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
            </Link>
          ) : (
            <Surface className="p-5">
              <p className="text-[15px] font-semibold text-ink-900">Is your college on Findtern?</p>
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

          <ReadinessStrip readiness={data.readiness} />

          <Surface className="p-5">
            <OpenToWorkToggle initial={openToWork} visibleAgainAt={visibleAgain} />
          </Surface>

          {working || data.money.paidMinor > 0 ? (
            <Surface className="p-5">
              <p className="text-[13px] font-medium text-ink-600">Paid to you</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink-900">
                {formatMoney(data.money.paidMinor, "INR")}
              </p>
              {data.money.incomingMinor > 0 ? (
                <p className="mt-1 text-sm text-ink-600">
                  {formatMoney(data.money.incomingMinor, data.money.currency, { zeroLabel: false })} on its way
                  {data.money.nextExpectedAt
                    ? `, due ${data.money.nextExpectedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
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
            className="flex items-center justify-between rounded-[14px] border border-dashed border-ink-200 px-5 py-3.5 text-sm text-ink-700 transition-colors hover:border-ink-300 hover:bg-white"
          >
            See your profile as employers do
            <ArrowRight className="size-4 text-ink-400" aria-hidden />
          </Link>
        </aside>
      </div>
    </div>
  );
}