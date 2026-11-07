import Link from "next/link";
import { CalendarCheck, CreditCard, Laptop, Loader2, MapPin, Send, Trash2, UserRound, Video } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { Avatar } from "@/components/app/avatar";
import { ScoreDial } from "@/components/app/score-dial";
import { MetaList } from "@/components/app/meta-list";
import { MatchLine, skillMatch } from "@/components/app/match-line";
import { RowMenu } from "@/components/app/row-menu";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/employer-pricing";
import { meetingLocked, untilLabel, type CartLineItem } from "./cart-helpers";

export function CartLine({
  line,
  index = 0,
  name,
  currency,
  timezone,
  busy,
  onMeeting,
  onRemove,
}: {
  line: CartLineItem;
  index?: number;
  name: string;
  currency: Currency;
  timezone: string;
  busy: boolean;
  onMeeting: () => void;
  onRemove: () => void;
}) {
  const c = line.candidate;
  const locked = meetingLocked(line);
  const closed = Boolean(line.projectClosed);
  const profileHref = `/employer/intern/${encodeURIComponent(c.id)}?project=${encodeURIComponent(line.projectId)}`;
  const canMeet = !line.acceptedProposalId && !line.openProposalId && !closed && !locked;

  return (
    <li className="rise tile-lift rounded-[24px] bg-white p-4 shadow-tile ring-1 ring-ink-100 sm:p-5" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex items-start gap-3 sm:gap-4">
        <Avatar masked initials={c.initials} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={profileHref} className="inline-flex min-h-6 items-center touch:min-h-11 text-base font-medium text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline">
              {name}
            </Link>
            {line.acceptedProposalId ? (
              <Pill tone="waiting">Offer accepted</Pill>
            ) : line.openProposalId ? (
              <Pill tone="new">Proposal sent</Pill>
            ) : locked ? (
              <Pill tone="live">Meeting booked</Pill>
            ) : null}
            {closed ? <Pill tone="closed">Project closed</Pill> : null}
          </div>
          <p className="nums mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-text-subtle">
            <span className="text-[28px] font-light leading-none tracking-[-0.04em] text-ink-900">
              {formatMoney(line.hourlyRateMinor, currency)}
              {line.hourlyRateMinor > 0 ? <span className="ml-0.5 text-sm font-normal tracking-normal text-text-subtle">/hr</span> : null}
            </span>
            <span>for {line.projectName}</span>
          </p>
          {skillMatch(c.skills, line.projectSkills ?? []).matched.length > 0 ? <MatchLine candidateSkills={c.skills} wantedSkills={line.projectSkills ?? []} className="mt-1" /> : null}
          <MetaList
            className="mt-1"
            items={[
              { icon: <MapPin />, text: c.location },
              { icon: <Laptop />, text: c.hasLaptop == null ? null : c.hasLaptop ? "Has a laptop" : "No laptop" },
              line.meetingLink || (locked && !line.acceptedProposalId && !line.openProposalId)
                ? { icon: <CalendarCheck />, text: `Meeting until ${untilLabel(line.meetingUntil!, timezone)}` }
                : {},
            ]}
          />
          {closed ? <p className="mt-2 text-sm text-ink-600">Reopen the project to send a proposal.</p> : null}
          {locked && !line.openProposalId && !line.acceptedProposalId ? (
            <p className="mt-2 text-xs text-text-subtle">Send a proposal once the meeting is completed.</p>
          ) : null}
        </div>

        {c.scored ? (
          <ScoreDial
            score={c.score}
            axes={{
              communication: c.ratings.communication > 0 ? c.ratings.communication : null,
              coding: c.ratings.coding > 0 ? c.ratings.coding : null,
              aptitude: c.ratings.aptitude > 0 ? c.ratings.aptitude : null,
              interview: c.ratings.interview > 0 ? c.ratings.interview : null,
            }}
            size="sm"
            showBand={false}
          />
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          {line.acceptedProposalId ? (
            <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(line.acceptedProposalId)}`} size="sm" className="hidden min-h-11 sm:inline-flex">
              <CreditCard className="size-4" aria-hidden />
              Pay to complete the hire
            </ButtonLink>
          ) : line.openProposalId ? (
            <ButtonLink href={`/employer/proposal/${encodeURIComponent(line.openProposalId)}`} variant="outline" size="sm" className="hidden min-h-11 sm:inline-flex">
              <Send className="size-4" aria-hidden />
              View proposal
            </ButtonLink>
          ) : closed ? null : locked ? (
            <span
              className={buttonClass({ size: "sm", className: "hidden min-h-11 cursor-not-allowed opacity-55 sm:inline-flex" })}
              aria-disabled="true"
              title="A proposal can be sent once the meeting is completed."
            >
              <Send className="size-4" aria-hidden />
              Send proposal
              <span className="sr-only"> (available once the meeting is completed)</span>
            </span>
          ) : (
            <ButtonLink
              href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}&project=${encodeURIComponent(line.projectId)}`}
              variant="outline"
              size="sm"
              className="hidden min-h-11 sm:inline-flex"
            >
              <Send className="size-4" aria-hidden />
              Send proposal
            </ButtonLink>
          )}
          {line.meetingLink ? <JoinMeetingButton link={line.meetingLink} variant="outline" /> : null}
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none text-text-subtle" aria-label="Removing" /> : null}
          <RowMenu
            label={`More actions for ${name}`}
            items={[
              ...(canMeet ? [{ label: "Book meeting", onSelect: onMeeting, icon: <Video /> }] : []),
              { label: "Open profile", href: profileHref, icon: <UserRound /> },
              { label: "Remove from shortlist", onSelect: onRemove, icon: <Trash2 />, destructive: true, disabled: busy },
            ]}
          />
        </div>
      </div>

      {/* Phones: the one primary action sits under the row, full width. */}
      <div className="mt-3 sm:hidden">
        {line.acceptedProposalId ? (
          <ButtonLink href={`/employer/checkout?proposal=${encodeURIComponent(line.acceptedProposalId)}`} size="sm" className="min-h-11 w-full">
            <CreditCard className="size-4" aria-hidden />
            Pay to complete the hire
          </ButtonLink>
        ) : line.openProposalId ? (
          <ButtonLink href={`/employer/proposal/${encodeURIComponent(line.openProposalId)}`} variant="outline" size="sm" className="min-h-11 w-full">
            <Send className="size-4" aria-hidden />
            View proposal
          </ButtonLink>
        ) : closed ? null : locked ? (
          <span className={buttonClass({ size: "sm", className: "min-h-11 w-full cursor-not-allowed opacity-55" })} aria-disabled="true">
            <Send className="size-4" aria-hidden />
            Send proposal
          </span>
        ) : (
          <ButtonLink href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}&project=${encodeURIComponent(line.projectId)}`} size="sm" className="min-h-11 w-full">
            <Send className="size-4" aria-hidden />
            Send proposal
          </ButtonLink>
        )}
      </div>
    </li>
  );
}
