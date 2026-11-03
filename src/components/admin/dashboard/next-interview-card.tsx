import { Plus, Video } from "lucide-react";

import { AdminAvatar } from "@/components/admin/avatar";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import type { NextInterview } from "@/lib/admin/dashboard-overview-pure";
import { cn } from "@/lib/utils";

/**
 * The soonest booked interview (candidate, company, India time) with the one action that matters: join
 * it when a meeting link exists, else add the link. `interview` is `undefined` when none is booked (said
 * plainly) and `null` when the read failed.
 */
export function NextInterviewCard({
  interview,
  trackerHref,
}: {
  interview: NextInterview | null | undefined;
  /** The interviews tab of the pipeline; null when this admin may not open it. */
  trackerHref: string | null;
}) {
  return (
    <Panel className="flex h-full flex-col" aria-labelledby="next-interview-title">
      <PanelHeader title={<span id="next-interview-title">Next interview</span>} linkHref={trackerHref ?? undefined} linkLabel="Open interviews" />
      <PanelBody className="flex flex-1 flex-col">
        {interview ? (
          <div className="flex flex-1 flex-col gap-5">
            <div className="flex items-center gap-3">
              <AdminAvatar name={interview.candidate} id={interview.internId} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold leading-6 text-foreground" title={interview.candidate}>
                  {interview.candidate}
                </p>
                <p className="truncate text-sm leading-5 text-text-subtle" title={interview.company}>
                  {interview.company}
                </p>
              </div>
            </div>
            <time dateTime={interview.whenIso} className="block">
              <span className="block text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {interview.whenLabel.split(", ")[0]}
              </span>
              <span className="mt-1 block text-base text-text-subtle">{interview.whenLabel.split(", ").slice(1).join(", ")}</span>
            </time>
            <div className="mt-auto">
              {interview.joinHref ? (
                <ButtonAnchor
                  href={interview.joinHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="primary"
                  size="md"
                  className={cn(ADMIN_PILL_PRIMARY, "w-full sm:w-auto")}
                >
                  <Video className="size-4" aria-hidden />
                  Join meeting<span className="sr-only"> with {interview.candidate} (opens in a new tab)</span>
                </ButtonAnchor>
              ) : trackerHref ? (
                <ButtonLink href={trackerHref} variant="outline" size="md" className={cn(ADMIN_PILL_SECONDARY, "w-full sm:w-auto")}>
                  <Plus className="size-4" aria-hidden />
                  Add link<span className="sr-only"> for {interview.candidate}</span>
                </ButtonLink>
              ) : (
                <p className="text-sm text-text-subtle">No meeting link yet.</p>
              )}
            </div>
          </div>
        ) : interview === null ? (
          <p role="alert" className="text-sm text-foreground">
            Couldn&apos;t load the next interview. Nothing was changed; reload to try again.
          </p>
        ) : (
          <div>
            <p className="text-base font-semibold text-foreground">No interviews booked</p>
            <p className="mt-1 text-sm leading-relaxed text-text-subtle">
              When an employer books a slot with a candidate, the soonest one shows up here.
            </p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
