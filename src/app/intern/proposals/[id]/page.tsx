import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface, WaitingNote } from "@/components/app/primitives";
import { OfferDecision } from "@/components/app/offer-decision";
import { proposalStatus } from "@/components/app/proposal-status";
import { ScoreBar } from "@/components/app/score-bar";
import { requireRole } from "@/lib/auth";
import { canAccess } from "@/lib/security/guards";
import { loadInternData, projectNames } from "@/lib/intern-data";
import { formatDayLabel, formatJoiningDate, formatMoney } from "@/lib/format";
import { toArray } from "@/lib/journey";
import { FREE_DECLINES, parseOffer, internStipendInrMinor, offerPastStart } from "@/lib/offer";

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
  const session = await requireRole("intern");

  const data = await loadInternData(session.uid);
  const proposal = data.proposals.find((p) => p.id === id);

  // Ownership is checked before anything is read out of the row, so a guessed
  // id returns the same 404 as a missing one and cannot be used to probe for
  // which offers exist.
  if (!proposal || !canAccess(session, proposal.internId)) notFound();

  const projects = await projectNames([proposal.projectId ?? ""]);

  const parsed = parseOffer(proposal.offerDetails, proposal.currency);
  const role = parsed.roleTitle || "Internship";
  const company = data.names[proposal.employerId] ?? "A company on Findtern";
  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const score = Number(extra.findternScore ?? 0) || 0;
  const stipendMinor = internStipendInrMinor(parsed, score);
  const stipend =
    stipendMinor === 0 ? "Not eligible for stipend" : stipendMinor ? formatMoney(stipendMinor, "INR") : "To be confirmed";
  const declinesUsed = data.proposals.filter(
    (p) => p.status === "rejected" && ((p.offerDetails ?? {}) as Record<string, unknown>).declinedBy === "intern",
  ).length;
  const guaranteeEnded = typeof extra.guaranteeEndedAt === "string";
  const startDate = parsed.startDate;
  // Unanswered on or after its start date: closed, shown as expired.
  const lapsed = (proposal.status === "sent" || proposal.status === "interview_scheduled") && offerPastStart(startDate);
  const status = proposalStatus(lapsed ? "expired" : proposal.status);
  const skills = toArray<string>(proposal.skills);
  // The intern's own current ratings and the Findtern Score that stipend
  // eligibility uses - not the snapshot copied onto the proposal, which could
  // read 8.2 beside "Not eligible for stipend".
  const ratings = (extra.ratings ?? {}) as Record<string, unknown>;
  const ratingRows = [
    ["Communication", ratings.communication],
    ["Coding", ratings.coding],
    ["Aptitude", ratings.aptitude],
    ["AI interview", ratings.interview],
    ["Findtern Score", score > 0 ? score : undefined],
  ].filter(([, v]) => typeof v === "number") as [string, number][];

  const decided = proposal.status !== "sent" || lapsed;

  return (
    <div>
      <Link
        href="/intern/proposals"
        className="apple-spring apple-pressable mb-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
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
            <SectionHead title="What is on offer" />
            <dl className="mt-4 divide-y divide-ink-100">
              {parsed.fullTime ? (
                <>
                  <DetailRow
                    label="Annual CTC"
                    value={
                      <span className="text-lg font-semibold tabular-nums tracking-[-0.01em] text-ink-900">
                        {parsed.fullTime.annualCtcMinor ? formatMoney(parsed.fullTime.annualCtcMinor, parsed.currency) : "To be agreed"}
                      </span>
                    }
                  />
                  <DetailRow label="Type" value="Full-time job" />
                  <DetailRow label="Work mode" value={parsed.fullTime.jobMode || "To be agreed"} />
                  {parsed.fullTime.location ? <DetailRow label="Location" value={parsed.fullTime.location} /> : null}
                  <DetailRow
                    label="Offer letter"
                    value={
                      <a href={`/api/proposals/${proposal.id}/offer-letter`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-4">
                        Open the offer letter
                      </a>
                    }
                  />
                </>
              ) : (
                <>
                  <DetailRow
                    label="Stipend"
                    value={
                      <span className="text-lg font-semibold tabular-nums tracking-[-0.01em] text-ink-900">
                        {stipendMinor ? `${stipend} a month` : stipend}
                      </span>
                    }
                  />
                  <DetailRow label="Hours" value={parsed.monthlyHours ? `${parsed.monthlyHours} a month` : "To be agreed"} />
                  <DetailRow label="Length" value={`${parsed.months} month${parsed.months === 1 ? "" : "s"}`} />
                  <DetailRow label="Work mode" value={parsed.mode ? `${parsed.mode}${parsed.location && parsed.mode !== "remote" ? `, ${parsed.location}` : ""}` : "To be agreed"} />
                  {parsed.paidLeavesPerMonth ? <DetailRow label="Paid leave" value={`${parsed.paidLeavesPerMonth} days a month`} /> : null}
                  {parsed.laptop ? <DetailRow label="Laptop" value={parsed.laptop === "company" || parsed.laptop === "yes" ? "Provided by the company" : "Your own"} /> : null}
                </>
              )}
              <DetailRow label="Joining date" value={formatJoiningDate(startDate)} />
              <DetailRow label="Timezone" value={parsed.timezone || "Asia/Kolkata"} />
              <DetailRow label="Sent" value={formatDayLabel(proposal.createdAt)} />
            </dl>
          </Surface>

          {skills.length > 0 ? (
            <Surface className="p-6">
              <SectionHead title="What you were assessed on" />
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
            <SectionHead title={decided ? "What you decided" : "Your decision"} />
            {decided ? (
              <>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">
                  {status.detail} Nothing about this changes on its own and nothing is deleted.
                </p>
                {proposal.status === "accepted" || proposal.status === "hired" ? (
                  <Link
                    href="/intern/timesheets"
                    className="apple-spring apple-pressable mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]"
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
                  startDate={startDate}
                  fullTime={Boolean(parsed.fullTime)}
                  declinesUsed={declinesUsed}
                  freeDeclines={FREE_DECLINES}
                  guaranteeEnded={guaranteeEnded}
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
              <SectionHead
                title="Your score"
                action={<Sparkles className="size-4 text-accent-500" aria-hidden />}
              />
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
              <p className="mt-4 text-pretty text-xs leading-relaxed text-ink-600">
                One assessment produces this and the rate that follows from it. Both are visible to
                you before any employer sees them.
              </p>
            </Surface>
          ) : null}

          {/* ── What happens after you accept ─────────────────────── */}
          <Surface className="p-5">
            <SectionHead title="After you accept" />
            <ol className="mt-3 space-y-3">
              {[
                "The company books an interview and offers you times to choose from.",
                "Your timesheet opens. Hours save on their own each time you type them.",
                "Your stipend is paid on the agreed date, and it appears on your record.",
                "Every one of those becomes something you can show the next employer.",
              ].map((line, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <span className="text-pretty text-sm leading-relaxed text-ink-600">{line}</span>
                </li>
              ))}
            </ol>
          </Surface>

          {!decided ? (
            <Surface className="p-5">
              <SectionHead title="If you do nothing" />
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
