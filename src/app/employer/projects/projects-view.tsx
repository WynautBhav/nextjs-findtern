import { Plus } from "lucide-react";

import { PageHead } from "@/components/app/primitives";
import { TakedownBanner } from "@/components/employer/takedown-banner";
import { ButtonLink } from "@/components/ui/button";
import { countLabel } from "@/lib/projects/list-summary";
import { ProjectList, type ListProject } from "./project-list";

/**
 * The whole Projects page from rows, no data loading: page head with the count and the one primary action,
 * the takedown banner, and the list. `page.tsx` loads the rows; this renders them.
 */
export function ProjectsView({ rows }: { rows: ListProject[] }) {
  return (
    <div className="container-page section-y">
      <PageHead
        eyebrow={rows.length ? countLabel(rows.length) : undefined}
        title="Projects"
        lede="Post a project and it goes live as soon as you submit. Pause or close it any time."
        action={
          // The empty state carries its own "Post a project", so the head's button waits until there is a list.
          rows.length ? (
            <ButtonLink href="/employer/projects/new" className="max-sm:w-full">
              <Plus className="size-4" aria-hidden /> Post a project
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <TakedownBanner projects={rows.filter((r) => r.takenDown).map((r) => ({ id: r.id, name: r.projectName, reason: r.takenDownReason }))} />
        <ProjectList projects={rows} />
      </div>
    </div>
  );
}
