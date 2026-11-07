import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { PresenceDot } from "@/components/app/presence-dot";
import type { PresenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";

/**
 * The candidate on a proposal row or page: photo (or initials) with the
 * presence dot on its corner, the same look as a candidate search row.
 * The dot's label is read out by its own sr-only text.
 */
export function ProposalAvatar({
  photoUrl,
  initials,
  presence,
  className,
}: {
  photoUrl: string | null;
  initials: string;
  presence: PresenceLabel | null;
  className?: string;
}) {
  return (
    <span className="relative shrink-0 self-start">
      <CandidateAvatar
        photoUrl={photoUrl}
        initials={initials}
        className={cn("size-14 rounded-full text-base ring-1 ring-inset ring-brand-200/70", className)}
      />
      {presence ? (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-white">
          <PresenceDot label={presence} />
        </span>
      ) : null}
    </span>
  );
}
