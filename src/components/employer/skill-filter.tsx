"use client";

/**
 * Skill filter.
 *
 * This was ten hardcoded chips, commented as a deliberate trade-off — so the
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
import { Check, SlidersHorizontal, X } from "lucide-react";

import { suggestSkills } from "@/lib/data/skills";

export function SkillFilter({ active }: { active: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const options = query.trim() ? suggestSkills(query, 8).filter((s) => !active.includes(s)) : [];

  function hrefWith(skills: string[]) {
    const next = new URLSearchParams(params.toString());
    if (skills.length === 0) next.delete("skills");
    else next.set("skills", skills.join(","));
    next.delete("page"); // A new filter starts at page one.
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function add(skill: string) {
    if (active.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    router.push(hrefWith([...active, skill]));
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span className="text-xs font-medium text-ink-700">Skills</span>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="Search 2,482 skills"
            aria-label="Search skills to filter by"
            className="h-8 w-full rounded-full border border-ink-200 bg-white px-3.5 text-xs text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
          />
          {open && options.length > 0 ? (
            <ul className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
              {options.map((skill) => (
                <li key={skill}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(skill);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-ink-800 transition-colors hover:bg-ink-50"
                  >
                    {skill}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {active.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {active.map((skill) => (
            <li key={skill}>
              <Link
                href={hrefWith(active.filter((s) => s !== skill))}
                className="inline-flex items-center gap-1 rounded-full border border-brand-700 bg-brand-700 px-3 py-1 text-2xs font-medium text-white transition-colors hover:bg-brand-600"
              >
                {skill}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove filter</span>
              </Link>
            </li>
          ))}
          {active.length > 1 ? (
            <li>
              <Link
                href={hrefWith([])}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-medium text-ink-600 underline-offset-4 hover:underline"
              >
                <Check className="size-3" aria-hidden />
                Clear
              </Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-2 text-2xs text-ink-500">
          No skill filter. Search the full vocabulary — it is the same list candidates pick from.
        </p>
      )}
    </div>
  );
}