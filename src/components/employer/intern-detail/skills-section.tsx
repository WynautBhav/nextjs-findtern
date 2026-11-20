import { Check } from "lucide-react";

import { SectionHead, Surface } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

import { splitSkills } from "./profile-helpers";

const CHIP = "inline-flex min-h-8 max-w-full items-center gap-1.5 break-words rounded-full px-3 text-sm font-medium";

function Chips({ skills, matched, label }: { skills: string[]; matched: boolean; label: string }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {skills.map((skill) => (
        <li
          key={skill}
          className={cn(CHIP, matched ? "bg-brand-700 text-white" : "bg-white text-ink-700 ring-1 ring-inset ring-ink-300")}
        >
          {matched ? <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
          {skill}
        </li>
      ))}
    </ul>
  );
}

/**
 * Skills in the selected project's terms: the ones it asks for as filled chips
 * with a tick, then the rest as quiet outlines. With no project, one group.
 * The split is `splitSkills`; levels stay on the chip text as the profile stores them.
 */
export function SkillsSection({ skills, wanted, className }: { skills: string[]; wanted: { project: string; skills: string[] } | null; className?: string }) {
  if (skills.length === 0) return null;
  const hasProject = Boolean(wanted && wanted.skills.length > 0);
  const { matches, others } = splitSkills(skills, hasProject ? wanted!.skills : []);
  return (
    <section aria-labelledby="skills-h" className={className}>
      <SectionHead
        id="skills-h"
        title={hasProject ? "Skills" : `Skills (${skills.length})`}
        hint={hasProject ? `${matches.length} of ${wanted!.skills.length} match ${wanted!.project}` : undefined}
      />
      <Surface className="p-5 sm:p-6">
        {hasProject ? (
          <div className="space-y-5">
            {matches.length > 0 ? (
              <div>
                <h3 className="mb-2.5 text-sm font-semibold text-ink-900">
                  Matches {wanted!.project} <span className="nums font-medium text-ink-600">({matches.length})</span>
                </h3>
                <Chips skills={matches} matched label={`Skills that match ${wanted!.project}`} />
              </div>
            ) : (
              <p className="text-sm text-ink-600">None of their skills match {wanted!.project} yet.</p>
            )}
            {others.length > 0 ? (
              <div className={cn(matches.length > 0 && "border-t border-ink-100 pt-5")}>
                <h3 className="mb-2.5 text-sm font-semibold text-ink-900">
                  Other skills <span className="nums font-medium text-ink-600">({others.length})</span>
                </h3>
                <Chips skills={others} matched={false} label="Other skills" />
              </div>
            ) : null}
          </div>
        ) : (
          <Chips skills={skills} matched={false} label="Skills" />
        )}
      </Surface>
    </section>
  );
}
