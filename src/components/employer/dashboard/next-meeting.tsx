import Link from "next/link";
import { CalendarClock, CalendarPlus, FolderKanban, Handshake, Send } from "lucide-react";

import { CountUp } from "@/components/app/count-up";
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

const CARD = "rounded-2xl border border-white/12 bg-white/8 p-5 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] backdrop-blur-sm";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900";

/**
 * The hero's right column: the next booked meeting (face, time, a countdown
 * the server computed, project, join) or, with none booked, the two figures
 * that say where hiring stands. Lives on the dark hero: translucent inset card.
 */
export function NextMeeting({ meeting, hired, offersOut }: NextMeetingProps) {
  if (!meeting) return <Fallback hired={hired} offersOut={offersOut} />;
  const { with: who, whenLabel, untilLabel, projectName, joinLink, interviewId, scheduleHref } = meeting;
  return (
    <section aria-labelledby="next-meeting-h" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-meeting-h" className="text-sm font-medium text-on-dark">
          Next meeting
        </h2>
        <CalendarClock className="size-4 text-on-dark-subtle" aria-hidden />
      </div>

      <div className="mt-4 flex items-center gap-3">
        {who ? (
          <CandidateAvatar photoUrl={who.photoUrl} initials={who.initials} seed={who.initials} className="size-12 rounded-full text-base ring-2 ring-white/25" />
        ) : null}
        <div className="min-w-0">
          {who ? <p className="nums text-base font-semibold leading-6 text-white">With {who.initials}</p> : null}
          <p className="nums text-sm leading-5 text-on-dark">{whenLabel}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-brand-950/35 px-4 py-3 ring-1 ring-inset ring-white/10">
        <p className="text-xs font-medium text-on-dark">Starts</p>
        <p className="nums mt-0.5 text-[32px] font-normal leading-[1.15] tracking-[-0.03em] text-white">{untilLabel}</p>
      </div>

      {projectName ? (
        <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-on-dark">
          <FolderKanban className="mt-0.5 size-4 shrink-0 text-on-dark-subtle" aria-hidden />
          <span className="line-clamp-2 min-w-0 break-words">{projectName}</span>
        </p>
      ) : null}

      <div className="mt-4 grid gap-2">
        {/* The page's one amber button is the queue's; the join button is solid white on the dark card. The wrapper restyles the trigger only (the rules dialog is portaled out of it). */}
        {joinLink ? (
          <div className="[&_button]:border-transparent [&_button]:bg-white [&_button]:text-brand-950 [&_button]:shadow-sm [&_button:hover]:bg-brand-50">
            <JoinMeetingButton link={joinLink} interviewId={interviewId} size="sm" variant="outline" block />
          </div>
        ) : null}
        <ButtonLink href={scheduleHref} variant="outlineLight" size="sm" block className={FOCUS}>
          Open schedule
        </ButtonLink>
      </div>
    </section>
  );
}

/** No meeting booked: where hiring stands instead, as two figures that open their Proposals tab. */
function Fallback({ hired, offersOut }: { hired: number; offersOut: number }) {
  return (
    <section aria-labelledby="next-meeting-h" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-meeting-h" className="text-sm font-medium text-on-dark">
          Next meeting
        </h2>
        <CalendarPlus className="size-4 text-on-dark-subtle" aria-hidden />
      </div>
      <p className="mt-1 text-sm leading-5 text-on-dark">No meeting booked.</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile href="/employer/proposals?status=hired" icon={<Handshake className="size-4" aria-hidden />} label="Hired so far" value={hired} />
        <Tile href="/employer/proposals?status=open" icon={<Send className="size-4" aria-hidden />} label="Offers out" value={offersOut} />
      </div>
    </section>
  );
}

function Tile({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: number }) {
  return (
    <Link
      href={href}
      className={`group block min-w-0 rounded-xl bg-brand-950/35 px-4 py-3 ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-brand-950/55 ${FOCUS}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-on-dark">
        <span className="text-on-dark-subtle">{icon}</span>
        {label}
      </span>
      <span className="nums mt-2 block text-[32px] font-normal leading-none tracking-[-0.03em] text-white">
        <span aria-hidden>
          <CountUp value={value} />
        </span>
        <span className="sr-only">{value}</span>
      </span>
    </Link>
  );
}
