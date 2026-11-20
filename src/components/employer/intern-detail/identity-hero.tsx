import { Laptop, Link2, MapPin, Wifi } from "lucide-react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { ScoreDial } from "@/components/app/score-dial";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { FitSegments } from "@/components/employer/dashboard/match-card";
import { PresenceDot } from "@/components/app/presence-dot";
import { MODE_LABEL, type CandidateProfile } from "@/lib/employer-candidates";
import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import type { PresenceLabel } from "@/lib/presence";
import type { bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";

/** The avatar's ring takes the band's hue; an unscored candidate gets none. */
const RING = { standard: "ring-accent-300", skilled: "ring-brand-300", assured: "ring-brand-700" } as const;

const CHIP = "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-ink-50 px-3 text-sm text-ink-800 ring-1 ring-inset ring-ink-200";

/**
 * The candidate hero: who they are, the facts an employer scans first, and the
 * Findtern Score as a ring. Everything arrives already decided (redacted name,
 * LinkedIn only when unlocked); nothing here reads or hides data.
 */
export function InternIdentityHero({
  profile,
  displayName,
  nameUnlocked,
  headline,
  presence,
  status,
  linkedin,
  band,
  plan,
  match,
}: {
  profile: CandidateProfile;
  displayName: string;
  nameUnlocked: boolean;
  headline: string;
  presence: PresenceLabel | null;
  /** The status pill, already worded ("Project: Offer sent"). */
  status: { label: string; tone: Tone } | null;
  linkedin: string | null;
  band: ReturnType<typeof bandFor>;
  plan: string;
  /** Skills the project asks for that the candidate has; null with no project. */
  match: { hit: number; of: number; project: string } | null;
}) {
  const modes = profile.workModes.map((m) => MODE_LABEL[m] ?? m).join(" / ");
  return (
    <Surface as="section" aria-labelledby="profile-h" className="rise p-5 sm:p-7">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <span className="relative shrink-0 self-start">
            <CandidateAvatar
              photoUrl={profile.photoUrl}
              initials={profile.initials}
              seed={profile.id}
              className={cn(
                "size-20 rounded-full text-xl ring-2 ring-offset-[3px] ring-offset-white sm:size-24 sm:text-2xl",
                profile.scored ? RING[band.id] : "ring-ink-200",
              )}
            />
            {presence ? (
              <span
                aria-hidden
                className={cn("absolute bottom-0.5 right-0.5 size-4 rounded-full ring-[3px] ring-white sm:bottom-1 sm:right-1", presence === PRESENCE_ONLINE ? "bg-success" : "bg-ink-300")}
              />
            ) : null}
          </span>
          <div className="min-w-0">
            <h1 id="profile-h" className="break-words text-balance text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-3xl">
              {displayName}
              {nameUnlocked ? null : <span className="sr-only">. Names and contact details unlock once your hire is paid.</span>}
            </h1>
            {status ? (
              <div className="mt-2">
                <Pill tone={status.tone} className="max-w-full">
                  <span className="truncate">{status.label}</span>
                </Pill>
              </div>
            ) : null}
            {headline ? <p className="mt-2 break-words text-base leading-snug text-ink-800 sm:text-lg">{headline}</p> : null}
            <ul className="mt-4 flex flex-wrap gap-2">
              <li className={cn(CHIP, !profile.location && "text-ink-600")}>
                <MapPin className="size-4 shrink-0 text-ink-500" aria-hidden />
                {profile.location || "Location not stated"}
              </li>
              {modes ? (
                <li className={CHIP}>
                  <Wifi className="size-4 shrink-0 text-ink-500" aria-hidden />
                  <span className="sr-only">Works </span>
                  {modes}
                </li>
              ) : null}
              {profile.hasLaptop !== null ? (
                <li className={CHIP}>
                  <Laptop className="size-4 shrink-0 text-ink-500" aria-hidden />
                  {profile.hasLaptop ? "Own laptop" : "Needs a laptop"}
                </li>
              ) : null}
              {presence ? (
                <li className={CHIP}>
                  <PresenceDot label={presence} withText />
                </li>
              ) : null}
              {linkedin ? (
                <li className={cn(CHIP, "relative p-0")}>
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-medium text-brand-700 underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <Link2 className="size-4" aria-hidden />
                    LinkedIn
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 border-t border-ink-100 pt-6 text-center md:w-56 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          {profile.scored ? (
            <>
              <ScoreDial score={profile.score} axes={profile.ratings} size="lg" />
              <div>
                <Pill tone="live" size="md">
                  {plan}
                </Pill>
                {/* The band's own published meaning (lib/score BANDS), not a made-up label. */}
                <p className="mt-2 text-sm text-ink-600">
                  Score {band.max >= 10 ? `${band.min}+` : `${band.min}–${band.max}`}. {band.blurb}
                </p>
              </div>
            </>
          ) : (
            <div className="grid min-h-44 place-items-center">
              <div>
                <Pill tone="neutral" size="md">
                  Not scored yet
                </Pill>
                <p className="mt-2 text-sm text-ink-600">The score appears once the AI interview is reviewed.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {match ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-100 pt-4 text-sm text-ink-700">
          <FitSegments hit={match.hit} of={match.of} />
          <p>
            Matches <span className="nums font-semibold text-ink-900">{match.hit}</span> of <span className="nums">{match.of}</span> skills for{" "}
            <span className="break-words font-medium text-ink-900">{match.project}</span>
          </p>
        </div>
      ) : null}
    </Surface>
  );
}
