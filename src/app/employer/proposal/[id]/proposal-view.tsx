import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, CreditCard, Download, Send, X } from "lucide-react";

import { DetailRow, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { OfferBreakdownList } from "@/components/employer/offer-breakdown-list";
import { MeetingRulesList } from "@/components/employer/meeting-rules";
import type { OfferState } from "@/components/employer/proposal-state";
import type { TimelineStep } from "@/components/employer/proposal-timeline";
import { buttonClass } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { fullTimeFeeMinor } from "@/lib/checkout";
import { laptopLabel, WEEKLY_SCHEDULES, type Offer } from "@/lib/offer";
import type { BreakdownLine } from "@/lib/offer-breakdown";
import { cn } from "@/lib/utils";

const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/** One card: the shared card look, one padding. */
const CARD = "p-5 lg:p-6";
const BODY_TEXT = "max-w-prose whitespace-pre-line text-pretty text-base leading-relaxed text-ink-800 [overflow-wrap:anywhere]";

export type ProposalViewProps = {
  proposalId: string;
  avatar: React.ReactNode;
  internName: string;
  profileHref: string;
  projectName: string | null;
  title: string;
  state: OfferState;
  offer: Offer;
  score: number;
  /** The four numbers the decision rests on. */
  strip: [string, string][];
  breakdownLines: BreakdownLine[];
  flexible: boolean;
  ist: string | null;
  skills: string[];
  ratings: [string, number][];
  timeline: TimelineStep[];
  /** The booked interview: its time as text, and the join button (built by the page, unchanged). */
  interview: { when: string; join: React.ReactNode } | null;
  /** Findtern took the project down. */
  takedown: React.ReactNode;
  /** CGPA / expiry notices. */
  notices: React.ReactNode;
  /** Heading and body of the actions card; null when there is nothing to do here. */
  actions: { heading: string; body: React.ReactNode } | null;
  sendNewHref: string | null;
  /** A "Book meeting" button for this candidate and project (the page builds it; null when the project is down). */
  bookMeeting?: React.ReactNode;
};

/**
 * The proposal, as cards: a header card (who, what, status, the one action, the four figures), then the
 * terms in the main column and status, actions and assessment in the side column. Container queries, not
 * viewport ones: the sidebar takes 256px, so the viewport says nothing about the room the page has.
 *
 * DOM order is the reading order on a phone (status and actions before the terms, the assessment after
 * them); at `@4xl` the main column spans the rows beside the three side cards. Every block renders once.
 */
export function ProposalView(p: ProposalViewProps) {
  const { offer, state } = p;
  const ft = offer.fullTime;
  const currency = offer.currency;

  return (
    <div>
      <Link
        href="/employer/proposals"
        className="apple-spring mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All proposals
      </Link>

      {p.takedown ? <div className="mb-6">{p.takedown}</div> : null}

      {/* ── Header: who, what, status, the one thing to do, the figures ── */}
      <Surface as="section" aria-label="Offer summary" className={cn("@container mb-6", CARD)}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 items-start gap-4 @2xl:basis-[24rem]">
            {p.avatar}
            <PageHead
              className="mb-0 min-w-0 flex-1"
              title={p.title}
              lede={
                <>
                  <Link
                    href={p.profileHref}
                    className="inline-flex min-h-11 items-center font-semibold text-ink-900 underline decoration-ink-300 underline-offset-4 outline-none hover:text-brand-700 hover:decoration-brand-500 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-0"
                  >
                    {p.internName}
                  </Link>
                  {p.projectName ? <span> · {p.projectName}</span> : null}
                </>
              }
            />
          </div>
          {state.canPay || p.sendNewHref || p.bookMeeting ? (
            <div className="flex w-full flex-col gap-3 @sm:w-auto @sm:flex-row">
              {state.canPay ? (
                <Link href="/employer/checkout" className={buttonClass({ className: "max-sm:w-full" })}>
                  <CreditCard className="size-4" aria-hidden />
                  {ft ? "Pay the hiring fee" : "Pay to confirm hire"}
                </Link>
              ) : null}
              {p.sendNewHref ? (
                <Link href={p.sendNewHref} className={buttonClass({ className: "max-sm:w-full" })}>
                  <Send className="size-4" aria-hidden />
                  Send a new proposal
                </Link>
              ) : null}
              {p.bookMeeting}
            </div>
          ) : null}
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-600">
          <Pill tone={state.tone} size="md">
            {state.label}
          </Pill>
          <span>{ft ? "Full-time offer" : "Internship offer"}</span>
          {p.score > 0 ? (
            <span className="nums">
              <span className="font-semibold text-ink-900">{p.score.toFixed(1)}</span> Findtern Score
            </span>
          ) : null}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-ink-100 pt-5 @xl:grid-cols-4">
          {p.strip.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-text-subtle">{label}</dt>
              <dd className="nums mt-1 text-xl font-semibold text-ink-900 [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </Surface>

      {p.notices}

      <div className="@container">
        <div className="grid @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:grid-rows-[auto_auto_1fr] @4xl:gap-x-6">
          {/* ── Status: what happened, what is next ─────────────────── */}
          <Surface as="section" aria-label="Offer timeline" className={cn("mb-6 @4xl:col-start-2 @4xl:row-start-1", CARD)}>
            <SectionHead title="Offer timeline" />
            <ol>
              {p.timeline.map((step, i) => {
                const last = i === p.timeline.length - 1;
                return (
                  <li key={step.label} className="relative flex gap-3.5 pb-6 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
                    {!last ? (
                      <span aria-hidden className={cn("absolute bottom-1 left-[0.6875rem] top-7 w-px", step.state === "done" ? "bg-brand-300" : "bg-ink-200")} />
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
          </Surface>

          {/* ── Actions ─────────────────────────────────────────────── */}
          {p.actions ? (
            <Surface as="section" aria-labelledby="proposal-actions-h" className={cn("mb-6 @4xl:col-start-2 @4xl:row-start-2", CARD)}>
              <h2 id="proposal-actions-h" className="mb-4 text-lg font-semibold tracking-[-0.01em] text-ink-900">
                {p.actions.heading}
              </h2>
              <div className="grid gap-2">{p.actions.body}</div>
            </Surface>
          ) : null}

          {/* ── The terms ───────────────────────────────────────────── */}
          <div className="min-w-0 space-y-6 @4xl:col-start-1 mb-6 @4xl:row-span-3 @4xl:row-start-1">
            {!ft ? (
              <Surface as="section" aria-label="Amount and terms" className={CARD}>
                <SectionHead title="Amount" />
                <OfferBreakdownList lines={p.breakdownLines} />
                <div className="mt-6 border-t border-ink-100 pt-6">
                  <SectionHead title="Terms" className="mb-1" />
                  <dl className="divide-y divide-ink-100">
                    <DetailRow label="Working week" value={WEEKLY_SCHEDULES[offer.weeklySchedule].label} />
                    <DetailRow label="Paid leave" value={offer.paidLeavesPerMonth ? `${offer.paidLeavesPerMonth} day${offer.paidLeavesPerMonth === 1 ? "" : "s"} a month` : "None"} />
                    <DetailRow
                      label="Working hours"
                      value={
                        p.flexible ? (
                          "Flexible, set by the intern"
                        ) : (
                          <>
                            {offer.shiftFrom}–{offer.shiftTo}
                            {p.ist ? <span className="block text-xs font-normal text-text-subtle">{p.ist} for the intern</span> : null}
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
                </div>
              </Surface>
            ) : (
              <Surface as="section" aria-label="Full-time terms" className={CARD}>
                <SectionHead
                  title="Full-time terms"
                  className="mb-1 items-center"
                  action={
                    ft.offerLetterKey || ft.offerLetterUrl ? (
                      <a
                        href={`/api/proposals/${encodeURIComponent(p.proposalId)}/offer-letter`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                      >
                        <Download className="size-4" aria-hidden />
                        Offer letter
                      </a>
                    ) : undefined
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
              <Surface as="section" aria-label="Job description" className={CARD}>
                <SectionHead title="Job description" className="mb-3" />
                {/* Text: legacy Quill HTML is read back as plain text (EMH-28). */}
                <p className={BODY_TEXT}>{offer.jd}</p>
              </Surface>
            ) : null}

            {offer.additionalInfo ? (
              <Surface as="section" aria-label="What the intern will learn" className={CARD}>
                <SectionHead title="What the intern will learn" className="mb-3" />
                <p className={BODY_TEXT}>{offer.additionalInfo}</p>
              </Surface>
            ) : null}

            {p.skills.length > 0 ? (
              <Surface as="section" aria-label="Skills" className={CARD}>
                <SectionHead title="Skills" className="mb-3" />
                <ul className="flex flex-wrap gap-2">
                  {p.skills.map((skill) => (
                    <li key={skill} className="rounded-full border border-ink-200 px-3 py-1 text-sm font-medium text-ink-700 [overflow-wrap:anywhere]">
                      {skill}
                    </li>
                  ))}
                </ul>
              </Surface>
            ) : null}

            {p.interview ? (
              <Surface as="section" aria-label="Interview" className={CARD}>
                <SectionHead title="Interview" className="mb-1" />
                <p className="nums text-sm text-ink-600">{p.interview.when}</p>
                <div className="mt-3">{p.interview.join}</div>
              </Surface>
            ) : null}

            {/* Meeting rules are for interviews; a full-time offer is not one (bug sheet 12 Nov, row 16). */}
            {!ft ? (
              <Surface as="section" aria-label="Meeting rules" className="px-5 py-2 lg:px-6">
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-lg font-semibold tracking-[-0.01em] text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                    Meeting rules
                    <ChevronDown className="size-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-1 text-sm text-text-subtle">By joining any meeting scheduled through Findtern, you agree to this conduct policy.</p>
                  <MeetingRulesList className="mb-3 mt-4" />
                </details>
              </Surface>
            ) : null}
          </div>

          {/* ── Assessment: once, after the terms on a phone, under the actions beside them ── */}
          {p.ratings.length > 0 ? (
            <Surface as="section" aria-label="Assessment at sending" className={cn("mb-6 @4xl:col-start-2 @4xl:row-start-3 @4xl:self-start", CARD)}>
              <SectionHead title="Assessment at sending" className="mb-1" />
              <dl className="divide-y divide-ink-100">
                {p.ratings.map(([key, value]) => (
                  <DetailRow key={key} label={key === "overall" ? "Findtern Score" : humanizeKey(key)} value={`${value}/10`} mono />
                ))}
              </dl>
            </Surface>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "problemSolving" / "problem_solving" → "Problem solving". */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
