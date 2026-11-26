import Link from "next/link";
import { Send } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { CompareToggle } from "@/components/employer/compare-toggle";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { proposalPill } from "@/components/employer/proposal-state";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { BookMeetingButton } from "@/components/meetings/book-meeting-dialog";
import { ButtonLink } from "@/components/ui/button";
import type { CandidateRelation } from "@/lib/employer-visibility";
import type { resolvePricing } from "@/lib/employer-pricing";
import { formatMoney, formatRate } from "@/lib/format";
import { DRIVE_FULL_TIME_FEE } from "@/lib/checkout";

import { mainAction, type ProfileAction } from "./profile-helpers";

/** "Your proposals to them" shows the latest few; the rest live on the Proposals page. */
const PROPOSALS_SHOWN = 3;

type RailProps = {
  employerId: string;
  employerFte: string;
  employerZone: string;
  internId: string;
  displayName: string;
  scored: boolean;
  plan: string;
  pricing: ReturnType<typeof resolvePricing>;
  currency: "INR" | "USD";
  action: ProfileAction;
  sendHref: string;
  relation: CandidateRelation | null;
  appliedProjects: { id: string; projectName: string | null; status: string; fullTime: boolean }[];
  comparePicks: string[];
  compareBlocked: string | null;
  shortlist: { projectId: string; on: boolean } | null;
  driveFullTime?: { driveId: string; projects: { id: string; name: string }[] } | null;
  /** Opened from a campus drive's Full-time tab: the full-time offer is the main action; "open" opens its form on arrival. */
  fullTimeFirst?: "show" | "open" | null;
};

/** The control for the one thing to do next: white on the green rail, brand green on the bar. */
function MainControl({ main, sendHref, className, onDark = false }: { main: NonNullable<ReturnType<typeof mainAction>>; sendHref: string; className?: string; onDark?: boolean }) {
  const variant = onDark ? "white" : "primary";
  if (main.kind === "send")
    return (
      <ButtonLink href={sendHref} variant={variant} block className={className}>
        <Send className="size-4" aria-hidden />
        Send proposal
      </ButtonLink>
    );
  if (main.kind === "view")
    return (
      <ButtonLink href={`/employer/proposal/${encodeURIComponent(main.proposalId)}`} variant={variant} block className={className}>
        View sent proposal
      </ButtonLink>
    );
  if (main.kind === "placement")
    return (
      <ButtonLink href={`/employer/proposal/${encodeURIComponent(main.proposalId)}`} variant={variant} block className={className}>
        View placement
      </ButtonLink>
    );
  return null;
}

/**
 * The hire rail: the one dark-green block on the page. The price and the main
 * action sit on the green; Shortlist, Compare, a full-time offer and the
 * proposals so far sit on white below it, so the green stays one thing to do.
 * Sticky from xl; below xl the rail is inline after the hero and the main
 * action lives in `HireBar` instead (never rendered twice).
 */
