import Link from "@/app/employer/candidates/_link";
import { ChevronRight, FunnelX, X } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { rankRelaxations, skillBaseName } from "@/components/employer/candidate-view";
import { cn } from "@/lib/utils";
import { resetHref, titleCase, type CandidatesData, type Filters } from "@/lib/candidates-params";
import { relaxFixes } from "@/lib/candidates-relax";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The skills as a predicate for the headline. A candidate needs just one of the required skills, so several read "any of the 4 skills". */
function skillClause(skills: string[]): string {
  return skills.length === 1 ? `have ${skillBaseName(skills[0])}` : `have any of the ${skills.length} skills`;
}

/** The headline and the plain-language cause, by the likeliest culprit. */
function reason(data: CandidatesData, filters: Filters): { title: string; body: string } {
  const skills = data.effectiveSkills.length > 0 ? skillClause(data.effectiveSkills) : "";
  if (filters.cgpaMin > 0 || filters.cgpaVerified || filters.colleges.length > 0) {
    return {
      title: "No candidates match your CGPA or college filters",
      body:
        data.pro.hiddenNoScore > 0
          ? `${plural(data.pro.hiddenNoScore, "candidate")} ${data.pro.hiddenNoScore === 1 ? "was" : "were"} left out for having no score. Lower the minimum CGPA, turn off verified only or choose more colleges.`
          : "Lower the minimum CGPA, turn off verified only or choose more colleges.",
    };
  }
  if (data.cityList.length > 0) {
    const cities = data.cityList.map(titleCase).join(", ");
    return {
      title: `No candidates in ${cities}${skills ? ` ${skills}` : ""}`,
      body: data.includeRemote
        ? `Nobody in the pool has picked ${cities} as a place to work yet.`
        : `Nobody in the pool has picked ${cities} as a place to work yet, and candidates who only work remotely are left out.`,
    };
  }
  if (filters.q) {
    return {
      title: `No candidates match \u201c${filters.q}\u201d`,
      body: "Search looks at skills and cities, for example React or Pune. Names and profiles are not searched.",
    };
  }
  if (skills) {
    return { title: `No candidates ${skills}`, body: "Nobody in the pool lists these skills with your current filters." };
  }
  return {
    title: "No candidates match",
    body: "Lower a score floor, drop a skill or turn on remote candidates. New interns join the pool as soon as their AI interview is scored.",
  };
}

/**
 * Nothing matched. Says why in plain words, recaps the search as chips that each remove one condition, then lists up to four
 * one-click fixes ranked by how many candidates each would return (`data.relaxCounts`, counted by `_relax.ts` for this page
 * only). A fix that would return nobody is not offered; with no counts the fixes show without numbers. Every link is plain.
 */
export function ZeroResults({ data, filters }: { data: CandidatesData; filters: Filters }) {
  const { title, body } = reason(data, filters);
  const fixes = relaxFixes(data, filters);
  const hrefOf = new Map(fixes.map((f) => [f.id, f.href]));
  const chips = fixes.filter((f) => f.chip !== null);
  const ranked = rankRelaxations(fixes, data.relaxCounts);
  const resetCount = data.relaxCounts?.reset;
  const counted = data.relaxCounts !== null;
  return (
    <section aria-labelledby="zero-heading" className={`${SURFACE_CLASS} mt-2 p-5 sm:p-8`}>
      <div className="max-w-2xl">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <FunnelX className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="zero-heading" className="text-balance text-lg font-semibold leading-7 text-ink-900 sm:text-xl">
              {title}
            </h2>
            <p className="mt-1 text-pretty text-sm leading-6 text-ink-700">{body}</p>
          </div>
        </div>

        {chips.length > 0 ? (
          <div className="mt-6">
            <h3 id="zero-search" className="text-sm font-semibold text-ink-900">
              Your search
            </h3>
            <ul aria-labelledby="zero-search" className="mt-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <li key={c.id} className="max-w-full">
                  <Link
                    href={hrefOf.get(c.id) ?? "#"}
                    scroll={false}
                    className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-ink-300 bg-white py-1.5 pl-4 pr-3 text-sm text-ink-900 outline-none transition-[background-color,border-color,transform] duration-150 hover:border-ink-500 hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.97]"
                  >
                    <span className="min-w-0 break-words">
                      <span className="sr-only">Remove </span>
                      {c.chip}
                    </span>
                    <X className="size-4 shrink-0 text-ink-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ranked.length > 0 ? (
          <div className="mt-6">
            <h3 id="zero-try" className="text-sm font-semibold text-ink-900">
              Try one of these
            </h3>
            <ul aria-labelledby="zero-try" className="mt-2 grid gap-2">
              {ranked.map((o) => (
                <li key={o.id}>
                  <Link
                    href={o.href}
                    scroll={false}
                    className={buttonClass({
                      variant: "outline",
                      size: "md",
                      className: cn(
                        "h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-4 py-2.5 text-left text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                        o.recommended && "border-brand-600 bg-brand-50",
                      ),
                    })}
                  >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{o.label}</span>
                      {o.recommended ? <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold leading-4 text-white">Recommended</span> : null}
                    </span>
                    {o.count !== null ? <span className="nums shrink-0 text-sm font-medium text-ink-800">{plural(o.count, "candidate")}</span> : null}
                    <ChevronRight className="size-4 text-ink-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : counted && fixes.length > 0 ? (
          <p className="mt-6 text-sm leading-6 text-ink-700">Widening any one thing still leaves nobody right now. New interns join the pool as soon as their AI interview is scored.</p>
        ) : null}

        <div className="mt-6 border-t border-ink-100 pt-5">
          <Link href={resetHref(data.activeProjectId)} scroll={false} className={buttonClass({ variant: "outline", size: "md", className: "w-full text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-auto" })}>
            Reset all filters
            {typeof resetCount === "number" && resetCount > 0 ? <span className="nums font-normal text-ink-700">· {plural(resetCount, "candidate")}</span> : null}
          </Link>
        </div>
      </div>
    </section>
  );
}
