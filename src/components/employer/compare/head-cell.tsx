import Link from "next/link";
import { Send, X } from "lucide-react";

import { Avatar } from "@/components/app/avatar";
import { ScoreDial } from "@/components/app/score-dial";
import { Pill } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { proposalActionLabel } from "@/components/employer/candidate-status";
import type { CandidateProfile } from "@/lib/employer-candidates";

type Status = { tone: React.ComponentProps<typeof Pill>["tone"]; label: string } | null;

/** The sticky column header for one candidate: identity, score, status and the next action. */
export function CompareHeadCell({
  c,
  name,
  unlocked,
  status,
  proposal,
  removeHref,
  project,
  shortlisted,
  shortlistedFor,
}: {
  c: CandidateProfile;
  name: string;
  unlocked: boolean;
  status: Status;
  proposal: Parameters<typeof proposalActionLabel>[0] | null;
  removeHref: string;
  project: { id: string; name: string } | null;
  shortlisted: boolean;
  shortlistedFor: string[];
}) {
  return (
    <th
      scope="col"
      className="sticky top-0 z-20 min-w-56 border-b border-r border-ink-100 bg-white/95 p-3 backdrop-blur-md align-top sm:min-w-60 sm:p-4 font-normal last:border-r-0"
    >
      <div className="flex items-start gap-3">
        <Avatar masked={!unlocked} initials={c.initials} src={unlocked ? c.photoUrl : null} size="md" />
        <div className="min-w-0 flex-1">
          <Link href={`/employer/intern/${encodeURIComponent(c.id)}`} className="block break-words text-base font-semibold text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline">
            {name}
          </Link>
          <p className="break-words text-sm text-ink-600">{c.city || c.location || "City not stated"}</p>

        </div>
        <Link
          href={removeHref}
          aria-label={`Remove ${name} from the comparison`}
          title="Remove"
          className={buttonClass({ variant: "ghost", size: "iconSm", className: "-mr-1 -mt-1 text-text-subtle" })}
        >
          <X className="size-4" aria-hidden />
        </Link>
      </div>
      {c.scored ? (
        <div className="mt-3">
          <ScoreDial score={c.score} axes={c.ratings} size="sm" />
        </div>
      ) : null}
      {status || shortlistedFor.length > 0 ? (
        <div className="mt-2 hidden flex-wrap items-center gap-1.5 sm:flex">
          {status ? <Pill tone={status.tone}>{status.label}</Pill> : null}
          {shortlistedFor.length > 0 ? (
            <Pill tone="neutral">Shortlisted for: {shortlistedFor.join(", ")}</Pill>
          ) : null}
        </div>
      ) : null}
      {/* EMB-08: the action follows what already exists with them. */}
      {/* Stacked in a narrow column, side by side with equal widths once a column can hold both. */}
      <div className="@container mt-3">
      <div className="flex flex-col gap-2 @[20rem]:flex-row">
        {proposal ? (
          <ButtonLink href={`/employer/proposal/${encodeURIComponent(proposal.id)}`} variant="outline" size="sm" className="min-h-11 min-w-0 flex-1">
            {proposalActionLabel(proposal)}
          </ButtonLink>
        ) : (
          <>
            {project ? (
              <div className="hidden min-w-0 flex-1 sm:contents">
              <ShortlistToggle
                internId={c.id}
                projectId={project.id}
                shortlisted={shortlisted}
                size="sm"
                className="min-w-0 flex-1"
                alsoOn={shortlistedFor.filter((n) => n !== project.name)}
              />
              </div>
            ) : null}
            <ButtonLink
              href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}${project ? `&project=${encodeURIComponent(project.id)}` : ""}`}
              variant="primary"
              size="sm"
              className="min-h-11 min-w-0 flex-1"
            >
              <Send className="size-4" aria-hidden />
              Send proposal
            </ButtonLink>
          </>
        )}
      </div>
      </div>
    </th>
  );
}
