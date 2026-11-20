"use client";

/**
 * "Match to project" as one switch, first in the filter panel. On: the project fills the skills and city
 * (turning it on from "edited" drops the employer's own skills). Off: the project fills nothing in. The switch
 * is a button that goes to the link `projectMatchHref` builds from the current URL, so it is never a no-op.
 */

import { usePathname, useSearchParams } from "next/navigation";

import { useCandidatesGo } from "@/app/employer/candidates/_nav";
import { projectMatchHref, type ProjectMatchState } from "@/lib/project-match";
import { cn } from "@/lib/utils";

export function ProjectMatchControl({ state, projectName, hasPro, className }: { state: ProjectMatchState; projectName: string; hasPro: boolean; className?: string }) {
  const go = useCandidatesGo();
  const pathname = usePathname();
  const params = useSearchParams().toString();
  if (state === "none") return null;
  const on = state === "matched";
  const hint = state === "edited" ? "Using your own skills. Turn on to use the project's." : on ? `Skills and city from ${projectName}` : null;
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-3", className)}>
      <span className="min-w-0">
        <span id="project-match-label" className="block text-sm font-semibold text-ink-900">
          Match to project
        </span>
        {hint ? (
          <span id="project-match-hint" className="mt-0.5 block text-xs leading-4 text-text-subtle" title={hint}>
            {hint}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="project-match-label"
        aria-describedby={hint ? "project-match-hint" : undefined}
        onClick={() => go(projectMatchHref(pathname, params, on ? "stop" : "match", hasPro))}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none",
          "after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform motion-reduce:after:transition-none",
          on ? "bg-brand-700 after:translate-x-4" : "bg-ink-300",
        )}
      />
    </div>
  );
}
