import { ExternalLink, FileText, Video } from "lucide-react";

import { AxisRadar } from "@/components/app/axis-radar";
import { SectionHead, Surface } from "@/components/app/primitives";
import { ScoreBar } from "@/components/app/score-bar";
import { cn } from "@/lib/utils";

import { rankAxes } from "./profile-helpers";

type Axis = { label: string; value: number | null };

/** An outlined card that opens a report in a new tab. */
function LinkCard({ href, icon, title, hint }: { href: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-[4.5rem] items-center gap-3 rounded-apple-lg border border-ink-200 bg-white p-3.5 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-apple-md bg-brand-50 text-brand-700 [&>svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink-900">{title}</span>
        <span className="block text-sm text-ink-600">{hint}</span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-ink-500 group-hover:text-brand-700" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * The AI interview: the four axes ranked high to low as bars, on a radar when
 * three or more are rated, and the written report and recording as action
 * cards. The radar and bars are the same numbers; the sentence names the
 * spread and is the text alternative. The caller says whether the recording
 * may show (only after the hire is paid).
 */
export function AiInterviewSection({
  axes,
  rated,
  feedbackLink,
  recordingLink,
  className,
}: {
  axes: Axis[];
  /** The rated axes, high to low (the page's own sort). */
  rated: { label: string; value: number }[];
  feedbackLink: string | null;
  /** Already null before the hire; the section never decides that. */
  recordingLink: string | null;
  className?: string;
}) {
  const ranked = rankAxes(axes);
  const showLinks = rated.length > 0 && Boolean(feedbackLink || recordingLink);
  return (
    <section id="ai-report" aria-labelledby="ai-h" className={cn("scroll-mt-24", className)}>
      <SectionHead id="ai-h" title="AI interview" />
      <Surface className="p-5 sm:p-6">
        {/* The bars are the evidence; the sentence only names the spread. All parts tied: the bars say it. */}
        {rated.length === 0 ? (
          <p className="text-sm text-ink-600">No AI interview score yet. The breakdown appears once the interview is reviewed.</p>
        ) : (
          <>
            {rated.length > 1 && rated[0].value !== rated[rated.length - 1].value ? (
              <p className="text-sm text-ink-700">
                Strongest in <span className="font-medium text-ink-900">{rated[0].label}</span> (<span className="nums">{rated[0].value.toFixed(1)}</span>), lowest in{" "}
                <span className="font-medium text-ink-900">{rated[rated.length - 1].label}</span> (<span className="nums">{rated[rated.length - 1].value.toFixed(1)}</span>).
              </p>
            ) : null}
            <div className={cn("mt-4 grid items-center gap-6", rated.length >= 3 && "md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-8")}>
              <dl className="divide-y divide-ink-100">
                {ranked.map(({ label, value }) => (
                  <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <dt className="text-sm text-ink-700">{label}</dt>
                    {value !== null ? (
                      <dd className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-4">
                        <div className="[&>div]:mt-0 [&>div]:h-2">
                          <ScoreBar value={value} />
                        </div>
                        <span className="nums text-right text-sm">
                          <span className="text-lg font-semibold text-ink-900">{value.toFixed(1)}</span>
                          <span className="text-text-subtle">/10</span>
                        </span>
                      </dd>
                    ) : (
                      <dd className="text-sm text-text-subtle">Not rated yet</dd>
                    )}
                  </div>
                ))}
              </dl>
              {rated.length >= 3 ? (
                <div role="img" aria-label={`Scores out of 10: ${rated.map((a) => `${a.label} ${a.value.toFixed(1)}`).join(", ")}`} className="mx-auto w-full max-w-[20rem]">
                  <AxisRadar axes={axes.map((a) => ({ key: a.label, label: a.label, value: a.value }))} />
                </div>
              ) : null}
            </div>
          </>
        )}
        {showLinks ? (
          <div className={cn("mt-5 grid gap-3 border-t border-ink-100 pt-5 print:hidden", feedbackLink && recordingLink && "sm:grid-cols-2")}>
            {feedbackLink ? <LinkCard href={feedbackLink} icon={<FileText />} title="Feedback report" hint="The interviewer's written feedback" /> : null}
            {recordingLink ? <LinkCard href={recordingLink} icon={<Video />} title="Recording" hint="Watch the recorded interview" /> : null}
          </div>
        ) : null}
      </Surface>
    </section>
  );
}
