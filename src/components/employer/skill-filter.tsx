"use client";

/**
 * Skill filter.
 *
 * This was ten hardcoded chips, commented as a deliberate trade-off - so the
 * filter could not express anything outside that list, and a role in Rust or R
 * was unfilterable. Now that the shared 2,482-skill vocabulary exists
 * (`src/lib/data/skills.ts`) the trade-off is gone, but it cannot go back as
 * chips: 2,482 links is a wall of HTML.
 *
 * So it is a combobox that filters the vocabulary as you type and pushes the
 * result into the URL. Pushing rather than submitting matters: the candidate
 * list carries search, city, mode, score band, sorting and pagination in its
 * params, and a skill picked through a plain form submit would drop all of it.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, Search, X } from "lucide-react";

import { suggestSkills } from "@/lib/data/skills";

const MAX_SKILLS = 7;

export function SkillFilter({
  active,
  projectSkills = [],
  fromProject = false,
}: {
  /** The skills the list is filtered by right now. */
  active: string[];
  projectSkills?: string[];
  /** `active` is the selected project's own skill list (nothing picked yet). */
  fromProject?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const full = active.length >= MAX_SKILLS;

  const typed = query.trim();
  const options = typed ? suggestSkills(typed, 8).filter((s) => !active.includes(s)) : [];
  // Legacy let an employer add a skill outside the list ("Add "X" (Press Enter)").
  const custom = typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase()) ? typed : null;

  /**
   * `skills` in the URL - even empty - is the employer's own pick and wins
   * over the project's list; `null` drops it so the project's skills apply.
   */
  function hrefWith(skills: string[] | null) {
    const next = new URLSearchParams(params.toString());
    if (skills === null) next.delete("skills");
    else next.set("skills", skills.join(","));
    next.delete("page"); // A new filter starts at page one.
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function add(skill: string) {
    if (full || active.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    router.push(hrefWith([...active, skill]), { scroll: false });
    setQuery("");
    setOpen(false);
  }

  return (
    <section aria-labelledby="skills-heading" className="mb-5">
      <h2 id="skills-heading" className="mb-3 text-base font-semibold tracking-[-0.01em] text-ink-900">
        Select Required Skills
      </h2>
      <div className="flex flex-col gap-3 rounded-[14px] border border-ink-200/80 bg-white p-3 sm:p-4 md:flex-row md:items-start">
        <ul className="flex min-w-0 flex-1 flex-wrap gap-2" aria-label="Selected skills">
          {active.map((skill) => (
            <li key={skill}>
              <Link
                href={hrefWith(active.filter((s) => s !== skill))}
                scroll={false}
                className="apple-spring inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:border-brand-300 hover:bg-brand-100"
              >
                {skill}
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">Remove {skill}</span>
              </Link>
            </li>
          ))}
          {active.length === 0 ? (
            <li className="flex min-h-9 items-center gap-3 text-sm text-text-subtle">
              No skills selected.
              {projectSkills.length > 0 ? (
                <Link
                  href={hrefWith(null)}
                  scroll={false}
                  className="inline-flex min-h-9 items-center gap-1 font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  <Check className="size-3.5" aria-hidden />
                  Restore project skills
                </Link>
              ) : null}
            </li>
          ) : null}
        </ul>

        <div className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="text"
            value={query}
            disabled={full}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed) {
                e.preventDefault();
                add(options[0] ?? typed);
              }
            }}
            placeholder={full ? `${MAX_SKILLS} skills max` : "Search & add skills…"}
            aria-label="Search skills to filter by"
            className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-ink-50 pl-9 pr-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
          />
          {open && (options.length > 0 || custom) ? (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-[10px] border border-ink-200 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              {options.map((skill) => (
                <li key={skill}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(skill);
                    }}
                    className="apple-spring flex min-h-11 w-full items-center px-3 py-1.5 text-left text-[13px] text-ink-800 hover:bg-brand-50"
                  >
                    {skill}
                  </button>
                </li>
              ))}
              {custom ? (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(custom);
                    }}
                    className="apple-spring flex min-h-11 w-full items-center gap-1.5 px-3 py-1.5 text-left text-[13px] text-brand-700 hover:bg-brand-50"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add &ldquo;{custom}&rdquo; (Press Enter)
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
        <span>
          {fromProject ? "Skills from the selected project. " : ""}Up to {MAX_SKILLS}. Candidates with any of them are
          shown; more matches rank higher.
        </span>
        {!fromProject && active.length > 0 && projectSkills.length > 0 && !sameSkills(active, projectSkills) ? (
          <Link href={hrefWith(null)} scroll={false} className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Restore project skills
          </Link>
        ) : null}
      </p>
    </section>
  );
}

function sameSkills(a: string[], b: string[]): boolean {
  const key = (list: string[]) => list.map((s) => s.toLowerCase()).sort().join("|");
  return key(a) === key(b.slice(0, MAX_SKILLS));
}
