import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { ArrowLeft, Check, ChevronDown, Clock, CreditCard, Download, X } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatDmy, formatMoney } from "@/lib/format";
import { fullTimeFeeMinor } from "@/lib/checkout";
import { laptopLabel, offerScore, parseOffer, WEEKLY_SCHEDULES } from "@/lib/offer";
import { shiftInIst } from "@/lib/timezones";
import { DetailRow, Pill } from "@/components/app/primitives";
import { MessageButton } from "@/components/app/messages/message-button";
import { ProposalAvatar } from "@/components/employer/proposal-avatar";
import { avatarUrl } from "@/lib/employer-pool";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";
import { offerState } from "@/components/employer/proposal-state";
import { offerTimeline } from "@/components/employer/proposal-timeline";
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
  let preference: WorkPreference = { modes: [], cities: [] };
  let hasLaptop: boolean | null = null;
  let photoUrl: string | null = null;
  let presence: PresenceLabel | null = null;
  try {
    const db = getDb();
    const [row] = await db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        projectName: schema.projects.projectName,
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

  const raw = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const offer = parseOffer(raw, proposal.currency);
  const currency = offer.currency;
  const state = offerState(proposal, offer);
  const skills = Array.isArray(proposal.skills) ? proposal.skills.filter(Boolean) : [];
  const snapshot = Object.entries(proposal.aiRatings ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[0] !== "overall",
  );
  const score = offerScore(raw) ?? 0;
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

  const timeline = offerTimeline(proposal, { startDate: offer.startDate, fullTime: Boolean(ft) }, state, formatDate);
  const profileHref = `/employer/intern/${encodeURIComponent(proposal.internId)}`;

  return (
    <div>
      <Link
        href="/employer/proposals"
        className="apple-spring mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      {/* ── Header: who, what, status, and the one thing to do ───────── */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ProposalAvatar photoUrl={photoUrl} initials={initials} presence={presence} />
          <div className="min-w-0">
            <p className="text-sm text-ink-600">
              <Link
                href={profileHref}
                className="inline-flex min-h-11 items-center font-semibold text-ink-900 underline decoration-ink-300 underline-offset-4 outline-none hover:text-brand-700 hover:decoration-brand-500 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-0"
              >
                {internName}
              </Link>
              {projectName ? <span> · {projectName}</span> : null}
            </p>
            <h1 className="text-balance break-words text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
              {offer.roleTitle || projectName || "Proposal"}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-600">
              <Pill tone={state.tone}>{state.label}</Pill>
              <span>{ft ? "Full-time offer" : "Internship offer"}</span>
              {score > 0 ? (
                <span className="nums">
                  <span className="font-semibold text-ink-900">{score.toFixed(1)}</span> Findtern Score
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start lg:shrink-0">
          {state.canPay ? (
            <Link href="/employer/checkout" className={buttonClass({ className: "max-sm:w-full" })}>
              <CreditCard className="size-4" aria-hidden />
              {ft ? "Pay the hiring fee" : "Pay to confirm hire"}
            </Link>
          ) : null}
          <div className="max-sm:[&_button]:w-full">
            <MessageButton proposalId={proposal.id} />
          </div>
        </div>
      </header>

      {/* ── The four numbers the decision rests on ───────────────────── */}
      <dl className="mt-8 grid grid-cols-2 border-y border-ink-100 sm:grid-cols-4">
        {strip.map(([label, value], i) => (
          <div
            key={label}
            className={[
              "py-5 sm:px-6 sm:first:pl-0",
              i % 2 === 1 ? "border-l border-ink-100 pl-5" : "",
              i >= 2 ? "border-t border-ink-100 sm:border-t-0" : "",
              i === 2 ? "sm:border-l" : "",
            ].join(" ")}
          >
            <dt className="text-sm text-ink-600">{label}</dt>
            <dd className="nums mt-1 text-xl font-semibold text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          {!ft ? (
            <section>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Terms</h2>
              <dl className="mt-2 divide-y divide-ink-100 border-b border-ink-100">
                <DetailRow label="Hourly rate" value={offer.hourlyRateMinor ? `${formatMoney(offer.hourlyRateMinor, currency)} an hour` : offer.hourlyRateMinor === 0 ? "Free" : "-"} mono />
                <DetailRow
                  label="Monthly amount"
                  value={
                    offer.monthlyMinor ? (
                      <>
                        {formatMoney(offer.monthlyMinor, currency)}
                        {currency === "INR" ? <span className="ml-1 text-xs font-normal text-text-subtle">(includes GST)</span> : null}
                      </>
                    ) : monthlyFree ? (
                      "Free"
                    ) : (
                      "-"
                    )
                  }
                  mono
                />
                {offer.perHireMinor ? <DetailRow label="One-time hiring fee" value={formatMoney(offer.perHireMinor, currency)} mono /> : null}
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
                        {ist ? <span className="block text-xs font-normal text-text-subtle">{ist} for the intern</span> : null}
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
            </section>
          ) : (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Full-time terms</h2>
                {ft.offerLetterKey || ft.offerLetterUrl ? (
                  <a
                    href={`/api/proposals/${encodeURIComponent(proposal.id)}/offer-letter`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass({ variant: "outline", size: "sm" })}
                  >
                    <Download className="size-4" aria-hidden />
                    Offer letter
                  </a>
                ) : null}
              </div>
              <dl className="mt-2 divide-y divide-ink-100 border-b border-ink-100">
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
            </section>
          )}

          {offer.jd ? (
            <section>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">What the intern will do</h2>
              {/* Text: legacy Quill HTML is read back as plain text (EMH-28). */}
              <p className="mt-3 max-w-prose whitespace-pre-line text-pretty text-base leading-relaxed text-ink-800 [overflow-wrap:anywhere]">{offer.jd}</p>
            </section>
          ) : null}

          {offer.additionalInfo ? (
            <section>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Additional information</h2>
              <p className="mt-3 max-w-prose whitespace-pre-line text-pretty text-base leading-relaxed text-ink-800 [overflow-wrap:anywhere]">{offer.additionalInfo}</p>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Skills</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li key={skill} className="rounded-full border border-ink-200 px-3 py-1 text-sm font-medium text-ink-700">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Phones: the assessment after the terms, not above them. */}
          {ratings.length > 0 ? (
            <section className="border-t border-ink-100 pt-8 lg:hidden">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Assessment at sending</h2>
              <dl className="mt-1 divide-y divide-ink-100">
                {ratings.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={key === "overall" ? "Findtern Score" : humanizeKey(key)}
                    value={`${value}/10`}
                    mono
                  />
                ))}
              </dl>
            </section>
          ) : null}

          <details className="group border-t border-ink-100 pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-lg font-semibold tracking-[-0.01em] text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
              Meeting rules
              <ChevronDown className="size-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-1 text-sm text-text-subtle">By joining any meeting scheduled through Findtern, you agree to this conduct policy.</p>
            <MeetingRulesList className="mt-4" />
          </details>
        </div>

        <aside className="order-first space-y-10 lg:order-none lg:sticky lg:top-24 lg:self-start">
          {/* ── Timeline: what happened, what is next ─────────────────── */}
          <section>
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Offer timeline</h2>
            <ol className="mt-4">
              {timeline.map((step, i) => {
                const last = i === timeline.length - 1;
                return (
                  <li key={step.label} className="relative flex gap-3.5 pb-6 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
                    {!last ? (
                      <span aria-hidden className={cn("absolute left-[0.6875rem] top-7 bottom-1 w-px", step.state === "done" ? "bg-brand-300" : "bg-ink-200")} />
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                        step.state === "done" && "bg-brand-700 text-white",
                        step.state === "current" && "bg-white ring-2 ring-inset ring-brand-700",
                        step.state === "todo" && "bg-white ring-1 ring-inset ring-ink-300",
                        step.state === "closed" && "bg-ink-200 text-ink-700",
                      )}
                    >
                      {step.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      {step.state === "current" ? <span className="size-2 rounded-full bg-brand-700" /> : null}
                      {step.state === "closed" ? <X className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-sm", step.state === "todo" ? "text-ink-600" : "font-semibold text-ink-900")}>
                        {step.label}
                        <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (next)" : ""}</span>
                      </p>
                      {step.date ? <p className="nums text-sm text-ink-600">{step.date}</p> : null}
                      {step.state === "current" || step.state === "closed" ? (
                        state.next ? <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-700">{state.next}</p> : null
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {state.canWithdraw || state.canEdit || proposal.status === "hired" ? (
            <section className="border-t border-ink-100 pt-8">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{proposal.status === "hired" ? "Hire" : "Change this offer"}</h2>
              <div className="mt-4 grid gap-2">
                {state.canEdit ? (
                  <ProposalOfferForm
                    proposalId={proposal.id}
                    defaultOpen={edit === "1"}
                    accepted={proposal.status === "accepted"}
                    preference={preference}
                    currency={currency}
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
                <ProposalActions proposalId={proposal.id} status={proposal.status} canPay={false} canWithdraw={state.canWithdraw} />
                {proposal.status === "hired" && !ft ? (
                  <Link href="/employer/timesheets" className={buttonClass({ variant: "outline", block: true })}>
                    <Clock className="size-4" aria-hidden />
                    Timesheets
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {ratings.length > 0 ? (
            <section className="border-t border-ink-100 pt-8 max-lg:hidden">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Assessment at sending</h2>
              <dl className="mt-1 divide-y divide-ink-100">
                {ratings.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={key === "overall" ? "Findtern Score" : humanizeKey(key)}
                    value={`${value}/10`}
                    mono
                  />
                ))}
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** DD/MM/YYYY (bug sheet 7), in India time. */
function formatDate(value: Date | string | null): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return formatDmy(d);
}

/** "problemSolving" / "problem_solving" → "Problem solving". */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
