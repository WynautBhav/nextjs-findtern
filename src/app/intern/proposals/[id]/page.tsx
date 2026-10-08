import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { PageHead, Pill, Surface, WaitingNote } from "@/components/app/primitives";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/proposal-status";
import { ScoreBar } from "@/components/app/score-bar";
import { getSession } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { formatDayLabel, formatMoney } from "@/lib/format";
import { toArray } from "@/lib/journey";

export const metadata: Metadata = {
  title: "Offer",
  robots: { index: false, follow: false },
};

/**
 * One offer, in full.
 *
 * The only intern screen that was genuinely well built, and the only one where
 * the information was already right. It has been rebuilt onto the shared
 * primitives rather than left as the one screen that looks different from
 * everything else, and the accept and reject actions, which returned 403 for
 * everybody, now work.
 *
 * Every figure here is visible before anyone negotiates with anyone. That is
 * the product's actual claim and this page is where it has to be true, so the
 * score is shown next to what it decided rather than hidden behind a
 * disclosure.
 */
export default async function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;

  const data = await loadInternData(session.uid);
  const proposal = data.proposals.find((p) => p.id === id);

  // Ownership is checked before anything is read out of the row, so a guessed
  // id returns the same 404 as a missing one and cannot be used to probe for
  // which offers exist.
  if (!proposal || !canAccess(session, proposal.internId)) notFound();

  const offer = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  const ratings = (proposal.aiRatings ?? {}) as Record<string, unknown>;
  const projects = await projectNames([proposal.projectId ?? ""]);

  const role = typeof offer.roleTitle === "string" ? offer.roleTitle : "Internship";
  const company = data.names[proposal.employerId] ?? "A company on Findtern";
  const stipendMinor = typeof offer.monthlyAmountMinor === "number" ? offer.monthlyAmountMinor : null;
  const stipend = stipendMinor ? formatMoney(stipendMinor, "INR") : "To be confirmed";
  const startDate = typeof offer.startDate === "string" ? offer.startDate : null;
  const status = proposalStatus(proposal.status);
  const skills = toArray<string>(proposal.skills);
  const ratingRows = [
    ["Communication", ratings.communication],
    ["Coding", ratings.coding],
    ["Aptitude", ratings.aptitude],
    ["Overall", ratings.overall],
  ].filter(([, v]) => typeof v === "number") as [string, number][];

  const decided = proposal.status !== "sent";

  return (
    <div>
      <Link
        href="/intern/proposals"
        className="mb-6 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors duration-[var(--dur-instant)] hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All offers
      </Link>

      <PageHead
        title={role}
        lede={`${company}${projects[proposal.projectId ?? ""] ? `, on ${projects[proposal.projectId ?? ""]}` : ""}`}
        action={<Pill tone={status.tone}>{status.label}</Pill>}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Surface className="p-6">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              What is on offer
            </h2>
            <dl className="mt-4 divide-y divide-ink-100">
              <Row label="Stipend" value={`${stipend} a month`} emphasis />
              <Row
                label="Hours"
                value={
                  typeof offer.hoursPerWeek === "number"
                    ? `${offer.hoursPerWeek} a week`
                    : "To be agreed"
                }
              />
              <Row
                label="Length"
                value={
                  typeof offer.durationWeeks === "number"
                    ? `${offer.durationWeeks} weeks`
                    : "To be agreed"
                }
              />
              <Row
                label="Starts"
                value={startDate ? formatDayLabel(startDate) : "To be agreed"}
              />
              <Row label="Timezone" value={stringOr(offer.timezone, "Asia/Kolkata")} />
              <Row label="Sent" value={formatDayLabel(proposal.createdAt)} />
            </dl>
          </Surface>

          {skills.length > 0 ? (
            <Surface className="p-6">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
                What you were assessed on
              </h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill}>
                    <Pill tone="neutral">{skill}</Pill>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          {/* ── The decision ──────────────────────────────────────── */}
          <Surface className="p-6">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
              {decided ? "What you decided" : "Your decision"}
            </h2>
            {decided ? (
              <>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                  {status.detail} Nothing about this changes on its own and nothing is deleted.
                </p>
                {proposal.status === "accepted" || proposal.status === "hired" ? (
                  <Link
                    href="/intern/timesheets"
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-[var(--dur-instant)] hover:bg-primary-hover active:scale-[0.98]"
                  >
                    Log your hours
                  </Link>
                ) : null}
              </>
            ) : (
              <div className="mt-4">
                <OfferDecision
                  proposalId={proposal.id}
                  roleTitle={role}
                  company={company}
                  stipend={stipend}
                  startDate={startDate}
                />
              </div>
            )}
          </Surface>
        </div>

        <aside className="space-y-4">
          {/* ── The score ───────────────────────────────────────────
              Shown openly, with the parts it is made of, rather than
              behind a disclosure. The claim this product makes is that
              the number and what it decided are both visible before
              anyone negotiates, and a screen that hides it would
              contradict the pitch on the sign in page. */}
          {ratingRows.length > 0 ? (
            <Surface className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                  Your score
                </h2>
                <Sparkles className="size-4 text-accent-500" aria-hidden />
              </div>
              <ul className="mt-4 space-y-3">
                {ratingRows.map(([label, value]) => (
                  <li key={label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink-600">{label}</span>
                      <span className="text-sm font-semibold tabular-nums text-ink-900">
                        {value}/10
                      </span>
                    </div>
                    <ScoreBar value={value} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-pretty text-xs leading-relaxed text-ink-500">
                One assessment produces this and the rate that follows from it. Both are visible to
                you before any employer sees them.
              </p>
            </Surface>
          ) : null}

          {/* ── What happens after you accept ─────────────────────── */}
          <Surface className="p-5">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
              After you accept
            </h2>
            <ol className="mt-3 space-y-3">
              {[
                "The company books an interview and offers you times to choose from.",
                "Your timesheet opens. Hours save on their own each time you type them.",
                "Your stipend is paid on the agreed date, and it appears on your record.",
                "Every one of those becomes something you can show the next employer.",
              ].map((line, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <span className="text-pretty text-sm leading-relaxed text-ink-600">{line}</span>
                </li>
              ))}
            </ol>
          </Surface>

          {!decided ? (
            <Surface className="p-5">
              <h2 className="text-sm font-semibold tracking-[-0.01em] text-ink-900">
                If you do nothing
              </h2>
              <div className="mt-2">
                <WaitingNote
                  who="Nobody"
                  typical="This offer stays open until the start date passes. Nothing expires early and no one is notified that you have not looked at it."
                />
              </div>
            </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="shrink-0 text-sm text-ink-500">{label}</dt>
      <dd
        className={
          emphasis
            ? "min-w-0 text-right text-lg font-semibold tabular-nums tracking-[-0.01em] text-ink-900"
            : "min-w-0 text-right text-sm font-medium text-ink-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}