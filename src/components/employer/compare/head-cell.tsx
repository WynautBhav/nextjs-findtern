import Link from "next/link";
import { MapPin, Send, X } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { RowAvatar } from "@/components/employer/candidate-row-parts";
import { SaveToggle } from "@/components/employer/candidate-card";
import { SendProposalHold } from "@/components/employer/send-proposal-hold";
import { proposalActionLabel } from "@/components/employer/candidate-status";
import { ButtonLink } from "@/components/ui/button";
import type { CandidateProfile } from "@/lib/employer-candidates";

type Status = { tone: React.ComponentProps<typeof Pill>["tone"]; label: string } | null;

/**
 * The column header for one candidate, built like the top of a Candidates card:
 * the rounded tile, the name (initials until hired) and city, Remove, the star,
 * and one primary action that follows what already exists with them (EMB-08).
 */
export function CompareHeadCell({
  c,
  name,
  profileHref,
  removeHref,
  status,
  proposal,
  pendingMeetingAt,
  sendHref,
  projectId,
  shortlisted,
  otherShortlists,
  alsoOn,
}: {
  c: CandidateProfile;
  name: string;
  profileHref: string;
  removeHref: string;
  status: Status;
  proposal: Parameters<typeof proposalActionLabel>[0] | null;
  pendingMeetingAt: string | null;
  sendHref: string;
  projectId: string | null;
  shortlisted: boolean;
  /** Names of the other projects' shortlists this candidate sits on. */
  otherShortlists: string[];
  /** "Also on" when this project's shortlist has them too, else "On". */
  alsoOn: boolean;
}) {
  const place = c.city || c.location || "City not stated";
  return (
    <th scope="col" className="relative min-w-44 border-b border-r border-ink-200 bg-white p-3 text-left align-top font-normal last:border-r-0 sm:min-w-52 sm:p-4 xl:p-5">
      {/* Top line: the tile (a mouse-only link to the profile; the name below is the focusable one) and the two quiet controls. */}
      <div className="flex items-start justify-between gap-2">
        <Link href={profileHref} tabIndex={-1} aria-hidden className="rounded-2xl outline-none">
          <RowAvatar square photoUrl={c.photoUrl} initials={c.initials} seed={c.id} />
        </Link>
        <div className="-mr-2 -mt-2 flex items-center gap-0.5 sm:-mr-1 sm:-mt-1">
          {projectId && !proposal ? <SaveToggle internId={c.id} projectId={projectId} shortlisted={shortlisted} name={name} /> : null}
          <Link
            href={removeHref}
            aria-label={`Remove ${name} from the comparison`}
            title="Remove from the comparison"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-600 outline-none transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 sm:size-10 sm:touch:size-11"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
      <Link href={profileHref} className="group/id mt-3 block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span className="block break-words text-base font-bold leading-6 text-ink-900 underline-offset-4 group-hover/id:underline sm:text-lg">{name}</span>
        <span className="mt-0.5 flex items-start gap-1 text-sm font-normal text-ink-600">
          <MapPin className="mt-[3px] size-3.5 shrink-0 text-ink-400" aria-hidden />
          <span className="min-w-0 break-words">{place}</span>
        </span>
      </Link>

      {status || otherShortlists.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-600">
          {status ? <Pill tone={status.tone}>{status.label}</Pill> : null}
          {otherShortlists.length > 0 ? (
            <span title={otherShortlists.join(", ")}>
              {alsoOn ? "Also on" : "On"} {otherShortlists.length === 1 ? `the ${otherShortlists[0]} shortlist` : `${otherShortlists.length} ${alsoOn ? "other " : ""}shortlists`}
            </span>
          ) : null}
        </p>
      ) : null}

      {/* One filled button per column at its normal size (it only fills a narrow phone column); the star sits beside Remove. */}
      <div className="mt-4 flex flex-col items-stretch sm:items-start">
        {proposal ? (
          <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="primary" size="sm" className="h-11 rounded-xl max-sm:w-full sm:h-10 sm:touch:h-11">
            {proposalActionLabel(proposal)}
          </ButtonLink>
        ) : (
          <>
            {pendingMeetingAt ? (
              <SendProposalHold pendingMeetingAt={pendingMeetingAt} className="min-w-0" controlClassName="max-sm:w-full max-sm:justify-center" />
            ) : (
              <ButtonLink href={sendHref} variant="primary" size="sm" className="h-11 rounded-xl px-4 max-sm:w-full sm:h-10 sm:touch:h-11">
                <Send className="size-4" aria-hidden />
                Send proposal
              </ButtonLink>
            )}
          </>
        )}
      </div>
    </th>
  );
}
