import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, ArrowUpRight, CreditCard, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { formatMoney } from "@/lib/format";
import { fullTimeFeeMinor } from "@/lib/checkout";
import { laptopLabel, offerScore, parseOffer, WEEKLY_SCHEDULES } from "@/lib/offer";
import { shiftInIst } from "@/lib/timezones";
import { DetailRow, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { ProposalActions } from "@/components/employer/proposal-actions";
import { ProposalOfferForm } from "@/components/employer/proposal-offer-form";
import { offerState } from "@/components/employer/proposal-state";
import { MeetingRulesBlock } from "@/components/employer/meeting-rules";
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
      })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    preference = workPreferenceOf(pref);
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

  const strip: [string, string][] = ft
    ? [
        ["Annual CTC", ft.annualCtcMinor ? formatMoney(ft.annualCtcMinor, currency) : "-"],
        ["Hiring fee", ft.annualCtcMinor ? formatMoney(fullTimeFeeMinor(ft.annualCtcMinor), currency) : "-"],
        ["Joining", formatDate(offer.startDate)],
        ["Type", "Full-time"],
      ]
    : [
        // One month's amount only (client QA) - no monthly × months total.
        ["Monthly", offer.monthlyMinor != null ? formatMoney(offer.monthlyMinor, currency) : "-"],
        ["Hours a month", offer.monthlyHours ? `${offer.monthlyHours} h` : "-"],
        ["Starts", formatDate(offer.startDate)],
        ["Length", `${offer.months} month${offer.months === 1 ? "" : "s"}`],
      ];

  return (
    <div>
      <Link
        href="/employer/proposals"
        className="apple-spring mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      {/* ── Header: who, what, and the numbers ───────────────────────── */}
      <Surface as="section" className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6 sm:p-7">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-base font-bold text-brand-800">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                {ft ? "Full-time offer" : "Internship offer"}
                {projectName ? ` · ${projectName}` : ""}
              </p>
              <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
                {offer.roleTitle || projectName || "Proposal"}
              </h1>
              <p className="mt-1.5 text-sm text-ink-600">
                To{" "}
                <Link href={`/employer/intern/${encodeURIComponent(proposal.internId)}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  {internName}
                </Link>
                {score > 0 ? <span className="nums ml-2">· Findtern Score {score.toFixed(1)}/10</span> : null}
              </p>
            </div>
          </div>
          <Pill tone={state.tone}>{state.label}</Pill>
        </div>
        <dl className="grid grid-cols-2 border-t border-ink-100 bg-ink-50/60 sm:grid-cols-4">
          {strip.map(([label, value], i) => (
            <div
              key={label}
              className={[
                "px-6 py-4",
                i % 2 === 1 ? "border-l border-ink-100" : "",
                i >= 2 ? "border-t border-ink-100 sm:border-t-0" : "",
                i === 2 ? "sm:border-l" : "",
              ].join(" ")}
            >
              <dt className="text-sm text-ink-600">{label}</dt>
              <dd className="nums mt-1 text-xl font-semibold tracking-[-0.01em] text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Surface>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          {!ft ? (
            <Surface as="section" className="px-6 pb-2 pt-5">
              <SectionHead title="Terms" />
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Hourly rate" value={offer.hourlyRateMinor ? `${formatMoney(offer.hourlyRateMinor, currency)} an hour` : "-"} mono />
                <DetailRow
                  label="Monthly amount"
                  value={
                    offer.monthlyMinor != null ? (
                      <>
                        {formatMoney(offer.monthlyMinor, currency)}
                        {currency === "INR" ? <span className="ml-1 text-xs font-normal text-ink-500">(includes GST)</span> : null}
                      </>
                    ) : (
                      "-"
                    )
                  }
                  mono
                />
                {offer.perHireMinor ? <DetailRow label="One-time hiring fee" value={formatMoney(offer.perHireMinor, currency)} mono /> : null}
                <DetailRow label="Working week" value={WEEKLY_SCHEDULES[offer.weeklySchedule].label} />
                <DetailRow label="Paid leave" value={offer.paidLeavesPerMonth ? `${offer.paidLeavesPerMonth} days a month` : "None"} />
                <DetailRow
                  label="Working hours"
                  value={
                    flexible ? (
                      "Flexible, set by the intern"
                    ) : (
                      <>
                        {offer.shiftFrom}–{offer.shiftTo}
                        {ist ? <span className="block text-xs font-normal text-ink-500">{ist} for the intern</span> : null}
                      </>
                    )
                  }
                  mono
                />
                <DetailRow label="Timezone" value={offer.timezone || "Asia/Kolkata"} />
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

          {!ft ? (
            <Surface as="section" className="px-6 pb-2 pt-5">
              <SectionHead title="Work setup" />
              <dl className="divide-y divide-ink-100">
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
          ) : null}

          {offer.jd ? (
            <Surface as="section" className="p-6">
              <SectionHead title="What the intern will do" />
              {/* Text: legacy Quill HTML is read back as plain text (EMH-28). */}
              <p className="whitespace-pre-line text-pretty text-[0.9375rem] leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{offer.jd}</p>
            </Surface>
          ) : null}

          {skills.length > 0 ? (
            <Surface as="section" className="p-6">
              <SectionHead title="Skills" />
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800">
                    {skill}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          <MeetingRulesBlock />
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-24 lg:self-start">
          <Surface as="section" className="p-5">
            <h2 className="text-base font-semibold text-ink-900">What happens next</h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-700">{state.next}</p>
            <ol className="nums mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm text-ink-600">
              <li>Sent {formatDate(proposal.createdAt)}</li>
              {proposal.updatedAt && proposal.updatedAt.getTime() - (proposal.createdAt?.getTime() ?? 0) > 60_000 ? (
                <li>Updated {formatDate(proposal.updatedAt)}</li>
              ) : null}
              {proposal.hiredAt ? <li>Hired {formatDate(proposal.hiredAt)}</li> : null}
            </ol>

            {state.canPay || state.canWithdraw || state.canEdit || proposal.status === "hired" ? (
              <div className="mt-4 grid gap-2">
                {state.canPay ? (
                  <Link href="/employer/checkout" className={buttonClass({ block: true })}>
                    <CreditCard className="size-4" aria-hidden />
                    Proceed to checkout
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
                    label={key === "overall" ? "Findtern Score" : key.charAt(0).toUpperCase() + key.slice(1)}
                    value={`${value}/10`}
                    mono
                  />
                ))}
              </dl>
            </Surface>
          ) : null}

          <Link
            href={`/employer/intern/${encodeURIComponent(proposal.internId)}`}
            className="apple-spring flex min-h-11 items-center justify-between gap-2 rounded-apple-xl border border-dashed border-ink-200 px-5 py-4 text-sm font-medium text-ink-700 hover:border-brand-300 hover:bg-white"
          >
            {unlocked ? `${internName}'s profile` : "Candidate profile"}
            <ArrowUpRight className="size-4 text-ink-400" aria-hidden />
          </Link>
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
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
}