export function HireRail(props: RailProps) {
  const { employerId, employerFte, employerZone, internId, displayName, scored, plan, pricing, currency, action, sendHref, relation, appliedProjects, comparePicks, compareBlocked, shortlist } = props;
  const main = mainAction(action, relation);
  // 26 Nov PDF: a drive student eligible for full-time gets two cards, Internship, then "OR", then Full-time. Only the one the
  // employer is hiring for is the green card: Full-time when opened from the drive's Full-time tab, Internship otherwise.
  const ftCard = Boolean(props.driveFullTime && !relation?.fullTimeFrom);
  const ftFirst = ftCard && Boolean(props.fullTimeFirst);
  // While a meeting holds the offer, neither card can send one; the reason shows on each (meetingHoldsOffer).
  const ftLocked = ftCard && action.kind === "blocked" ? action.reason : null;
  const ftMain = ftFirst && !ftLocked && main?.kind === "send";
  const showShortlist = Boolean(shortlist && action.kind === "send");
  // Book meeting is always offered, so the lower block always renders.
  const hasLower = true;
  const internshipOnGreen = !ftFirst;
  return (
    <aside aria-label="Hire" className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
      <div className="rise overflow-hidden rounded-[24px] shadow-tile-brand xl:sticky xl:top-24" style={{ ["--i" as string]: 1 }}>
        <section
          aria-label={ftCard ? "Internship" : undefined}
          className={internshipOnGreen ? "bg-[linear-gradient(140deg,var(--color-brand-700),var(--color-brand-950))] p-6 text-white" : "border-b border-ink-100 bg-white p-6 text-ink-900"}
        >
          {ftCard ? <p className={internshipOnGreen ? "mb-3 text-sm font-medium text-on-dark-subtle" : "mb-3 text-sm font-medium text-ink-600"}>Internship</p> : null}
          <p className={internshipOnGreen ? "nums text-5xl font-light leading-none tracking-[-0.05em]" : "nums text-3xl font-light leading-none tracking-[-0.04em] text-ink-900"}>{formatRate(pricing.hourlyRateMinor, currency)}</p>
          <p className={internshipOnGreen ? "mt-3 text-sm text-on-dark-subtle" : "mt-2 text-sm text-ink-600"}>What you pay, set by the {scored ? `${plan} ` : ""}band</p>
          {pricing.perHireMinor > 0 ? (
            <p className={internshipOnGreen ? "nums mt-0.5 text-sm text-on-dark-subtle" : "nums mt-0.5 text-sm text-ink-600"}>
              plus <span className={internshipOnGreen ? "font-medium text-white" : "font-medium text-ink-900"}>{formatMoney(pricing.perHireMinor, currency)}</span> one-time hiring charge
            </p>
          ) : (
            <p className={internshipOnGreen ? "nums mt-0.5 text-sm text-on-dark-subtle" : "nums mt-0.5 text-sm text-ink-600"}>
              plus <s className={internshipOnGreen ? "text-on-dark-subtle/80" : "text-ink-500"}>{formatMoney(pricing.perHireListMinor, currency)}</s> <span className={internshipOnGreen ? "font-semibold text-data-on-dark" : "font-semibold text-success"}>(FREE)</span> one-time hiring charge
            </p>
          )}
          {main ? (
            main.kind === "reason" ? (
              <p className={internshipOnGreen ? "mt-5 rounded-apple-sm bg-white/10 px-4 py-2.5 text-sm text-white" : "mt-4 rounded-apple-sm bg-ink-50 px-4 py-2.5 text-sm text-ink-800"}>{main.text}</p>
            ) : internshipOnGreen ? (
              <MainControl onDark main={main} sendHref={sendHref} className="mt-5 min-h-11 max-xl:hidden" />
            ) : main.kind === "send" ? (
              <ButtonLink href={sendHref} variant="outline" size="sm" className="mt-4 min-h-11 w-full justify-center">
                <Send className="size-4" aria-hidden />
                Send internship proposal
              </ButtonLink>
            ) : (
              <MainControl main={main} sendHref={sendHref} className="mt-4 min-h-11" />
            )
          ) : null}
        </section>

        {ftCard && props.driveFullTime ? (
          <>
            <p aria-hidden className="flex items-center gap-3 bg-white px-6 py-2 text-xs font-medium tracking-wide text-ink-500">
              <span className="h-px flex-1 bg-ink-200" />
              OR
              <span className="h-px flex-1 bg-ink-200" />
            </p>
            <section
              aria-label="Full-time hire"
              className={ftFirst ? "bg-[linear-gradient(140deg,var(--color-brand-700),var(--color-brand-950))] p-6 text-white" : "border-b border-ink-100 bg-white px-6 pb-6 pt-2 text-ink-900"}
            >
              <p className={ftFirst ? "mb-3 text-sm font-medium text-on-dark-subtle" : "mb-3 text-sm font-medium text-ink-600"}>Full-time hire</p>
              <p className={ftFirst ? "nums text-5xl font-light leading-none tracking-[-0.05em]" : "nums text-3xl font-light leading-none tracking-[-0.04em] text-ink-900"}>{DRIVE_FULL_TIME_FEE * 100}%</p>
              <p className={ftFirst ? "mt-3 text-sm text-on-dark-subtle" : "mt-2 text-sm text-ink-600"}>of the annual CTC, from the campus drive</p>
              {ftLocked ? (
                <p className={ftFirst ? "mt-5 rounded-apple-sm bg-white/10 px-4 py-2.5 text-sm text-white" : "mt-4 rounded-apple-sm bg-ink-50 px-4 py-2.5 text-sm text-ink-800"}>{ftLocked}</p>
              ) : (
                <FullTimeOfferButton
                  employerId={employerId}
                  candidate={displayName}
                  fteStatus={employerFte}
                  timezone={employerZone}
                  drive={{ driveId: props.driveFullTime.driveId, internId, projects: props.driveFullTime.projects }}
                  variant={ftFirst ? "white" : "outline"}
                  label="Send full-time offer"
                  defaultOpen={ftMain && props.fullTimeFirst === "open"}
                  className={ftFirst ? "mt-5 w-full" : "mt-4 w-full justify-center"}
                />
              )}
            </section>
          </>
        ) : null}

        {hasLower ? (
          <div className="space-y-4 bg-white p-6">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 [&>*:only-child]:col-span-full [&_button]:w-full [&_button]:justify-center">
              {relation?.fullTimeFrom ? (
                <FullTimeOfferButton employerId={employerId} proposalId={relation.fullTimeFrom} feeRate={relation.fullTimeFeeRate} candidate={displayName} fteStatus={employerFte} timezone={employerZone} />
              ) : null}
              {showShortlist ? <ShortlistToggle internId={internId} projectId={shortlist!.projectId} shortlisted={shortlist!.on} /> : null}
              <BookMeetingButton internId={internId} projectId={shortlist?.projectId ?? null} candidateLabel={displayName} meetingOpen={Boolean(relation?.meetingOpen)} />
              {/* EMB-12: hires and full-time offers are not compared (legacy). */}
              {compareBlocked ? null : <CompareToggle employerId={employerId} internId={internId} projectId={shortlist?.projectId ?? null} picked={comparePicks} />}
            </div>

            {appliedProjects.length > 0 ? (
              <div className={relation?.fullTimeFrom || showShortlist || !compareBlocked ? "border-t border-ink-100 pt-4" : undefined}>
                <h2 className="text-sm font-semibold text-ink-900">Your proposals to them</h2>
                <ul className="mt-2 space-y-2">
                  {appliedProjects.slice(0, PROPOSALS_SHOWN).map((entry) => {
                    const pill = proposalPill(entry.status, entry.fullTime);
                    return (
                      <li key={entry.id} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words text-ink-800">{entry.projectName ?? "Project no longer listed"}</span>
                        <Pill tone={pill.tone} className="shrink-0">
                          {pill.label}
                        </Pill>
                      </li>
                    );
                  })}
                </ul>
                {appliedProjects.length > PROPOSALS_SHOWN ? (
                  <Link href="/employer/proposals" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
                    See all {appliedProjects.length} in Proposals
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Below xl: a floating bar with the rate and the one main action (none when the
 * only thing to say is a reason, which stays in the rail). Offset 9rem from the bottom so it clears the Findy launcher
 * and the phone tab bar, as the project form's bar does; on a desktop-width
 * shell it is inset past the sidebar.
 */
export function HireBar({ pricing, currency, action, relation, sendHref, hidden = false }: Pick<RailProps, "pricing" | "currency" | "action" | "relation" | "sendHref"> & { hidden?: boolean }) {
  const main = mainAction(action, relation);
  if (hidden) return null;
  // A reason is a sentence for the rail, not an action to float.
  if (!main || main.kind === "reason") return null;
  return (
    <aside
      aria-label="Hire summary"
      data-hire-bar
      data-floating-bar
      className="fixed inset-x-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-xl items-center gap-3 rounded-apple-xl border border-ink-200/80 bg-white/95 p-3 shadow-tile backdrop-blur-xl lg:left-[calc(var(--console-rail,0rem)+1rem)] xl:hidden"
    >
      <p className="nums min-w-0 flex-1 text-lg font-semibold leading-tight text-ink-900">
        {formatRate(pricing.hourlyRateMinor, currency)}
      </p>
      <div className="shrink-0">
        <MainControl main={main} sendHref={sendHref} className="min-h-11" />
      </div>
    </aside>
  );
}
