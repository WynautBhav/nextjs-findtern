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

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, X } from "lucide-react";

import { suggestSkills } from "@/lib/data/skills";
import { MAX_SKILLS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const MAX_SKILLS = 7;

export function SkillFilter({
  active,
  projectSkills = [],
  fromProject = false,
  title = "Required skills",
  note,
  className,
  children,
}: {
  /** The skills the list is filtered by right now. */
  active: string[];
  projectSkills?: string[];
  /** `active` is the selected project's own skill list (nothing picked yet). */
  fromProject?: boolean;
  /** Heading over the chips. */
  title?: string;
  /** Replaces the line under the chips that explains how they filter. */
  note?: string;
  className?: string;
  /** Trailing quiet links (e.g. "Show everyone"). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  // "Add skill" opens the inline box; it closes again when left empty.
  const [adding, setAdding] = useState(false);
  const full = active.length >= MAX_SKILLS;

  const typed = query.trim();
  const options = typed ? suggestSkills(typed, 8).filter((s) => !active.includes(s)) : [];
  // Legacy let an employer add a skill outside the list ("Add "X" (Press Enter)").
  const custom = typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase()) ? typed : null;
  // What the arrow keys walk: the suggestions, then the "Add …" row.
  const items = open ? (custom ? [...options, custom] : options) : [];

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
    setHighlight(-1);
  }

  const showAdd = adding || query.length > 0;
  const restore = !fromProject && active.length > 0 && projectSkills.length > 0 && !sameSkills(active, projectSkills);

  return (
    <section aria-labelledby="skills-heading" className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0", className)}>
      <h2 id="skills-heading" className="mr-1 text-[13px] font-medium text-ink-600 max-sm:sr-only">
        {title}
      </h2>
      <p id={`${listId}-note`} className="sr-only">
        {fromProject ? "Skills from the selected project. " : ""}
        {note ?? `Up to ${MAX_SKILLS}. Candidates with any of them are shown; more matches rank higher.`}
      </p>
      <ul className="contents" aria-label="Selected skills">
        {active.map((skill) => (
          <li key={skill}>
            <Link
              href={hrefWith(active.filter((s) => s !== skill))}
              scroll={false}
              className="group inline-flex min-h-9 items-center outline-none touch:min-h-11"
            >
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-100 pl-2.5 pr-1.5 text-[13px] font-medium text-brand-900 transition-colors group-hover:bg-brand-200 group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
                {skill}
                <X className="size-3.5 text-brand-800/70" aria-hidden />
              </span>
              <span className="sr-only">Remove {skill}</span>
            </Link>
          </li>
        ))}
        {active.length === 0 ? <li className="inline-flex min-h-9 items-center text-[13px] text-text-subtle">None</li> : null}
      </ul>

      {full ? null : showAdd ? (
        <div className="relative w-56">
          <input
            type="text"
            value={query}
            autoFocus={adding}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={items.length > 0 ? listId : undefined}
            aria-autocomplete="list"
            aria-describedby={`${listId}-note`}
            aria-activedescendant={highlight >= 0 && items[highlight] ? `${listId}-${highlight}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() =>
              window.setTimeout(() => {
                setOpen(false);
                if (!query) setAdding(false);
              }, 120)
            }
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setHighlight((i) => (i < 0 && step < 0 ? items.length - 1 : (i + step + items.length) % items.length));
              } else if (e.key === "Escape") {
                setOpen(false);
                setHighlight(-1);
                if (!query) setAdding(false);
              } else if (e.key === "Enter" && typed) {
                e.preventDefault();
                add(highlight >= 0 && items[highlight] ? items[highlight] : (options[0] ?? typed));
              }
            }}
            placeholder="Type a skill…"
            aria-label="Add a required skill"
            className="h-9 w-full rounded-full border border-ink-200 bg-white px-3.5 text-base text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm touch:h-11"
          />
          {open && (options.length > 0 || custom) ? (
            <ul id={listId} role="listbox" aria-label="Skill suggestions" className="absolute left-0 z-30 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
              {options.map((skill, i) => (
                <li
                  key={skill}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(skill);
                  }}
                  className={cn("flex min-h-11 cursor-pointer items-center px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-50", i === highlight && "bg-ink-100")}
                >
                  {skill}
                </li>
              ))}
              {custom ? (
                <li
                  id={`${listId}-${options.length}`}
                  role="option"
                  aria-selected={highlight === options.length}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(custom);
                  }}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-50", highlight === options.length && "bg-ink-100")}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add &ldquo;{custom}&rdquo; (Press Enter)
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="group inline-flex min-h-9 items-center outline-none touch:min-h-11"
        >
          <span className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium border border-dashed border-ink-300 text-ink-700 transition-colors group-hover:border-ink-400 group-hover:text-ink-900 group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
            <Plus className="size-3.5" aria-hidden />
            Add skill
          </span>
        </button>
      )}

      {active.length === 0 && projectSkills.length > 0 ? (
        <Link href={hrefWith(null)} scroll={false} className="inline-flex min-h-9 items-center px-1.5 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11">
          <Check className="mr-1 size-3.5" aria-hidden />
          Restore project skills
        </Link>
      ) : restore ? (
        <Link href={hrefWith(null)} scroll={false} className="inline-flex min-h-9 items-center px-1.5 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11">
          Restore project skills
        </Link>
      ) : null}
      {children}
    </section>
  );
}

function sameSkills(a: string[], b: string[]): boolean {
  const key = (list: string[]) => list.map((s) => s.toLowerCase()).sort().join("|");
  return key(a) === key(b.slice(0, MAX_SKILLS));
}
