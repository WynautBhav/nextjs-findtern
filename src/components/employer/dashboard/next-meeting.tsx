import Link from "next/link";

import { CountUp } from "@/components/app/count-up";
import { Section } from "@/components/app/stat";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { JoinMeetingButton } from "@/components/employer/meeting-join";
import { ButtonLink } from "@/components/ui/button";

export type NextMeetingData = {
  /** Initials and photo only, as everywhere before a hire. Null when the candidate row is gone. */
  with: { initials: string; photoUrl: string | null } | null;
  /** Slot time in the employer's timezone, already formatted ("Mon 9 Nov, 4:30 pm"). */
  whenLabel: string;
  /** Server-computed "in 2 h 15 m". Static, no ticker. */
  untilLabel: string;
  projectName: string | null;
  /** Set only when the meeting link is live (`isMeetingLinkLive`); render `JoinMeetingButton` with it. */
  joinLink: string | null;
  /** The interview, so Join records that the employer joined. */
  interviewId: string;
  /** "/employer/schedule". */
  scheduleHref: string;
};

export type NextMeetingProps = {
  /** Null: show the "Hired so far" / "Offers out" fallback instead. */
  meeting: NextMeetingData | null;
  /** Unique interns hired (funnel Hired stage). */
  hired: number;
  /** Proposals awaiting a reply. */
  offersOut: number;
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/**
 * The next booked meeting as a ruled block: how far away it is as the figure, then who, when and
 * which project, then join. With none booked, where hiring stands as two ruled figures that open
 * their Proposals tab.
 */
export function NextMeeting({ meeting, hired, offersOut }: NextMeetingProps) {
  if (!meeting) return <Fallback hired={hired} offersOut={offersOut} />;
  const { with: who, whenLabel, untilLabel, projectName, joinLink, interviewId, scheduleHref } = meeting;
  return (
    <Section title="Next meeting">
      <p className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900">{untilLabel}</p>
      <p className="nums mt-2 text-sm text-ink-700">{whenLabel}</p>

      <div className="mt-5 flex items-center gap-3 border-t border-ink-200 pt-4">
        {who ? <CandidateAvatar photoUrl={who.photoUrl} initials={who.initials} className="size-10 rounded-full bg-ink-800 text-sm text-white" /> : null}
        <div className="min-w-0">
          {who ? <p className="nums text-base font-medium text-ink-900">{who.initials}</p> : null}
          {projectName ? <p className="line-clamp-2 break-words text-sm text-ink-700">{projectName}</p> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {joinLink ? <JoinMeetingButton link={joinLink} interviewId={interviewId} size="sm" variant="outline" /> : null}
        <Link href={scheduleHref} className={`inline-flex min-h-11 items-center text-sm font-medium text-ink-900 underline underline-offset-4 ${FOCUS}`}>
          Open schedule
        </Link>
      </div>
    </Section>
  );
}

/** No meeting booked: where hiring stands instead, as two ruled figures. */
function Fallback({ hired, offersOut }: { hired: number; offersOut: number }) {
  const rows = [
    { href: "/employer/proposals?status=hired", label: "Hired so far", value: hired },
    { href: "/employer/proposals?status=open", label: "Offers out", value: offersOut },
  ];
  return (
    <Section title="Next meeting" hint="None booked">
      <ul className="border-t border-ink-200">
        {rows.map((r) => (
          <li key={r.href} className="border-b border-ink-200">
            <Link href={r.href} className={`flex min-h-14 items-baseline justify-between gap-4 py-3 text-sm text-ink-700 hover:text-ink-900 ${FOCUS}`}>
              {r.label}
              <span className="nums font-display text-2xl font-semibold text-ink-900">
                <span aria-hidden><CountUp value={r.value} /></span>
                <span className="sr-only">{r.value}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/employer/candidates" variant="outline" size="sm" className={`mt-4 ${FOCUS}`}>
        Find candidates to meet
      </ButtonLink>
    </Section>
  );
}
