"use client";

/**
 * One control for how the selected project fills the list, in place of three underlined links. Every state says,
 * in visible text, what it does; every button builds its link from the current URL, so none is a no-op.
 */

import Link from "@/app/employer/candidates/_link";
import { usePathname, useSearchParams } from "next/navigation";
import { Link2, RotateCcw, Unlink } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { projectMatchHref, type ProjectMatchState } from "@/lib/project-match";
import { cn } from "@/lib/utils";

export function ProjectMatchControl({ state, projectName, hasPro, className }: { state: ProjectMatchState; projectName: string; hasPro: boolean; className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams().toString();
  if (state === "none") return null;
  const name = <span className="max-w-[16rem] truncate" title={projectName}>{projectName}</span>;
  const button = buttonClass({ variant: "outline", size: "sm", className: "min-h-9 gap-1.5" });
  const help = "min-w-0 text-[13px] leading-5 text-ink-600";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {state === "matched" ? (
        <>
          <span className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg bg-brand-50 px-3 text-[13px] font-medium text-brand-900 ring-1 ring-inset ring-brand-200 touch:h-11">
            <Link2 className="size-3.5 shrink-0" aria-hidden />
            Matched to {name}
          </span>
          <Link href={projectMatchHref(pathname, params, "stop", hasPro)} scroll={false} className={button}>
            <Unlink className="size-3.5" aria-hidden />
            Stop matching
          </Link>
          <p className={help}>Skills and city come from the project. Stopping clears both and uses the default remote setting.</p>
        </>
      ) : state === "edited" ? (
        <>
          <Link href={projectMatchHref(pathname, params, "match", hasPro)} scroll={false} className={button}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset to project skills
          </Link>
          <p className={help}>You chose your own skills, so {name} does not set them. Resetting brings its skills back.</p>
        </>
      ) : (
        <>
          <Link href={projectMatchHref(pathname, params, "match", hasPro)} scroll={false} className={button}>
            <Link2 className="size-3.5" aria-hidden />
            Match to {name}
          </Link>
          <p className={help}>Matching is off. Turning it on fills in the project&rsquo;s skills and city and clears the skills you picked.</p>
        </>
      )}
    </div>
  );
}
