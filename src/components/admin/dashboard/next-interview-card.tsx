import { CalendarClock, Plus, Video } from "lucide-react";
import Link from "next/link";

import { AdminAvatar } from "@/components/admin/avatar";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { untilWhen, type NextInterview } from "@/lib/admin/dashboard-overview-pure";
import { cn } from "@/lib/utils";

/**
 * The soonest booked interview (candidate, company, India time, how far off) with the one action that
 * matters: join it when a meeting link exists, else add the link. `interview` is `undefined` when none
 * is booked (an empty state that says what fills it) and `null` when the read failed.
 */
export function NextInterviewCard({
  interview,
  trackerHref,
  now,
}: {
  interview: NextInterview | null | undefined;
  /** The interviews tab of the pipeline; null when this admin may not open it. */
  trackerHref: string | null;
  now: Date;
}) {
  const until = interview ? untilWhen(new Date(interview.whenIso), now) : null;
  const [day, ...rest] = interview ? interview.whenLabel.split(", ") : [];
  return (
    <Panel aria-labelledby="next-interview-title">
      <PanelHeader title={<span id="next-interview-title">Next interview</span>} linkHref={trackerHref && interview ? trackerHref : undefined} linkLabel="Open interviews" />
      <PanelBody className="pt-3">
        {interview ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AdminAvatar name={interview.candidate} id={interview.internId} size="md" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold leading-5 text-foreground" title={interview.candidate}>{interview.candidate}</p>
                <p className="truncate text-sm leading-5 text-text-subtle" title={interview.company}>{interview.company}</p>
              </div>
            </div>
            <time dateTime={interview.whenIso} className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--admin-panel-2)] px-4 py-3">
              <span>
                <span className="block text-xl font-semibold leading-6 tracking-tight text-foreground">{day}</span>
                <span className="block text-sm text-text-subtle">{rest.join(", ")}</span>
              </span>
              {until ? <span className="rounded-full bg-[color:var(--admin-bar-tint)] px-2.5 py-1 text-xs font-semibold text-brand-900">{until}</span> : null}
            </time>
            {interview.joinHref ? (
              <ButtonAnchor href={interview.joinHref} target="_blank" rel="noopener noreferrer" variant="primary" size="md" className={cn(ADMIN_PILL_PRIMARY, "w-full")}>
                <Video className="size-4" aria-hidden />
                Join meeting<span className="sr-only"> with {interview.candidate} (opens in a new tab)</span>
              </ButtonAnchor>
            ) : trackerHref ? (
              <ButtonLink href={trackerHref} variant="outline" size="md" className={cn(ADMIN_PILL_SECONDARY, "w-full")}>
                <Plus className="size-4" aria-hidden />
                Add link<span className="sr-only"> for {interview.candidate}</span>
              </ButtonLink>
            ) : (
              <p className="text-sm text-text-subtle">No meeting link yet.</p>
            )}
          </div>
        ) : interview === null ? (
          <p role="alert" className="text-sm text-foreground">
            Couldn&apos;t load the next interview. Nothing was changed; reload to try again.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[color:var(--admin-bar-tint)] text-brand-900">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-5 text-foreground">No interviews booked</p>
              <p className="mt-0.5 text-sm leading-5 text-text-subtle">
                The soonest slot an employer books lands here.
                {trackerHref ? (
                  <>
                    {" "}
                    <Link href={trackerHref} className="font-medium text-foreground underline underline-offset-4">Open interviews</Link>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
