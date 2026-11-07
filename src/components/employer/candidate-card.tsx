"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Eye, FileText, Heart, Laptop, Loader2, Scale, Send } from "lucide-react";

import { bandFor } from "@/lib/score";
import { formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, type CandidateProfile, type Ratings } from "@/lib/employer-candidates";
import { resolvePricing, type Currency, type Pricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { candidateStatusPill, proposalActionLabel, type CandidateProposal } from "@/components/employer/candidate-status";
import { DetailRow, Pill, SectionHead } from "@/components/app/primitives";
import { PresenceDot } from "@/components/app/presence-dot";
import { RowMenu, type RowMenuItem } from "@/components/app/row-menu";
import type { PresenceLabel } from "@/lib/presence";
import { csrfFetch } from "@/lib/client-fetch";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Card-width labels for the four rating axes; the full label stays in `title`. */
export const SHORT_LABEL: Record<keyof Ratings, string> = {
  communication: "Comms",
  coding: "Coding",
  aptitude: "Aptitude",
  // "AI interview" was cut to "AI intervie…" in a four-column meter at 375
  // (QA-117); every axis here is from the AI interview.
  interview: "Interview",
};

/** What a hired candidate's card needs to offer a full-time role (EMH-42). */
export type FullTimeContext = { employerId: string; fteStatus: string; timezone: string };

export interface CandidateCardProps {
  candidate: CandidateProfile;
  currency: Currency;
  region: "IN" | null;
  selected: boolean;
  /** Toggles the compare pick; null when four are already picked (EMB-13). */
  compareHref: string | null;
  /** False once this employer has hired them: compare leaves hires out. */
  comparable?: boolean;
  projectId: string | null;
  shortlisted: boolean;
  /** True when this employer hired the candidate - the only case the full name shows. */
  nameUnlocked?: boolean;
  /** Resolved server-side against the CMS rate card; falls back to the bands. */
  pricing?: Pricing;
  /** This employer's live or hired offer to the candidate, if any. */
  proposal?: CandidateProposal | null;
  /** Internship hire a full-time offer can follow from (EMH-42), with context. */
  fullTimeFrom?: string | null;
  fullTime?: FullTimeContext | null;
  /** Skills the list is filtered by: matching chips are tinted and listed first. */
  wantedSkills?: string[];
  /** "Online now" / "Active today" / "Active this week"; null when hidden or older. Never a time. */
  presence?: PresenceLabel | null;
  /** The intern saved this employer's role for the selected project. */
  interested?: boolean;
}

/** Skill chips shown on a row; a profile holds at most seven, "+N" covers older, longer lists. */
const MAX_CHIPS = 7;

/** The four AI interview axes as one compact meter. "-" when an axis is unrated. */
export function RatingMeter({ ratings, className }: { ratings: Ratings; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-4 gap-x-2 sm:gap-x-3", className)}>
      {RATING_META.map((meta) => {
        const value = ratings[meta.key];
        return (
          // Labels wrap rather than cut; the figure sits at the bottom so the
          // four stay level if one label takes two lines.
          <div key={meta.key} className="flex min-w-0 flex-col justify-between">
            <dt className="break-words text-xs leading-snug text-ink-600" title={meta.label}>
              {SHORT_LABEL[meta.key]}
            </dt>
            <dd className="mt-0.5">
              <span className="nums text-sm font-semibold text-ink-900">{value > 0 ? value.toFixed(1) : "-"}</span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, value * 10)}%` }} />
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function skillName(skill: string): string {
  return skill.split(" · ")[0].trim();
}

/**
 * Shortlist as a heart (the existing cart API). Not `disabled` while saving:
 * that drops keyboard focus. An offer already out goes to it, as ShortlistToggle does.
 */
export function HeartToggle({ internId, projectId, shortlisted }: { internId: string; projectId: string; shortlisted: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(shortlisted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/employer/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: on ? "remove" : "add", projectId, internId, listType: "cart" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && typeof data.proposalId === "string") {
        router.push(`/employer/proposal/${encodeURIComponent(data.proposalId)}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the shortlist. Try again.");
      setOn(!on);
      router.refresh();
    } catch (e) {
      setError(e instanceof TypeError || !(e instanceof Error) ? "Couldn't reach the server. Check your connection and try again." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-disabled={busy || undefined}
        aria-pressed={on}
        aria-label="Shortlist"
        title={on ? "Remove from your shortlist" : "Add to your shortlist for this project"}
        className={cn(
          "apple-spring grid size-11 shrink-0 place-items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          on ? "border-brand-300 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50 hover:text-brand-700",
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Heart className={cn("size-5", on && "fill-current")} aria-hidden />
        )}
      </button>
      {error ? (
        <span role="alert" className="absolute right-4 top-full z-20 mt-1 max-w-64 rounded-apple-sm bg-white px-2 py-1 text-xs text-danger shadow-md ring-1 ring-danger/30">
          {error}
        </span>
      ) : null}
    </>
  );
}

export function CandidateCard({
  candidate,
  currency,
  region,
  selected,
  compareHref,
  comparable = true,
  projectId,
  shortlisted,
  nameUnlocked = false,
  pricing: resolved,
  proposal = null,
  fullTimeFrom = null,
  fullTime = null,
  wantedSkills = [],
  presence = null,
  interested = false,
}: CandidateCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const band = bandFor(candidate.score);
  const pricing = resolved ?? resolvePricing(candidate.score, [], currency, region);
  const displayName = displayNameOf(candidate, nameUnlocked);
  const status = candidateStatusPill(proposal);
  const wanted = new Set(wantedSkills.map((s) => s.trim().toLowerCase()));
  const isWanted = (skill: string) => wanted.has(skillName(skill).toLowerCase());
  const skills = [...candidate.skills.filter(isWanted), ...candidate.skills.filter((s) => !isWanted(s))];
  const shownSkills = skills.slice(0, MAX_CHIPS);
  const profileHref = `/employer/intern/${encodeURIComponent(candidate.id)}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
  const sendHref = `/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
  const place = candidate.city || candidate.location || "City not stated";
  const meta = [place, candidate.workModes.join(" / ")].filter(Boolean);

  // One primary action per row: the proposal when one is out, else "Send proposal".
  const primary = proposal ? (
    <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="outline" size="sm" className="min-h-11 flex-1 justify-center sm:flex-none">
      {proposalActionLabel(proposal)}
    </ButtonLink>
  ) : (
    <ButtonLink href={sendHref} variant="primary" size="sm" className="min-h-11 flex-1 justify-center sm:flex-none">
      <Send className="size-4" aria-hidden />
      Send proposal
    </ButtonLink>
  );

  // The drawer's own action row: the primary and the compare control as buttons.
  const compareControl = !comparable ? null : compareHref ? (
    <Link
      href={compareHref}
      scroll={false}
      // A link, so no aria-pressed: the label carries the state.
      aria-label={selected ? "In compare: remove" : undefined}
      className={buttonClass({
        variant: "outline",
        size: "sm",
        className: cn("min-h-11", selected && "bg-brand-50 font-semibold text-brand-800"),
      })}
    >
      {selected ? <Check className="size-4" aria-hidden /> : <Scale className="size-4" aria-hidden />}
      {selected ? "In compare" : "Compare"}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
      title="Compare shows up to four candidates. Remove one to add another."
    >
      <Scale className="size-4" aria-hidden />
      Compare full (4)
    </button>
  );

  const drawerActions = (
    <>
      {!proposal && projectId ? <ShortlistToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} size="sm" emphasis="quiet" /> : null}
      {primary}
    </>
  );

  const menuItems: RowMenuItem[] = [
    { label: "Quick view", icon: <Eye />, onSelect: () => setDrawerOpen(true) },
    ...(comparable
      ? [
          compareHref
            ? { label: selected ? "In compare: remove" : "Compare", icon: selected ? <Check /> : <Scale />, href: compareHref }
            : { label: "Compare full (4)", icon: <Scale />, disabled: true },
        ]
      : []),
    { label: "Open profile", icon: <ArrowUpRight />, href: profileHref },
  ];

  return (
    <li className="relative grid gap-x-5 gap-y-2.5 px-4 py-4 transition-colors hover:bg-ink-50/60 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 gap-4">
        <div className="relative shrink-0 self-start">
          <CandidateAvatar
            photoUrl={candidate.photoUrl}
            initials={candidate.initials}
            className="size-14 rounded-full text-base ring-1 ring-inset ring-brand-200/70"
          />
          {presence ? (
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white">
              <PresenceDot label={presence} />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* The row opens the profile; the link is stretched over it and the controls sit above. */}
            <Link
              href={profileHref}
              className="break-words text-base font-semibold text-ink-900 outline-none touch:-my-2.5 touch:inline-flex touch:min-h-11 touch:min-w-11 touch:items-center after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
            >
              {displayName}
              {presence ? <span className="sr-only">, {presence}</span> : null}
            </Link>
            {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
            {interested ? (
              <Pill tone="live" className="shrink-0 whitespace-nowrap">
                <Heart className="size-3 fill-current" aria-hidden />
                Interested in this role
              </Pill>
            ) : null}
          </div>
          {/* The stats line (Upwork's rate / success / earned line): score, band and rate, then where and how. */}
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-ink-600">
            <span className="nums inline-flex items-baseline gap-2">
              {candidate.scored ? (
                <span className="text-lg font-semibold leading-none text-brand-700" title={`Findtern Score ${candidate.score.toFixed(1)} out of 10`}>
                  {candidate.score.toFixed(1)}
                  <span className="ml-0.5 text-xs font-medium text-text-subtle">/10</span>
                  <span className="sr-only"> Findtern Score</span>
                </span>
              ) : (
                <span className="text-sm text-ink-600">Not scored yet</span>
              )}
              <span className="font-semibold text-ink-900">{formatRate(pricing.hourlyRateMinor, currency)}</span>
              {candidate.scored ? (
                // The band the score falls in (lib/score BANDS); its own one-line meaning, not invented.
                <span className="text-ink-600" title={`${band.name} band: ${band.blurb}`}>
                  {band.name}
                  <span className="sr-only"> band: {band.blurb}</span>
                </span>
              ) : null}
            </span>
            <span className="min-w-0 break-words">{meta.join(" · ")}</span>
            {candidate.hasLaptop !== null ? (
              // An own laptop is the usual case: an icon with a name. Needing one is said in words.
              <span className="inline-flex items-center gap-1" title={candidate.hasLaptop ? "Own laptop" : undefined}>
                <Laptop className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                {candidate.hasLaptop ? <span className="sr-only">Own laptop</span> : "Needs a laptop"}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 max-lg:order-3 max-lg:pl-[4.5rem] lg:self-start">
        {!proposal && projectId ? <HeartToggle internId={candidate.id} projectId={projectId} shortlisted={shortlisted} /> : null}
        {primary}
        {fullTimeFrom && fullTime ? (
          <FullTimeOfferButton
            employerId={fullTime.employerId}
            proposalId={fullTimeFrom}
            candidate={displayName}
            fteStatus={fullTime.fteStatus}
            timezone={fullTime.timezone}
          />
        ) : null}
        <RowMenu label={`More actions for ${displayName}`} items={menuItems} />
      </div>

      {/* At most seven (a profile holds no more); "+N" only for an older, longer list. Full width, under the identity. */}
      <div className="min-w-0 lg:col-span-2 lg:pl-[4.5rem] max-lg:order-2 max-lg:pl-[4.5rem]">
        {shownSkills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
            {shownSkills.map((skill) => (
              <li
                key={skill}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  isWanted(skill) ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200" : "bg-ink-100 text-ink-700",
                )}
              >
                {skill}
                {isWanted(skill) ? <span className="sr-only"> (matches)</span> : null}
              </li>
            ))}
            {skills.length > shownSkills.length ? (
              <li className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                +{skills.length - shownSkills.length}
                <span className="sr-only"> more skills</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">No skills listed yet.</p>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-ink-200/80 bg-surface p-0 sm:max-w-xl">
          <div className="space-y-6 p-5 sm:p-7">
            <div className="flex items-start gap-4 pr-8">
              <CandidateAvatar
                photoUrl={candidate.photoUrl}
                initials={candidate.initials}
                className="size-14 rounded-apple-lg text-lg ring-1 ring-inset ring-brand-200/70"
              />
              <div className="min-w-0 flex-1">
                <SheetTitle className="break-words text-2xl font-semibold text-ink-900">{displayName}</SheetTitle>
                <SheetDescription className="mt-1 text-sm text-ink-600">
                  {candidate.location || "Location not stated"}
                </SheetDescription>
                {presence ? (
                  <div className="mt-1.5">
                    <PresenceDot label={presence} withText />
                  </div>
                ) : null}
                {status ? (
                  <div className="mt-2">
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <p className="text-sm font-medium text-ink-600">Findtern Score</p>
                <p className="nums mt-1 text-3xl font-semibold text-brand-700">
                  {candidate.scored ? candidate.score.toFixed(1) : "-"}
                  <span className="ml-0.5 text-sm font-medium text-text-subtle">/10</span>
                </p>
                <p className="mt-1 text-sm text-ink-600">{band.name}</p>
              </div>
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <p className="text-sm font-medium text-ink-600">Price</p>
                <p className="nums mt-2.5 text-2xl font-semibold text-ink-900">
                  {formatRate(pricing.hourlyRateMinor, currency)}
                </p>
                <p className="mt-1 text-sm text-ink-600">
                  {pricing.perHireMinor > 0 ? `plus ${formatMoney(pricing.perHireMinor, currency)} per hire` : "Hourly, by band"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              {drawerActions}
              {compareControl}
              <ButtonLink href={profileHref} variant="ghost" size="sm" className="min-h-10 touch:min-h-11">
                Full profile
                <ArrowUpRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>

            <section>
              <SectionHead title="AI interview ratings" hint="Each axis out of 10." />
              <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                <RatingMeter ratings={candidate.ratings} />
              </div>
              {candidate.aiFeedbackLink ? (
                <a
                  href={candidate.aiFeedbackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-10 touch:min-h-11" })}
                >
                  <FileText className="size-4" aria-hidden />
                  Feedback report
                </a>
              ) : null}
              {candidate.scored ? (
                <Link href={`${profileHref}#ai-report`} className="mt-3 ml-1 inline-flex min-h-10 touch:min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                  Full AI interview report
                </Link>
              ) : null}
            </section>

            <section>
              <SectionHead title="Skills" />
              {skills.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <li
                      key={skill}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        isWanted(skill) ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200" : "bg-ink-100 text-ink-700",
                      )}
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No skills listed.</p>
              )}
            </section>

            <section>
              <SectionHead title="Work preferences" />
              <dl className="divide-y divide-ink-100 rounded-apple-lg border border-ink-200/80 bg-white px-4">
                <DetailRow label="Work mode" value={candidate.workModes.join(", ") || "Not stated"} />
                <DetailRow
                  label="Preferred cities"
                  value={candidate.preferredLocations.map((l) => l.split(",")[0].trim()).join(", ") || "Not stated"}
                />
                <DetailRow
                  label="Laptop"
                  value={candidate.hasLaptop === true ? "Has a laptop" : candidate.hasLaptop === false ? "Needs one provided" : "Not stated"}
                />
              </dl>
            </section>

            {candidate.academics ? (
              <section>
                <SectionHead title="Academics" />
                <div className="rounded-apple-lg border border-ink-200/80 bg-white p-4">
                  <p className="text-base font-medium text-ink-900">
                    {[candidate.academics.degree, candidate.academics.specialization].filter(Boolean).join(" · ") || "Degree not stated"}
                  </p>
                  {candidate.academics.institution ? <p className="mt-0.5 text-sm text-ink-600">{candidate.academics.institution}</p> : null}
                  <p className="nums mt-2 text-sm text-ink-600">
                    {[
                      candidate.academics.startYear || candidate.academics.endYear
                        ? `${candidate.academics.startYear || "?"} – ${candidate.academics.endYear || "?"}`
                        : "",
                      candidate.academics.score
                        ? `${candidate.academics.scoreType === "percentage" ? "Percentage" : "CGPA"} ${candidate.academics.score}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </li>
  );
}
