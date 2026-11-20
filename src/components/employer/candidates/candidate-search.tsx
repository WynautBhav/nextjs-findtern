"use client";

/**
 * The Candidates search box: a combobox over skills and cities. Picking a suggestion runs the search; a skill also
 * offers "+ Require" (adds it to Required skills). The server matches skill names and city only, so that is all
 * the box suggests. `/` focuses it from anywhere on the page (unless typing in a field), Esc closes the list, then
 * clears the box, then leaves it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";

import { useProgressRouter } from "@/components/layout/navigation-progress";
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
  const router = useProgressRouter();
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
    router.push(searchHref(PATH, base, word), { scroll: false });
  }
  function require(skill: string) {
    setOpen(false);
    setHighlight(-1);
    setValue("");
    router.push(requireSkillHref(pathname, params.toString(), required, skill, hasPro), { scroll: false });
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
                  // The "+ Require" tag is part of the row but its own target.
                  if ((e.target as HTMLElement).closest("[data-require]")) require(s.label);
                  else run(s.label);
                }}
                className={rowClass(i === highlight)}
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.canRequire && !full ? (
                  <span
                    data-require
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
        run(value);
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
        Searches skill names and cities. Enter runs the search. Shift and Enter requires the highlighted skill. Names and profiles are not searched.
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
            const pick = items[highlight];
            if (e.shiftKey && pick.canRequire && !full) require(pick.label);
            else run(pick.label);
          }
        }}
        className={cn(
          "w-full rounded-apple-sm border border-ink-200 bg-ink-50 pl-11 pr-12 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm",
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
      ) : (
        <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-ink-200 bg-white px-1.5 font-sans text-xs font-medium leading-5 text-ink-500 lg:block touch:hidden">
          /
        </kbd>
      )}
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
