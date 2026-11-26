"use client";

/**
 * The Candidates search box: a combobox over skills and cities. Choosing a skill (a click anywhere on its row, Enter,
 * or its "+ Require" tag) adds it to the required skills; choosing a city searches it. The server matches skill names and city only, so that is all
 * the box suggests. `/` focuses it from anywhere on the page (unless typing in a field), Esc closes the list, then
 * clears the box, then leaves it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";

import { useCandidatesGo } from "@/app/employer/candidates/_nav";
import { arrowKey } from "@/components/employer/skill-combobox";
import { suggestSkills } from "@/lib/data/skills";
import { suggestDistricts } from "@/lib/data/districts";
import { rankSuggestions, searchHref, type Suggestion } from "@/lib/candidate-suggest";
import { MAX_SKILLS } from "@/lib/onboarding";
import { requireSkillHref } from "@/lib/skill-filter-href";
import { cn } from "@/lib/utils";

const PATH = "/employer/candidates";

function typing(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function CandidateSearch({
  id = "candidate-search",
  q,
  base,
  required,
  hasPro,
  compact = false,
  className,
}: {
  id?: string;
  /** The keyword in the URL. */
  q: string;
  /** The current filters as a query string, without `q` and the page. */
  base: string;
  /** The skills the list is filtered by now. */
  required: string[];
  hasPro: boolean;
  /** The slim sticky bar's smaller box. */
  compact?: boolean;
  className?: string;
}) {
  const go = useCandidatesGo();
  const pathname = usePathname();
  const params = useSearchParams();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(q);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // A new keyword from the server (a pick, a clear, a link) replaces what is in the box.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setValue(q);
  }

  const typed = value.trim();
  const found = typed
    ? rankSuggestions(
        suggestSkills(typed, 8),
        suggestDistricts(typed, 24).map((d) => d.district).filter((d) => d.toLowerCase().includes(typed.toLowerCase())),
        { required },
      )
    : { skills: [], cities: [], all: [] as Suggestion[] };
  const items = open ? found.all : [];
  const full = required.length >= MAX_SKILLS;

  // `/` focuses the box that is on screen: the slim sticky bar's while it shows, else the toolbar's.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = input.current;
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !el) return;
      if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === "hidden") return;
      e.preventDefault();
      el.focus();
      el.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function run(word: string) {
    setOpen(false);
    setHighlight(-1);
    go(searchHref(PATH, base, word));
  }
  function require(skill: string) {
    setOpen(false);
    setHighlight(-1);
    setValue("");
    // Filters only; the skill row's "Save to project" puts it on the project (bug sheet 25 Nov).
    go(requireSkillHref(pathname, params.toString(), required, skill, hasPro));
  }
  /** A skill row requires the skill (click, Enter or "+ Require" alike); a city row, or a skill already required, searches. */
  function pick(s: Suggestion) {
    if (s.canRequire && !full) require(s.label);
    else run(s.label);
  }
  function clear() {
    setValue("");
    setOpen(false);
    input.current?.focus();
    if (q) run("");
  }

  const hidden = Array.from(new URLSearchParams(base).entries());
  const rowClass = (on: boolean) => cn("flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-50", on && "bg-ink-100");
  let at = -1;
  const group = (title: string, list: Suggestion[]) =>
    list.length === 0 ? null : (
      <li role="presentation">
        <ul role="group" aria-labelledby={`${listId}-${title}`}>
          <li role="presentation" id={`${listId}-${title}`} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
            {title}
          </li>
          {list.map((s) => {
            const i = ++at;
            return (
              <li
                key={`${s.kind}-${s.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={rowClass(i === highlight)}
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.canRequire && !full ? (
                  <span
                    aria-hidden
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] font-medium text-ink-800 hover:border-ink-400 touch:h-11"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Require
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </li>
    );

  return (
    <form
      method="get"
      action={PATH}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        // Enter with nothing highlighted: the typed skill (or, failing an exact name, the top skill suggestion) is required.
        const skills = found.all.filter((s) => s.canRequire);
        const hit = skills.find((s) => s.label.toLowerCase() === typed.toLowerCase()) ?? (found.all[0]?.canRequire ? found.all[0] : undefined);
        if (hit && !full) require(hit.label);
        else run(value);
      }}
      className={cn("relative min-w-0", className)}
    >
      {hidden.map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">
        Search skills or cities
      </label>
      <p id={`${listId}-note`} className="sr-only">
        Searches skill names and cities. Choosing a skill, by click or Enter, adds it to the required skills; choosing a city searches it. Names and profiles are not searched.
      </p>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-500" aria-hidden />
      <input
        ref={input}
        id={id}
        name="q"
        type="text"
        role="combobox"
        value={value}
        autoComplete="off"
        maxLength={60}
        aria-expanded={items.length > 0}
        aria-controls={items.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-describedby={`${listId}-note`}
        aria-keyshortcuts="/"
        aria-activedescendant={highlight >= 0 && items[highlight] ? `${listId}-${highlight}` : undefined}
        placeholder="Search skills or cities"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          const arrow = arrowKey(e.key, { open: items.length > 0, count: found.all.length, highlight });
          if (arrow) {
            e.preventDefault();
            setOpen(arrow.open);
            setHighlight(arrow.highlight);
          } else if (e.key === "Escape") {
            if (items.length > 0) {
              setOpen(false);
              setHighlight(-1);
            } else if (value) setValue("");
            else input.current?.blur();
          } else if (e.key === "Enter" && highlight >= 0 && items[highlight]) {
            e.preventDefault();
            pick(items[highlight]);
          }
        }}
        className={cn(
          "w-full rounded-apple-sm border border-ink-200 bg-ink-50 pl-11 pr-11 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm",
          compact ? "h-10 touch:h-11" : "h-11 lg:h-12",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className={cn(
            "absolute right-0.5 top-1/2 grid -translate-y-1/2 place-items-center rounded-apple-sm text-ink-500 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500",
            compact ? "size-9 touch:size-11" : "size-11",
          )}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {open && typed ? `${found.all.length} suggestion${found.all.length === 1 ? "" : "s"}` : ""}
      </p>
      {items.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          // The scrollbar and padding are part of the list: a press there must not blur the input and close it.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-full z-30 mt-1 max-h-80 w-full min-w-[18rem] overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-lg"
        >
          {group("Skills", found.skills)}
          {group("Cities", found.cities)}
        </ul>
      ) : null}
    </form>
  );
}
