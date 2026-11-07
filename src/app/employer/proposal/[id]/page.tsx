import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleDashed, CreditCard, Download, Hourglass, XCircle } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatDmy, formatMoney } from "@/lib/format";
import { fullTimeFeeMinor } from "@/lib/checkout";
import { laptopLabel, offerScore, parseOffer, WEEKLY_SCHEDULES } from "@/lib/offer";
import { shiftInIst } from "@/lib/timezones";
import { Avatar } from "@/components/app/avatar";
import { DetailRow, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";
import { offerState } from "@/components/employer/proposal-state";
import { ProposalHero } from "@/components/employer/proposal-detail/hero";
import { MeetingRulesBlock } from "@/components/employer/meeting-rules";
import { StartThreadButton } from "@/components/messaging";
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

  const status = (proposal.status ?? "").toLowerCase();
  const answered = ["accepted", "processing", "hired", "rejected", "withdrawn"].includes(status);
  const timeline: { label: string; done: boolean; when?: string }[] = [
    { label: "Offer sent", done: true, when: formatDate(proposal.createdAt) },
    { label: "Interview booked", done: status === "interview_scheduled" || answered },
    { label: status === "rejected" ? "Declined" : status === "withdrawn" ? "Withdrawn" : "Candidate accepted", done: answered },
    { label: "Hired", done: Boolean(proposal.hiredAt), when: proposal.hiredAt ? formatDate(proposal.hiredAt) : undefined },
  ];

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

  return (
    <div>
      {state.canPay ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 p-3 lg:hidden">
          <Link href="/employer/checkout" className={buttonClass({ variant: "accent", block: true })}>
            <CreditCard className="size-4" aria-hidden />
            Pay to confirm the hire
          </Link>
        </div>
      ) : null}
      <Link
        href="/employer/proposals"
        className="apple-spring mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      <ProposalHero
        avatar={<Avatar masked={!unlocked} name={unlocked ? internName : undefined} initials={initials} size="lg" />}
        title={offer.roleTitle || projectName || "Proposal"}
        subtitle={
          <>
            {ft ? "Full-time offer" : "Internship offer"}
            {projectName ? ` for ${projectName}` : ""} to{" "}
            <Link href={`/employer/intern/${encodeURIComponent(proposal.internId)}`} className="font-medium text-white underline-offset-4 hover:underline">
              {internName}
            </Link>
            {score > 0 ? <span className="nums ml-2">· Findtern Score {score.toFixed(1)}/10</span> : null}
          </>
        }
        status={<Pill tone={state.tone} size="md" icon={<StatusIcon tone={state.tone} hired={proposal.status === "hired"} />}>{state.label}</Pill>}
        next={state.next}
        figures={strip.slice(0, 4).map(([l, v]) => [l, v] as [string, string])}
        timeline={timeline}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          {!ft ? (
            <Surface as="section" className="px-6 pb-2 pt-5">
              <SectionHead title="Terms" />
              <dl className="divide-y divide-ink-100">
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
                {/* Work setup sits in the same table: one card for one set of terms. */}
                <DetailRow label="Mode" value={MODE[offer.mode] ?? "-"} />
                {offer.mode !== "remote" ? (
                  <DetailRow label="Location" value={[offer.city, offer.state].filter(Boolean).join(", ") || offer.location || "-"} />
                ) : null}
                {offer.mode === "hybrid" ? (
                  <DetailRow label="Hybrid split" value={`${offer.officeDays ?? 0} office · ${offer.homeDays ?? 0} home days a week`} />
                ) : null}
                <DetailRow label="Laptop" value={laptopLabel(offer.laptop)} />
              </dl>
            </Surface>
          ) : (
            <Surface as="section" className="px-6 pb-2 pt-5">
              <SectionHead
                title="Full-time offer"
                hint="As sent to the candidate."
                action={
                  ft.offerLetterKey || ft.offerLetterUrl ? (
                    <a
                      href={`/api/proposals/${encodeURIComponent(proposal.id)}/offer-letter`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClass({ size: "sm" })}
                    >
                      <Download className="size-4" aria-hidden />
                      Offer letter
                    </a>
                  ) : null
                }
              />
              <dl className="divide-y divide-ink-100">
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
            </Surface>
          )}


          {offer.jd ? (
            <Surface as="section" className="p-6">
              <SectionHead title="What the intern will do" />
              {/* Text: legacy Quill HTML is read back as plain text (EMH-28). */}
              <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{offer.jd}</p>
            </Surface>
          ) : null}

          {offer.additionalInfo ? (
            <Surface as="section" className="p-6">
              <SectionHead title="Additional information" />
              <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{offer.additionalInfo}</p>
            </Surface>
          ) : null}

          {skills.length > 0 ? (
            <Surface as="section" className="p-6">
              <SectionHead title="Skills" />
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill} className="rounded-apple-sm bg-ink-100 px-2.5 py-1 text-sm text-ink-700">
                    {skill}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          <MeetingRulesBlock />
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-24 lg:self-start">
          <Link
            href={`/employer/intern/${encodeURIComponent(proposal.internId)}`}
            className="apple-spring flex min-h-11 items-center justify-between gap-2 rounded-apple-xl border border-dashed border-ink-200 px-5 py-4 text-sm font-medium text-ink-700 hover:border-brand-300 hover:bg-white"
          >
            {unlocked ? `${internName}'s profile` : "Candidate profile"}
            <ArrowUpRight className="size-4 text-ink-400" aria-hidden />
          </Link>
          <StartThreadButton
            counterpartId={proposal.internId}
            proposalId={proposal.id}
            role="employer"
            className="w-full border border-ink-200 bg-white font-medium text-ink-800 hover:bg-ink-50"
          >
            Message the candidate
          </StartThreadButton>
          <Surface as="section" className="rounded-[24px] p-5 shadow-tile">
            <h2 className="text-base font-semibold text-ink-900">Actions</h2>
            {state.canPay || state.canWithdraw || state.canEdit || proposal.status === "hired" ? (
              <div className="mt-4 grid gap-2">
                {state.canPay ? (
                  <Link href="/employer/checkout" className={buttonClass({ variant: "accent", block: true })}>
                    <CreditCard className="size-4" aria-hidden />
                    Pay to confirm the hire
                  </Link>
                ) : null}
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
              </div>
            ) : null}
          </Surface>

          {ratings.length > 0 ? (
            <Surface as="section" className="px-5 pb-1 pt-4">
              <h2 className="text-base font-semibold text-ink-900">Assessment at sending</h2>
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
            </Surface>
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

function StatusIcon({ tone, hired }: { tone: string; hired: boolean }) {
  if (hired) return <CheckCircle2 />;
  if (tone === "closed") return <XCircle />;
  if (tone === "waiting") return <Hourglass />;
  if (tone === "paid") return <CreditCard />;
  return <CircleDashed />;
}
